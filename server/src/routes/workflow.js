import { Router } from 'express';
import { withSite } from '../db.js';
import { canDo, guard, h, HttpError, rateLimit } from '../core.js';
import { fieldsFor, serialize, validateInput, withCalculated } from '../entities.js';
import { hasModule, moduleConfig, roleAtLeast } from '../../../shared/registry.js';
import { changeStock } from './inventory.js';
import { queueSms, flush, trackLink, last10, EVENT_LABEL } from '../notify.js';

/* =============================== helpers =============================== */

export const reqLabel = (cfg, row) => `${cfg.numberPrefix || 'REQ'}-${String(row.req_no).padStart(4, '0')}`;

export function assignmentStatus(a) {
  const remaining = Number(a.qty) - Number(a.qty_consumed) - Number(a.qty_returned);
  if (remaining <= 0.0000001) return Number(a.qty_returned) > 0 ? 'closed' : 'consumed';
  return Number(a.qty_consumed) > 0 || Number(a.qty_returned) > 0 ? 'partial' : 'issued';
}

/**
 * Issue stock against an approved request. ONE transaction: lock request -> lock item -> check -> decrement
 * -> movement -> assignment -> request status. If any step fails the whole thing rolls back, so inventory
 * can never be left half-updated. UNIQUE (site_id, request_id) makes a double-assign impossible even under races.
 */
export async function issueAssignment(repo, { requestId, qty, assignedTo, assigneeId, data = {}, actorId, allowPartial = true }) {
  const request = await repo.get('requests', requestId, { forUpdate: true });
  if (!request) throw new HttpError(404, 'Request not found.');
  if (request.status !== 'approved') throw new HttpError(409, `Only approved requests can be issued (this one is ${request.status}).`, 'wrong_status');
  if (!request.item_id) throw new HttpError(422, 'This request has no component selected, so there is nothing to issue.', 'no_item');
  const issueQty = qty == null ? Number(request.qty) : Number(qty);
  if (issueQty <= 0) throw new HttpError(422, 'Qty must be greater than zero.', 'validation_failed');
  if (issueQty > Number(request.qty)) throw new HttpError(422, `Cannot issue more than requested (${request.qty}).`, 'validation_failed');
  if (!allowPartial && issueQty !== Number(request.qty)) throw new HttpError(422, `This site issues the full requested qty (${request.qty}).`, 'validation_failed');
  const existing = await repo.findOne('assignments', { request_id: request.id });
  if (existing) throw new HttpError(409, 'This request has already been issued.', 'already_assigned');

  const asgNo = await repo.nextNo('assignment');
  const asg = await repo.insert('assignments', {
    asg_no: asgNo, request_id: request.id, item_id: request.item_id, qty: issueQty, assigned_to: assignedTo,
    assignee_id: assigneeId || null, data, created_by: actorId,
  });
  await changeStock(repo, request.item_id, -issueQty, 'assignment', { type: 'assignment', id: asg.id }, actorId);
  await repo.update('requests', request.id, { status: 'assigned', updated_at: new Date().toISOString() });
  await repo.audit(actorId, 'issue', 'assignment', asg.id, { request_id: request.id, qty: issueQty });
  return asg;
}

/* =============================== requests =============================== */

const REQ_SQL = `
  SELECT r.*, u.name AS requester_name, i.sku AS item_sku, i.name AS item_name, i.qty AS item_stock
  FROM requests r
  LEFT JOIN users u ON u.id = r.requester_id
  LEFT JOIN inventory_items i ON i.site_id = r.site_id AND i.id = r.item_id`;

function shapeRequest(req, fields, row, approvals) {
  const cfg = moduleConfig(req.config, 'request');
  return { ...serialize(fields, row), label: reqLabel(cfg, row), ...(approvals ? { approvals: approvals.filter((a) => a.request_id === row.id) } : {}) };
}

async function createRequest(req, userId, { isPublic = false } = {}) {
  const fields = fieldsFor(req.config, 'requests');
  const body = { ...(req.body || {}) };
  if (isPublic) delete body.item_id;
  const { core, data } = validateInput(fields, body);
  const cfg = moduleConfig(req.config, 'request');
  const approvalOn = hasModule(req.config, 'approval');
  const levels = approvalOn ? moduleConfig(req.config, 'approval').levels || [] : [];
  const out = await withSite(req.site.id, async (t, repo) => {
    if (core.item_id) {
      if (!hasModule(req.config, 'inventory')) throw new HttpError(422, 'This site has no inventory to request from.', 'validation_failed');
      if (!(await repo.get('inventory_items', core.item_id))) throw new HttpError(422, 'That component does not exist on this site.', 'validation_failed', { errors: [{ field: 'item_id', message: 'Unknown component' }] });
    }
    const reqNo = await repo.nextNo('request');
    const calc = withCalculated(fields, { ...core, ...data });
    const row = await repo.insert('requests', { req_no: reqNo, ...core, data: { ...data, ...calc }, status: approvalOn ? 'pending' : 'approved', requester_id: userId });
    for (const [i, l] of levels.entries()) await repo.insert('approvals', { request_id: row.id, level: i + 1, role: l.role, label: l.label || `Level ${i + 1}` });
    await repo.audit(userId, isPublic ? 'public_intake' : 'create', 'request', row.id, {});
    await queueSms(repo, req.config, row, 'received', { actorId: userId });
    return { row, cfg };
  });
  await flush(req.site.id); // sends after the request is safely committed
  return out;
}

export const requestsRouter = Router({ mergeParams: true });
const R = requestsRouter;

R.get('/', guard('request', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'requests');
  const all = canDo(req, 'request', 'listAll');
  const status = req.query.status ? String(req.query.status) : null;
  const rows = await withSite(req.site.id, async (t) => {
    const reqs = await t.rows(`${REQ_SQL} WHERE r.site_id = $1 AND ($2::text IS NULL OR r.status = $2) AND ($3::boolean OR r.requester_id = $4) ORDER BY r.id DESC LIMIT 1000`,
      [req.site.id, status, all, req.user.id]);
    const ids = reqs.map((x) => x.id);
    const appr = ids.length ? await t.rows(`SELECT a.*, u.name AS decided_by_name FROM approvals a LEFT JOIN users u ON u.id = a.decided_by WHERE a.site_id = $1 AND a.request_id = ANY($2::int[]) ORDER BY a.level`, [req.site.id, ids]) : [];
    return { reqs, appr };
  });
  res.json(rows.reqs.map((x) => shapeRequest(req, fields, x, rows.appr)));
}));

R.post('/', guard('request', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'requests');
  const { row, cfg } = await createRequest(req, req.user.id);
  res.status(201).json({ ...shapeRequest(req, fields, row), label: reqLabel(cfg, row) });
}));

R.get('/:id', guard('request', 'get'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'requests');
  const out = await withSite(req.site.id, async (t) => {
    const row = await t.one(`${REQ_SQL} WHERE r.site_id = $1 AND r.id = $2`, [req.site.id, Number(req.params.id) || 0]);
    if (!row) throw new HttpError(404, 'Request not found.');
    if (!canDo(req, 'request', 'listAll') && row.requester_id !== req.user.id) throw new HttpError(404, 'Request not found.');
    const appr = await t.rows(`SELECT a.*, u.name AS decided_by_name FROM approvals a LEFT JOIN users u ON u.id = a.decided_by WHERE a.site_id = $1 AND a.request_id = $2 ORDER BY a.level`, [req.site.id, row.id]);
    const asg = await t.one('SELECT id, asg_no, qty, status FROM assignments WHERE site_id = $1 AND request_id = $2', [req.site.id, row.id]);
    const rep = await t.one('SELECT id, job_no, status FROM repair_jobs WHERE site_id = $1 AND request_id = $2', [req.site.id, row.id]);
    return { ...shapeRequest(req, fields, row, appr), assignment: asg, repair: rep };
  });
  res.json(out);
}));

R.post('/:id/cancel', guard('request', 'cancel'), h(async (req, res) => {
  const out = await withSite(req.site.id, async (t, repo) => {
    const row = await repo.get('requests', req.params.id, { forUpdate: true });
    if (!row) throw new HttpError(404, 'Request not found.');
    const mine = row.requester_id === req.user.id;
    if (!mine && !canDo(req, 'request', 'listAll')) throw new HttpError(404, 'Request not found.');
    if (!['pending', 'approved'].includes(row.status)) throw new HttpError(409, `A ${row.status} request cannot be cancelled.`, 'wrong_status');
    await t.exec("UPDATE approvals SET status = 'skipped' WHERE site_id = $1 AND request_id = $2 AND status = 'pending'", [req.site.id, row.id]);
    const upd = await repo.update('requests', row.id, { status: 'cancelled', updated_at: new Date().toISOString() });
    await repo.audit(req.user.id, 'cancel', 'request', row.id, {});
    await queueSms(repo, req.config, row, 'cancelled', { actorId: req.user.id });
    return upd;
  });
  await flush(req.site.id);
  res.json({ id: out.id, status: out.status });
}));

const seeRequest = async (req, repo, id) => {
  const row = await repo.get('requests', id);
  if (!row || (!canDo(req, 'request', 'listAll') && row.requester_id !== req.user.id)) throw new HttpError(404, 'Request not found.');
  return row;
};

/** Customer message history for one request (what the customer was told, and when). */
R.get('/:id/notifications', guard('request', 'get'), h(async (req, res) => {
  const rows = await withSite(req.site.id, async (t, repo) => {
    await seeRequest(req, repo, req.params.id);
    return t.rows('SELECT id, event, to_phone, message, status, provider, error, attempts, created_at, sent_at FROM notifications WHERE site_id = $1 AND request_id = $2 ORDER BY id', [req.site.id, Number(req.params.id) || 0]);
  });
  res.json(rows.map((n) => ({ ...n, label: EVENT_LABEL[n.event] || n.event })));
}));

/** Manager sends a free-text update to the customer. */
R.post('/:id/notify', guard('request', 'listAll'), h(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (message.length < 3 || message.length > 300) throw new HttpError(422, 'Write a message between 3 and 300 characters.', 'validation_failed');
  const n = await withSite(req.site.id, async (t, repo) => {
    const row = await seeRequest(req, repo, req.params.id);
    const made = await queueSms(repo, req.config, row, 'custom', { message, actorId: req.user.id });
    if (!made) throw new HttpError(409, 'SMS updates are off for this site, or this request has no phone number.', 'sms_unavailable');
    await repo.audit(req.user.id, 'sms_custom', 'request', row.id, {});
    return made;
  });
  await flush(req.site.id);
  res.status(201).json({ id: n.id });
}));

R.post('/:id/notifications/:nid/resend', guard('request', 'listAll'), h(async (req, res) => {
  const ok = await withSite(req.site.id, async (t, repo) => {
    await seeRequest(req, repo, req.params.id);
    return t.one("UPDATE notifications SET status = 'queued', error = NULL WHERE site_id = $1 AND id = $2 AND request_id = $3 AND status = 'failed' RETURNING id", [req.site.id, Number(req.params.nid) || 0, Number(req.params.id) || 0]);
  });
  if (!ok) throw new HttpError(409, 'Only failed messages can be resent.', 'wrong_status');
  await flush(req.site.id);
  res.json({ resent: true });
}));

/** Public intake (Role: Public). Only when the site owner turned it on in the Request module. */
export const publicIntakeRouter = Router({ mergeParams: true });
publicIntakeRouter.get('/form', h(async (req, res) => {
  if (!hasModule(req.config, 'request') || !moduleConfig(req.config, 'request').publicIntake) throw new HttpError(404, 'Public requests are not enabled on this site.', 'module_disabled');
  const fields = fieldsFor(req.config, 'requests').filter((f) => !f.hidden && !f.formula && !f.system && f.key !== 'item_id');
  res.json({ fields });
}));
publicIntakeRouter.post('/requests', rateLimit({ max: 10, name: 'intake' }), h(async (req, res) => {
  if (!hasModule(req.config, 'request') || !moduleConfig(req.config, 'request').publicIntake) throw new HttpError(404, 'Public requests are not enabled on this site.', 'module_disabled');
  const { row, cfg } = await createRequest(req, null, { isPublic: true });
  const label = reqLabel(cfg, row);
  res.status(201).json({ label, message: 'Thanks - your request has been received.', sms: !!(cfg.notifyCustomer && row.data?.[cfg.phoneField]), track_url: trackLink(req.config, label) || `/s/${req.site.slug}/track?ref=${label}` });
}));

const nice = (x) => String(x).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Progress steps for the public tracking page, built from the SAME config the staff use. */
function buildSteps(config, request, job) {
  const approval = hasModule(config, 'approval');
  const repair = hasModule(config, 'pcb_repair');
  const sts = repair ? moduleConfig(config, 'pcb_repair').statuses : [];
  if (['rejected', 'cancelled'].includes(request.status)) {
    return [{ key: 'received', label: 'Request received', state: 'done' }, { key: request.status, label: nice(request.status), state: 'current', bad: true }];
  }
  const list = [{ key: 'received', label: 'Request received' }];
  if (approval) list.push({ key: 'approved', label: 'Approved' });
  if (repair) { sts.forEach((x) => list.push({ key: `r_${x}`, label: nice(x) })); list.push({ key: 'returned', label: 'Handed back' }); } else list.push({ key: 'done', label: 'Completed' });
  let idx = 0;
  if (approval && ['approved', 'assigned', 'fulfilled'].includes(request.status)) idx = 1;
  if (repair && job) {
    if (job.status === 'returned') idx = list.length - 1;
    else if (sts.includes(job.status)) idx = Math.max(idx, (approval ? 2 : 1) + sts.indexOf(job.status));
  } else if (!repair && request.status === 'fulfilled') idx = list.length - 1;
  const last = list.length - 1;
  return list.map((x, i) => ({ ...x, state: i < idx || (i === idx && idx === last) ? 'done' : i === idx ? 'current' : 'todo' }));
}

/** Public: customer enters reference + the phone number they gave. Both must match, or we reveal nothing. */
publicIntakeRouter.post('/track', rateLimit({ max: 20, name: 'track' }), h(async (req, res) => {
  if (!hasModule(req.config, 'request') || !moduleConfig(req.config, 'request').publicIntake) throw new HttpError(404, 'Tracking is not enabled on this site.', 'module_disabled');
  const cfg = moduleConfig(req.config, 'request');
  const bad = () => new HttpError(404, 'We could not find a request with that reference and phone number.', 'not_found');
  const m = String(req.body?.ref || '').trim().match(/^([A-Za-z]+)-?0*(\d+)$/);
  if (!m || m[1].toUpperCase() !== String(cfg.numberPrefix || 'REQ').toUpperCase() || last10(req.body?.phone).length < 10) throw bad();
  const found = await withSite(req.site.id, async (t, repo) => {
    const r = await repo.findOne('requests', { req_no: Number(m[2]) });
    if (!r || last10(r.data?.[cfg.phoneField]) !== last10(req.body.phone)) throw bad();
    const job = hasModule(req.config, 'pcb_repair') ? await repo.findOne('repair_jobs', { request_id: r.id }) : null;
    const msgs = await t.rows("SELECT event, message, created_at FROM notifications WHERE site_id = $1 AND request_id = $2 AND status IN ('sent','queued','sending') ORDER BY id", [req.site.id, r.id]);
    return { r, job, msgs };
  });
  res.json({
    label: reqLabel(cfg, found.r), title: found.r.title, status: found.r.status, device: found.job?.device || null,
    steps: buildSteps(req.config, found.r, found.job), messages: found.msgs.map((x) => ({ label: EVENT_LABEL[x.event] || x.event, message: x.message, at: x.created_at })),
  });
}));

/* =============================== approvals =============================== */

export const approvalsRouter = Router({ mergeParams: true });
const A = approvalsRouter;

const ACTIONABLE_SQL = `
  SELECT a.*, r.req_no, r.title, r.qty AS request_qty, r.priority, r.requester_id, r.data AS request_data, r.item_id,
         u.name AS requester_name, i.name AS item_name, i.sku AS item_sku
  FROM approvals a
  JOIN requests r ON r.site_id = a.site_id AND r.id = a.request_id
  LEFT JOIN users u ON u.id = r.requester_id
  LEFT JOIN inventory_items i ON i.site_id = r.site_id AND i.id = r.item_id
  WHERE a.site_id = $1 AND a.status = 'pending' AND r.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM approvals p WHERE p.site_id = a.site_id AND p.request_id = a.request_id AND p.level < a.level AND p.status <> 'approved')
  ORDER BY a.id`;

A.get('/', guard('approval', 'list'), h(async (req, res) => {
  const cfg = moduleConfig(req.config, 'request');
  const rows = await withSite(req.site.id, (t) => t.rows(ACTIONABLE_SQL, [req.site.id]));
  const mine = rows.filter((a) => roleAtLeast(req.role, a.role));
  res.json(mine.map(({ request_data, ...a }) => ({ ...a, level_label: a.label, label: reqLabel(cfg, a), custom: request_data })));
}));

A.get('/history', guard('approval', 'list'), h(async (req, res) => {
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT a.*, r.req_no, r.title, u.name AS decided_by_name FROM approvals a
     JOIN requests r ON r.site_id = a.site_id AND r.id = a.request_id
     LEFT JOIN users u ON u.id = a.decided_by
     WHERE a.site_id = $1 AND a.status IN ('approved','rejected') ORDER BY a.decided_at DESC LIMIT 100`, [req.site.id]));
  const cfg = moduleConfig(req.config, 'request');
  res.json(rows.map((a) => ({ ...a, level_label: a.label, label: reqLabel(cfg, a) })));
}));

A.post('/:id/decide', guard('approval', 'decide'), h(async (req, res) => {
  const decision = req.body?.decision;
  const comment = req.body?.comment ? String(req.body.comment).slice(0, 1000) : null;
  if (!['approve', 'reject'].includes(decision)) throw new HttpError(422, 'decision must be "approve" or "reject".', 'validation_failed');
  const cfg = moduleConfig(req.config, 'approval');
  if (decision === 'reject' && cfg.requireComment && !comment?.trim()) throw new HttpError(422, 'Please give a reason when rejecting.', 'validation_failed');

  const out = await withSite(req.site.id, async (t, repo) => {
    const a = await repo.get('approvals', req.params.id, { forUpdate: true });
    if (!a) throw new HttpError(404, 'Approval not found.');
    const r = await repo.get('requests', a.request_id, { forUpdate: true });
    if (a.status !== 'pending' || r.status !== 'pending') throw new HttpError(409, 'This approval has already been decided.', 'wrong_status');
    if (!roleAtLeast(req.role, a.role)) throw new HttpError(403, `This step needs a ${a.role}.`);
    const blocking = await t.one("SELECT level FROM approvals WHERE site_id = $1 AND request_id = $2 AND level < $3 AND status <> 'approved' LIMIT 1", [req.site.id, a.request_id, a.level]);
    if (blocking) throw new HttpError(409, `Waiting for level ${blocking.level} to approve first.`, 'wrong_order');
    if (r.requester_id === req.user.id && !cfg.allowSelfApproval) throw new HttpError(403, 'You cannot approve your own request.', 'self_approval');

    await repo.update('approvals', a.id, { status: decision === 'approve' ? 'approved' : 'rejected', decided_by: req.user.id, comment, decided_at: new Date().toISOString() });
    let requestStatus = 'pending';
    let assignment = null;
    if (decision === 'reject') {
      await t.exec("UPDATE approvals SET status = 'skipped' WHERE site_id = $1 AND request_id = $2 AND status = 'pending'", [req.site.id, r.id]);
      requestStatus = 'rejected';
    } else {
      const left = await t.one("SELECT count(*)::int AS n FROM approvals WHERE site_id = $1 AND request_id = $2 AND status = 'pending'", [req.site.id, r.id]);
      if (left.n === 0) requestStatus = 'approved';
    }
    if (requestStatus !== 'pending') await repo.update('requests', r.id, { status: requestStatus, updated_at: new Date().toISOString() });

    // Optional: issue stock in the SAME transaction as the final approval.
    if (requestStatus === 'approved' && hasModule(req.config, 'material_assignment') && moduleConfig(req.config, 'material_assignment').autoAssignOnApproval && r.item_id) {
      const item = await repo.get('inventory_items', r.item_id);
      if (item && Number(item.qty) >= Number(r.qty)) {
        assignment = await issueAssignment(repo, { requestId: r.id, assignedTo: r.data?.field_site || 'Auto-assigned', assigneeId: r.requester_id, actorId: req.user.id });
        requestStatus = 'assigned';
      }
    }
    if (requestStatus === 'rejected') await queueSms(repo, req.config, r, 'rejected', { actorId: req.user.id });
    else if (requestStatus === 'approved' || requestStatus === 'assigned') await queueSms(repo, req.config, r, 'approved', { actorId: req.user.id });
    await repo.audit(req.user.id, decision, 'approval', a.id, { request_id: r.id });
    return { approval_id: a.id, request_id: r.id, decision, request_status: requestStatus, assignment_id: assignment?.id || null };
  });
  await flush(req.site.id);
  res.json(out);
}));

/* =============================== assignments =============================== */

export const assignmentsRouter = Router({ mergeParams: true });
const G = assignmentsRouter;

const ASG_SQL = `
  SELECT g.*, i.sku AS item_sku, i.name AS item_name, r.req_no, r.title AS request_title, u.name AS assignee_name
  FROM assignments g
  JOIN inventory_items i ON i.site_id = g.site_id AND i.id = g.item_id
  JOIN requests r ON r.site_id = g.site_id AND r.id = g.request_id
  LEFT JOIN users u ON u.id = g.assignee_id`;

G.get('/', guard('material_assignment', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'assignments');
  const all = canDo(req, 'material_assignment', 'listAll');
  const rows = await withSite(req.site.id, (t) => t.rows(`${ASG_SQL} WHERE g.site_id = $1 AND ($2::boolean OR g.assignee_id = $3 OR g.created_by = $3) ORDER BY g.id DESC LIMIT 1000`, [req.site.id, all, req.user.id]));
  res.json(rows.map((x) => ({ ...serialize(fields, x), label: `ASG-${String(x.asg_no).padStart(4, '0')}`, remaining: Number(x.qty) - Number(x.qty_consumed) - Number(x.qty_returned) })));
}));

/** Desk queue: approved requests that still need stock issued. */
G.get('/ready', guard('material_assignment', 'create'), h(async (req, res) => {
  const cfg = moduleConfig(req.config, 'request');
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT r.id, r.req_no, r.title, r.qty, r.priority, r.item_id, r.data, u.name AS requester_name, r.requester_id,
            i.sku AS item_sku, i.name AS item_name, i.qty AS item_stock
     FROM requests r
     LEFT JOIN users u ON u.id = r.requester_id
     LEFT JOIN inventory_items i ON i.site_id = r.site_id AND i.id = r.item_id
     WHERE r.site_id = $1 AND r.status = 'approved' AND r.item_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM assignments g WHERE g.site_id = r.site_id AND g.request_id = r.id)
     ORDER BY r.id`, [req.site.id]));
  res.json(rows.map((x) => ({ ...x, label: reqLabel(cfg, x), enough_stock: Number(x.item_stock) >= Number(x.qty) })));
}));

G.post('/', guard('material_assignment', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'assignments');
  const body = req.body || {};
  const requestId = Number(body.request_id);
  if (!Number.isInteger(requestId)) throw new HttpError(422, 'request_id is required.', 'validation_failed');
  const cfg = moduleConfig(req.config, 'material_assignment');
  const result = await withSite(req.site.id, async (t, repo) => {
    const request = await repo.get('requests', requestId);
    if (!request) throw new HttpError(404, 'Request not found.');
    const { request_id: _r, assignee_id: assigneeId, ...rest } = body;
    const { core, data } = validateInput(fields, { qty: Number(request.qty), ...rest }, {});
    if (assigneeId != null) {
      const m = await t.one('SELECT 1 AS ok FROM site_members WHERE site_id = $1 AND user_id = $2', [req.site.id, Number(assigneeId)]);
      if (!m) throw new HttpError(422, 'Assignee is not a member of this site.', 'validation_failed');
    }
    const calc = withCalculated(fields, { ...core, ...data });
    return issueAssignment(repo, { requestId, qty: core.qty, assignedTo: core.assigned_to, assigneeId: assigneeId ?? null, data: { ...data, ...calc }, actorId: req.user.id, allowPartial: cfg.allowPartialQty !== false });
  });
  res.status(201).json({ ...result, label: `ASG-${String(result.asg_no).padStart(4, '0')}` });
}));

G.get('/:id', guard('material_assignment', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'assignments');
  const all = canDo(req, 'material_assignment', 'listAll');
  const out = await withSite(req.site.id, async (t) => {
    const row = await t.one(`${ASG_SQL} WHERE g.site_id = $1 AND g.id = $2`, [req.site.id, Number(req.params.id) || 0]);
    if (!row || (!all && row.assignee_id !== req.user.id && row.created_by !== req.user.id)) throw new HttpError(404, 'Assignment not found.');
    return row;
  });
  res.json({ ...serialize(fields, out), remaining: Number(out.qty) - Number(out.qty_consumed) - Number(out.qty_returned) });
}));
