import { Router } from 'express';
import { withSite } from '../db.js';
import { canDo, guard, h, HttpError } from '../core.js';
import { fieldsFor, serialize, validateInput, withCalculated } from '../entities.js';
import { hasModule, moduleConfig } from '../../../shared/registry.js';
import { changeStock } from './inventory.js';
import { assignmentStatus, reqLabel } from './workflow.js';
import { queueSms, flush, statusText, trackLink } from '../notify.js';
import { sendRepairCompleteEmail } from '../email.js';

const pad = (p, n) => `${p}-${String(n).padStart(4, '0')}`;

/* =============================== consumption =============================== */

export const consumptionRouter = Router({ mergeParams: true });

consumptionRouter.get('/', guard('consumption_tracking', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'consumption');
  const all = canDo(req, 'consumption_tracking', 'listAll');
  const asg = req.query.assignment_id ? Number(req.query.assignment_id) : null;
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT c.*, g.asg_no, i.name AS item_name, i.sku AS item_sku, u.name AS used_by_name
     FROM consumption_logs c
     JOIN assignments g ON g.site_id = c.site_id AND g.id = c.assignment_id
     JOIN inventory_items i ON i.site_id = g.site_id AND i.id = g.item_id
     LEFT JOIN users u ON u.id = c.used_by
     WHERE c.site_id = $1 AND ($2::int IS NULL OR c.assignment_id = $2)
       AND ($3::boolean OR g.assignee_id = $4 OR g.created_by = $4 OR c.used_by = $4)
     ORDER BY c.id DESC LIMIT 1000`, [req.site.id, asg, all, req.user.id]));
  res.json(rows.map((x) => ({ ...serialize(fields, x), label: pad('ASG', x.asg_no) })));
}));

consumptionRouter.post('/', guard('consumption_tracking', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'consumption');
  const assignmentId = Number(req.body?.assignment_id);
  if (!Number.isInteger(assignmentId)) throw new HttpError(422, 'assignment_id is required.', 'validation_failed');
  const { assignment_id: _a, ...rest } = req.body;
  const { core, data } = validateInput(fields, rest);
  const out = await withSite(req.site.id, async (t, repo) => {
    const a = await repo.get('assignments', assignmentId, { forUpdate: true });
    if (!a) throw new HttpError(404, 'Assignment not found.');
    if (!canDo(req, 'consumption_tracking', 'listAll') && a.assignee_id !== req.user.id && a.created_by !== req.user.id) throw new HttpError(404, 'Assignment not found.');
    const remaining = Number(a.qty) - Number(a.qty_consumed) - Number(a.qty_returned);
    if (core.qty > remaining + 1e-9) throw new HttpError(409, `Only ${remaining} left on this assignment.`, 'over_consumption', { remaining });
    const calc = withCalculated(fields, { ...core, ...data });
    const log = await repo.insert('consumption_logs', { assignment_id: a.id, ...core, data: { ...data, ...calc }, used_by: req.user.id });
    const next = { ...a, qty_consumed: Number(a.qty_consumed) + core.qty };
    const upd = await repo.update('assignments', a.id, { qty_consumed: next.qty_consumed, status: assignmentStatus(next) });
    await repo.audit(req.user.id, 'consume', 'assignment', a.id, { qty: core.qty });
    return { log, assignment: upd };
  });
  res.status(201).json({ ...serialize(fields, out.log), assignment_status: out.assignment.status, remaining: Number(out.assignment.qty) - Number(out.assignment.qty_consumed) - Number(out.assignment.qty_returned) });
}));

/* =============================== repairs =============================== */

export const repairsRouter = Router({ mergeParams: true });
const REP_SQL = `
  SELECT j.*, r.req_no, r.data AS request_data, r.title AS request_title, t.name AS technician_name
  FROM repair_jobs j
  LEFT JOIN requests r ON r.site_id = j.site_id AND r.id = j.request_id
  LEFT JOIN users t ON t.id = j.technician_id`;

const statuses = (req) => moduleConfig(req.config, 'pcb_repair').statuses;
const shapeRepair = (req, fields, row) => ({ ...serialize(fields, row), label: pad('JOB', row.job_no), request_label: row.req_no ? reqLabel(moduleConfig(req.config, 'request'), row) : null });

repairsRouter.get('/', guard('pcb_repair', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'repairs');
  const status = req.query.status ? String(req.query.status) : null;
  const rows = await withSite(req.site.id, (t) => t.rows(`${REP_SQL} WHERE j.site_id = $1 AND ($2::text IS NULL OR j.status = $2) ORDER BY j.id DESC LIMIT 1000`, [req.site.id, status]));
  res.json(rows.map((x) => shapeRepair(req, fields, x)));
}));

repairsRouter.get('/ready', guard('pcb_repair', 'create'), h(async (req, res) => {
  const cfg = moduleConfig(req.config, 'request');
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT r.id, r.req_no, r.title, r.data FROM requests r
     WHERE r.site_id = $1 AND r.status = 'approved' AND NOT EXISTS (SELECT 1 FROM repair_jobs j WHERE j.site_id = r.site_id AND j.request_id = r.id)
     ORDER BY r.id`, [req.site.id]));
  res.json(rows.map((x) => ({ ...x, label: reqLabel(cfg, x) })));
}));

repairsRouter.get('/:id', guard('pcb_repair', 'get'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'repairs');
  const out = await withSite(req.site.id, async (t) => {
    const row = await t.one(`${REP_SQL} WHERE j.site_id = $1 AND j.id = $2`, [req.site.id, Number(req.params.id) || 0]);
    if (!row) throw new HttpError(404, 'Repair job not found.');
    const logs = await t.rows(`SELECT l.*, u.name AS actor_name, i.name AS part_name, i.sku AS part_sku FROM repair_logs l
      LEFT JOIN users u ON u.id = l.actor_id LEFT JOIN inventory_items i ON i.site_id = l.site_id AND i.id = l.part_item_id
      WHERE l.site_id = $1 AND l.repair_id = $2 ORDER BY l.id DESC`, [req.site.id, row.id]);
    return { row, logs };
  });
  res.json({ ...shapeRepair(req, fields, out.row), logs: out.logs });
}));

repairsRouter.post('/', guard('pcb_repair', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'repairs');
  const { request_id: requestId, technician_id: techId, ...rest } = req.body || {};
  const { core, data } = validateInput(fields, rest);
  const row = await withSite(req.site.id, async (t, repo) => {
    let linked = null;
    if (requestId != null) {
      const rq = await repo.get('requests', requestId, { forUpdate: true });
      if (!rq) throw new HttpError(422, 'That request does not exist on this site.', 'validation_failed');
      if (rq.status !== 'approved') throw new HttpError(409, `Only approved requests can become repair jobs (this one is ${rq.status}).`, 'wrong_status');
      if (await repo.findOne('repair_jobs', { request_id: rq.id })) throw new HttpError(409, 'This request already has a repair job.', 'already_assigned');
      await repo.update('requests', rq.id, { status: 'assigned', updated_at: new Date().toISOString() });
      linked = rq;
    }
    if (techId != null && !(await t.one('SELECT 1 AS ok FROM site_members WHERE site_id = $1 AND user_id = $2', [req.site.id, Number(techId)]))) {
      throw new HttpError(422, 'Technician is not a member of this site.', 'validation_failed');
    }
    const jobNo = await repo.nextNo('repair');
    const calc = withCalculated(fields, { ...core, ...data, parts_cost: 0 });
    const job = await repo.insert('repair_jobs', { job_no: jobNo, request_id: requestId ?? null, ...core, status: statuses(req)[0], technician_id: techId ?? req.user.id, data: { ...data, ...calc }, created_by: req.user.id });
    await repo.insert('repair_logs', { repair_id: job.id, entry: 'Job opened', to_status: job.status, actor_id: req.user.id });
    await repo.audit(req.user.id, 'create', 'repair', job.id, {});
    if (linked) await queueSms(repo, req.config, linked, 'repair_opened', { job: pad('JOB', jobNo), actorId: req.user.id });
    return job;
  });
  await flush(req.site.id);
  res.status(201).json(shapeRepair(req, fields, row));
}));

repairsRouter.put('/:id', guard('pcb_repair', 'update'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'repairs');
  const { technician_id: techId, ...rest } = req.body || {};
  const { core, data } = validateInput(fields, rest, { partial: true });
  const row = await withSite(req.site.id, async (t, repo) => {
    const cur = await repo.get('repair_jobs', req.params.id, { forUpdate: true });
    if (!cur) throw new HttpError(404, 'Repair job not found.');
    const merged = { ...cur, ...core, data: { ...cur.data, ...data } };
    const calc = withCalculated(fields, merged);
    const patch = { ...core, data: { ...cur.data, ...data, ...calc }, updated_at: new Date().toISOString() };
    if (techId != null) patch.technician_id = Number(techId);
    const upd = await repo.update('repair_jobs', cur.id, patch);
    if (core.labour_cost !== undefined) await repo.insert('repair_logs', { repair_id: cur.id, entry: `Labour cost set to ${core.labour_cost}`, actor_id: req.user.id });
    return upd;
  });
  res.json(shapeRepair(req, fields, row));
}));

repairsRouter.post('/:id/status', guard('pcb_repair', 'update'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'repairs');
  const list = statuses(req);
  const to = String(req.body?.status || '');
  if (!list.includes(to)) throw new HttpError(422, `Status must be one of: ${list.join(', ')}.`, 'validation_failed');
  const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;

  let emailPayload = null;

  const row = await withSite(req.site.id, async (t, repo) => {
    const cur = await repo.get('repair_jobs', req.params.id, { forUpdate: true });
    if (!cur) throw new HttpError(404, 'Repair job not found.');
    if (cur.status === 'returned') throw new HttpError(409, 'This unit has already been returned to the customer.', 'wrong_status');
    if (cur.status === to) return cur;
    const done = to === list[list.length - 1];
    const upd = await repo.update('repair_jobs', cur.id, { status: to, completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
    await repo.insert('repair_logs', { repair_id: cur.id, entry: note || `Status changed to ${to.replace(/_/g, ' ')}`, from_status: cur.status, to_status: to, actor_id: req.user.id });
    if (cur.request_id) await repo.update('requests', cur.request_id, { status: done ? 'fulfilled' : 'assigned', updated_at: new Date().toISOString() });
    await repo.audit(req.user.id, 'status', 'repair', cur.id, { from: cur.status, to });

    let rq = null;
    let customerEmail = null;
    let customerName = null;
    let reqLabelStr = pad('JOB', cur.job_no);
    let reqTitle = cur.fault || '';

    if (cur.request_id) {
      rq = await repo.get('requests', cur.request_id);
      if (rq) {
        reqTitle = rq.title || reqTitle;
        const cfg = hasModule(req.config, 'request') ? moduleConfig(req.config, 'request') : null;
        reqLabelStr = cfg ? reqLabel(cfg, rq) : reqLabelStr;
        customerName = String(rq.data?.customer_name || rq.data?.name || '').trim() || null;
        customerEmail = rq.data?.customer_email || rq.data?.email || rq.data?.contact_email || null;
        if (!customerEmail && rq.requester_id) {
          try {
            const u = await t.one('SELECT email, name FROM users WHERE id = $1', [rq.requester_id]);
            if (u) {
              customerEmail = u.email;
              if (!customerName) customerName = u.name;
            }
          } catch {}
        }
      }
    }

    if (!customerEmail) {
      customerEmail = cur.data?.customer_email || cur.data?.email || null;
    }
    if (!customerName) {
      customerName = String(cur.data?.customer_name || 'Customer').trim();
    }

    if (done && customerEmail) {
      const trackingUrl = trackLink(req.config, reqLabelStr);
      const totalCost = cur.data?.grand_total || cur.data?.total_cost || (Number(cur.labour_cost || 0) + Number(cur.parts_cost || 0)) || null;
      const siteName = req.config.name || req.site.name || 'Service Centre';
      const device = cur.device || rq?.data?.device_type || rq?.data?.device || rq?.title || 'Your device';

      emailPayload = {
        to: customerEmail,
        customerName,
        device,
        ref: reqLabelStr,
        job: pad('JOB', cur.job_no),
        title: reqTitle,
        siteName,
        trackingUrl,
        totalCost,
        requestId: cur.request_id || null,
      };
    }

    return upd;
  });

  // DB transaction is committed! Now send customer notification email without blocking DB
  if (emailPayload) {
    try {
      const emailRes = await sendRepairCompleteEmail(emailPayload);
      console.log(`[Resend:Email] Repair completion email sent to ${emailPayload.to} (provider ref: ${emailRes?.id})`);

      if (emailPayload.requestId) {
        try {
          await withSite(req.site.id, async (_t, repo) => {
            await repo.insert('notifications', {
              request_id: emailPayload.requestId,
              event: 'repair_done',
              channel: 'email',
              to_phone: emailPayload.to,
              message: `Repair completed. Collection email sent to ${emailPayload.to}`,
              status: 'sent',
              provider: emailRes?.provider || 'resend',
              provider_ref: emailRes?.id || null,
              created_by: req.user.id,
              sent_at: new Date().toISOString(),
            });
          });
        } catch {
          // notifications table may not exist; safe to ignore
        }
      }
    } catch (emailErr) {
      console.warn(`[Resend:Email] Could not send repair completion email to ${emailPayload.to}:`, emailErr.message);
    }
  }

  res.json(shapeRepair(req, fields, row));
}));

/** Parts used in a repair: decrements stock and adds to parts_cost in ONE transaction. */
repairsRouter.post('/:id/parts', guard('pcb_repair', 'parts'), h(async (req, res) => {
  if (!hasModule(req.config, 'inventory')) throw new HttpError(409, 'This site has no inventory to take parts from.', 'module_disabled');
  const fields = fieldsFor(req.config, 'repairs');
  const itemId = Number(req.body?.item_id);
  const qty = Number(req.body?.qty);
  if (!Number.isInteger(itemId) || !(qty > 0)) throw new HttpError(422, 'item_id and a positive qty are required.', 'validation_failed');
  const row = await withSite(req.site.id, async (t, repo) => {
    const job = await repo.get('repair_jobs', req.params.id, { forUpdate: true });
    if (!job) throw new HttpError(404, 'Repair job not found.');
    if (job.status === 'returned') throw new HttpError(409, 'This job is closed.', 'wrong_status');
    const { after } = await changeStock(repo, itemId, -qty, 'repair_part', { type: 'repair', id: job.id }, req.user.id);
    const cost = Math.round((Number(job.parts_cost) + qty * Number(after.price)) * 100) / 100;
    const merged = { ...job, parts_cost: cost };
    const calc = withCalculated(fields, merged);
    const upd = await repo.update('repair_jobs', job.id, { parts_cost: cost, data: { ...job.data, ...calc }, updated_at: new Date().toISOString() });
    await repo.insert('repair_logs', { repair_id: job.id, entry: req.body?.note ? String(req.body.note).slice(0, 300) : `Used ${qty} x ${after.name}`, part_item_id: itemId, part_qty: qty, actor_id: req.user.id });
    return upd;
  });
  res.status(201).json(shapeRepair(req, fields, row));
}));

repairsRouter.delete('/:id', guard('pcb_repair', 'delete'), h(async (req, res) => {
  await withSite(req.site.id, async (t, repo) => {
    const gone = await repo.delete('repair_jobs', req.params.id);
    if (!gone) throw new HttpError(404, 'Repair job not found.');
  });
  res.json({ deleted: true });
}));

/* =============================== returns =============================== */

export const returnsRouter = Router({ mergeParams: true });

returnsRouter.get('/', guard('return_management', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'returns');
  const all = canDo(req, 'return_management', 'listAll');
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT n.*, i.name AS item_name, i.sku AS item_sku, g.asg_no, j.job_no, j.device, u.name AS created_by_name
     FROM returns n
     LEFT JOIN inventory_items i ON i.site_id = n.site_id AND i.id = n.item_id
     LEFT JOIN assignments g ON g.site_id = n.site_id AND g.id = n.assignment_id
     LEFT JOIN repair_jobs j ON j.site_id = n.site_id AND j.id = n.repair_id
     LEFT JOIN users u ON u.id = n.created_by
     WHERE n.site_id = $1 AND ($2::boolean OR n.created_by = $3) ORDER BY n.id DESC LIMIT 1000`, [req.site.id, all, req.user.id]));
  res.json(rows.map((x) => ({ ...serialize(fields, x), label: pad('RET', x.ret_no), source_label: x.source_type === 'repair' ? pad('JOB', x.job_no) : pad('ASG', x.asg_no) })));
}));

returnsRouter.post('/', guard('return_management', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, 'returns');
  const cfg = moduleConfig(req.config, 'return_management');
  const { source_type: sourceType, assignment_id: assignmentId, repair_id: repairId, ...rest } = req.body || {};
  if (!['assignment', 'repair'].includes(sourceType)) throw new HttpError(422, 'source_type must be "assignment" or "repair".', 'validation_failed');
  const needModule = sourceType === 'assignment' ? 'material_assignment' : 'pcb_repair';
  if (!hasModule(req.config, needModule)) throw new HttpError(409, `Returns from ${sourceType === 'assignment' ? 'assignments' : 'repairs'} need the ${needModule.replace(/_/g, ' ')} module on this site.`, 'module_disabled');
  const { core, data } = validateInput(fields, sourceType === 'repair' ? { qty: 1, ...rest } : rest);

  const out = await withSite(req.site.id, async (t, repo) => {
    const calc = withCalculated(fields, { ...core, ...data });
    const retNo = await repo.nextNo('return');
    if (sourceType === 'assignment') {
      const a = await repo.get('assignments', assignmentId, { forUpdate: true });
      if (!a) throw new HttpError(404, 'Assignment not found.');
      if (!canDo(req, 'return_management', 'listAll') && a.assignee_id !== req.user.id && a.created_by !== req.user.id) throw new HttpError(404, 'Assignment not found.');
      const remaining = Number(a.qty) - Number(a.qty_consumed) - Number(a.qty_returned);
      if (core.qty > remaining + 1e-9) throw new HttpError(409, `Only ${remaining} can still be returned from this assignment.`, 'over_return', { remaining });
      const restock = !!cfg.restockGood && core.condition === 'good' && hasModule(req.config, 'inventory');
      if (restock) await changeStock(repo, a.item_id, core.qty, 'return', { type: 'assignment', id: a.id }, req.user.id);
      const next = { ...a, qty_returned: Number(a.qty_returned) + core.qty };
      await repo.update('assignments', a.id, { qty_returned: next.qty_returned, status: assignmentStatus(next) });
      const ret = await repo.insert('returns', { ret_no: retNo, source_type: 'assignment', assignment_id: a.id, item_id: a.item_id, ...core, restocked: restock, data: { ...data, ...calc }, created_by: req.user.id });
      await repo.audit(req.user.id, 'return', 'assignment', a.id, { qty: core.qty, restock });
      return ret;
    }
    const job = await repo.get('repair_jobs', repairId, { forUpdate: true });
    if (!job) throw new HttpError(404, 'Repair job not found.');
    const list = statuses(req);
    if (job.status !== list[list.length - 1]) throw new HttpError(409, `Only completed repairs can be returned (this one is ${job.status.replace(/_/g, ' ')}).`, 'wrong_status');
    await repo.update('repair_jobs', job.id, { status: 'returned', returned_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await repo.insert('repair_logs', { repair_id: job.id, entry: 'Returned to customer', from_status: job.status, to_status: 'returned', actor_id: req.user.id });
    const ret = await repo.insert('returns', { ret_no: retNo, source_type: 'repair', repair_id: job.id, ...core, qty: 1, restocked: false, data: { ...data, ...calc }, created_by: req.user.id });
    await repo.audit(req.user.id, 'return', 'repair', job.id, {});
    if (job.request_id) {
      const rq = await repo.get('requests', job.request_id);
      if (rq) await queueSms(repo, req.config, rq, 'returned', { actorId: req.user.id });
    }
    return ret;
  });
  await flush(req.site.id);
  res.status(201).json({ ...serialize(fields, out), label: pad('RET', out.ret_no) });
}));
