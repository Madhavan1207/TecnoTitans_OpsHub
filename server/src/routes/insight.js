import { Router } from 'express';
import express from 'express';
import ExcelJS from 'exceljs';
import { withSite } from '../db.js';
import { actionMinRole, hasModule, moduleConfig, roleAtLeast, EXPORTABLE, IMPORTABLE, MODULE_MAP } from '../../../shared/registry.js';
import { parse, toExcelFormula } from '../../../shared/formula.js';
import { guard, h, HttpError, moduleOnly } from '../core.js';
import { fieldsFor, serialize, validateInput, withCalculated, ENTITIES } from '../entities.js';
import { recordMovement, serializeItem } from './inventory.js';
import { reqLabel } from './workflow.js';

/* ================================ analytics ================================ */

export const analyticsRouter = Router({ mergeParams: true });

analyticsRouter.get('/', guard('analytics', 'view'), h(async (req, res) => {
  const cfg = moduleConfig(req.config, 'analytics');
  const want = new Set(cfg.widgets || []);
  const has = (k) => hasModule(req.config, k);
  const sid = req.site.id;
  const repairStatuses = has('pcb_repair') ? moduleConfig(req.config, 'pcb_repair').statuses : [];

  const widgets = await withSite(sid, async (t) => {
    const out = [];
    const one = (sql, p = [sid]) => t.one(sql, p);
    const rows = (sql, p = [sid]) => t.rows(sql, p);

    if (want.has('kpis')) {
      const k = [];
      if (has('inventory')) {
        const s = await one('SELECT count(*)::int AS skus, COALESCE(sum(qty*price),0)::float AS value, count(*) FILTER (WHERE reorder_level > 0 AND qty <= reorder_level)::int AS low FROM inventory_items WHERE site_id = $1');
        k.push({ label: 'Components', value: s.skus }, { label: 'Stock value', value: s.value, format: 'currency' }, { label: 'Low stock', value: s.low, tone: s.low ? 'warn' : 'ok' });
      }
      if (has('request')) {
        const s = await one("SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*)::int AS total FROM requests WHERE site_id = $1");
        k.push({ label: 'Open requests', value: s.pending, tone: s.pending ? 'info' : 'ok' }, { label: 'All requests', value: s.total });
      }
      if (has('material_assignment')) k.push({ label: 'Assignments', value: (await one('SELECT count(*)::int AS n FROM assignments WHERE site_id = $1')).n });
      if (has('pcb_repair')) {
        const last = repairStatuses[repairStatuses.length - 1];
        k.push({ label: 'Open repairs', value: (await one("SELECT count(*)::int AS n FROM repair_jobs WHERE site_id = $1 AND status NOT IN ($2, 'returned')", [sid, last])).n });
      }
      if (has('return_management')) k.push({ label: 'Returns', value: (await one('SELECT count(*)::int AS n FROM returns WHERE site_id = $1')).n });
      out.push({ key: 'kpis', title: 'Key numbers', type: 'kpis', data: k });
    }
    if (want.has('stock_by_category') && has('inventory')) {
      out.push({ key: 'stock_by_category', title: 'Stock value by category', type: 'bar', unit: 'currency',
        data: await rows("SELECT COALESCE(NULLIF(category,''),'Uncategorised') AS name, COALESCE(sum(qty*price),0)::float AS value, sum(qty)::float AS qty FROM inventory_items WHERE site_id = $1 GROUP BY 1 ORDER BY value DESC LIMIT 12") });
    }
    if (want.has('low_stock') && has('inventory')) {
      out.push({ key: 'low_stock', title: 'Running low', type: 'table', columns: ['sku', 'name', 'qty', 'reorder_level'],
        data: await rows('SELECT sku, name, qty::float AS qty, reorder_level::float AS reorder_level FROM inventory_items WHERE site_id = $1 AND reorder_level > 0 AND qty <= reorder_level ORDER BY (qty / reorder_level) LIMIT 8') });
    }
    if (want.has('requests_by_status') && has('request')) {
      out.push({ key: 'requests_by_status', title: 'Requests by status', type: 'pie', data: await rows('SELECT status AS name, count(*)::int AS value FROM requests WHERE site_id = $1 GROUP BY status ORDER BY value DESC') });
    }
    if (want.has('requests_trend') && has('request')) {
      out.push({ key: 'requests_trend', title: 'Requests, last 14 days', type: 'line',
        data: await rows(`SELECT to_char(d, 'DD Mon') AS name, count(r.id)::int AS value FROM generate_series(current_date - 13, current_date, interval '1 day') d
                          LEFT JOIN requests r ON r.site_id = $1 AND r.created_at::date = d::date GROUP BY d ORDER BY d`) });
    }
    if (want.has('assignments_trend') && has('material_assignment')) {
      out.push({ key: 'assignments_trend', title: 'Material issued, last 14 days', type: 'line',
        data: await rows(`SELECT to_char(d, 'DD Mon') AS name, COALESCE(sum(g.qty),0)::float AS value FROM generate_series(current_date - 13, current_date, interval '1 day') d
                          LEFT JOIN assignments g ON g.site_id = $1 AND g.created_at::date = d::date GROUP BY d ORDER BY d`) });
    }
    if (want.has('consumption_by_item') && has('consumption_tracking')) {
      out.push({ key: 'consumption_by_item', title: 'Consumption by item', type: 'bar',
        data: await rows(`SELECT i.name AS name, sum(c.qty)::float AS value FROM consumption_logs c
                          JOIN assignments g ON g.site_id = c.site_id AND g.id = c.assignment_id
                          JOIN inventory_items i ON i.site_id = g.site_id AND i.id = g.item_id
                          WHERE c.site_id = $1 GROUP BY i.name ORDER BY value DESC LIMIT 8`) });
    }
    if (want.has('repair_status') && has('pcb_repair')) {
      const got = await rows('SELECT status AS name, count(*)::int AS value FROM repair_jobs WHERE site_id = $1 GROUP BY status');
      const order = [...repairStatuses, 'returned'];
      out.push({ key: 'repair_status', title: 'Repair pipeline', type: 'bar', data: order.map((s) => ({ name: s.replace(/_/g, ' '), value: got.find((g) => g.name === s)?.value || 0 })) });
    }
    return out;
  });
  res.json({ widgets });
}));

/* ================================ Excel ================================ */

export const reportsRouter = Router({ mergeParams: true });
const ENTITY_LABEL = { components: 'Components', requests: 'Requests', assignments: 'Assignments', consumption: 'Consumption', returns: 'Returns', repairs: 'Repairs' };

const available = (req) => Object.entries(EXPORTABLE).filter(([, mod]) => hasModule(req.config, mod)).map(([entity, module]) => ({ entity, label: ENTITY_LABEL[entity], module, importable: !!IMPORTABLE[entity] }));

reportsRouter.get('/', moduleOnly('reports_excel'), h(async (req, res) => {
  res.json({
    entities: available(req),
    can_export: roleAtLeast(req.role, actionMinRole(req.config, 'reports_excel', 'export')),
    can_import: roleAtLeast(req.role, actionMinRole(req.config, 'reports_excel', 'import')),
    export_min_role: actionMinRole(req.config, 'reports_excel', 'export'),
    import_min_role: actionMinRole(req.config, 'reports_excel', 'import'),
  });
}));

/* The summary above is readable by any site member so the page can explain restrictions; the guards below are the real gate. */

const SQL = {
  components: (sid) => ['SELECT * FROM inventory_items WHERE site_id = $1 ORDER BY name', [sid]],
  requests: (sid) => [`SELECT r.*, u.name AS requester_name, i.sku AS item_sku FROM requests r LEFT JOIN users u ON u.id = r.requester_id
                       LEFT JOIN inventory_items i ON i.site_id = r.site_id AND i.id = r.item_id WHERE r.site_id = $1 ORDER BY r.id`, [sid]],
  assignments: (sid) => [`SELECT g.*, i.sku AS item_sku, i.name AS item_name, r.req_no FROM assignments g JOIN inventory_items i ON i.site_id = g.site_id AND i.id = g.item_id
                          JOIN requests r ON r.site_id = g.site_id AND r.id = g.request_id WHERE g.site_id = $1 ORDER BY g.id`, [sid]],
  consumption: (sid) => [`SELECT c.*, g.asg_no, i.sku AS item_sku, i.name AS item_name, u.name AS used_by_name FROM consumption_logs c
                          JOIN assignments g ON g.site_id = c.site_id AND g.id = c.assignment_id JOIN inventory_items i ON i.site_id = g.site_id AND i.id = g.item_id
                          LEFT JOIN users u ON u.id = c.used_by WHERE c.site_id = $1 ORDER BY c.id`, [sid]],
  returns: (sid) => [`SELECT n.*, i.sku AS item_sku, g.asg_no, j.job_no FROM returns n LEFT JOIN inventory_items i ON i.site_id = n.site_id AND i.id = n.item_id
                      LEFT JOIN assignments g ON g.site_id = n.site_id AND g.id = n.assignment_id LEFT JOIN repair_jobs j ON j.site_id = n.site_id AND j.id = n.repair_id
                      WHERE n.site_id = $1 ORDER BY n.id`, [sid]],
  repairs: (sid) => [`SELECT j.*, r.req_no, t.name AS technician_name FROM repair_jobs j LEFT JOIN requests r ON r.site_id = j.site_id AND r.id = j.request_id
                      LEFT JOIN users t ON t.id = j.technician_id WHERE j.site_id = $1 ORDER BY j.id`, [sid]],
};
const PREFIX = (req) => {
  const reqCfg = hasModule(req.config, 'request') ? moduleConfig(req.config, 'request') : {};
  return {
    components: [],
    requests: [{ key: '_label', header: 'Request no.', get: (r) => reqLabel(reqCfg, r) }, { key: 'status', header: 'Status' }, { key: 'requester_name', header: 'Requested by' }, { key: 'item_sku', header: 'Component SKU' }, { key: 'created_at', header: 'Created', type: 'date' }],
    assignments: [{ key: '_label', header: 'Assignment', get: (r) => `ASG-${String(r.asg_no).padStart(4, '0')}` }, { key: '_req', header: 'Request', get: (r) => reqLabel(reqCfg, r) }, { key: 'item_sku', header: 'Component SKU' }, { key: 'item_name', header: 'Component' }, { key: 'status', header: 'Status' }, { key: 'qty_consumed', header: 'Consumed', type: 'number' }, { key: 'qty_returned', header: 'Returned', type: 'number' }, { key: 'created_at', header: 'Issued', type: 'date' }],
    consumption: [{ key: '_label', header: 'Assignment', get: (r) => `ASG-${String(r.asg_no).padStart(4, '0')}` }, { key: 'item_sku', header: 'Component SKU' }, { key: 'item_name', header: 'Component' }, { key: 'used_by_name', header: 'Logged by' }, { key: 'used_at', header: 'Used on', type: 'date' }],
    returns: [{ key: '_label', header: 'Return', get: (r) => `RET-${String(r.ret_no).padStart(4, '0')}` }, { key: 'source_type', header: 'Source' }, { key: '_src', header: 'Source ref', get: (r) => (r.source_type === 'repair' ? `JOB-${String(r.job_no).padStart(4, '0')}` : `ASG-${String(r.asg_no).padStart(4, '0')}`) }, { key: 'item_sku', header: 'Component SKU' }, { key: 'restocked', header: 'Restocked', type: 'boolean' }, { key: 'created_at', header: 'Returned on', type: 'date' }],
    repairs: [{ key: '_label', header: 'Job', get: (r) => `JOB-${String(r.job_no).padStart(4, '0')}` }, { key: 'status', header: 'Status' }, { key: 'technician_name', header: 'Technician' }, { key: 'created_at', header: 'Opened', type: 'date' }, { key: 'completed_at', header: 'Completed', type: 'date' }],
  };
};

function numFmt(type) {
  return type === 'currency' ? '#,##0.00' : type === 'number' ? '#,##0.##' : type === 'date' ? 'yyyy-mm-dd' : undefined;
}
const colLetter = (n) => { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - m) / 26); } return s; };

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.height = 22;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFDD0A' }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1621' } };
    c.alignment = { vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function assertEntity(req, entity) {
  if (!ENTITIES[entity] || !EXPORTABLE[entity]) throw new HttpError(404, `Unknown report "${entity}".`);
  if (!hasModule(req.config, EXPORTABLE[entity])) throw new HttpError(404, `${MODULE_MAP[EXPORTABLE[entity]].label} is not enabled on this site.`, 'module_disabled');
}

reportsRouter.get('/export/:entity', guard('reports_excel', 'export'), h(async (req, res) => {
  const { entity } = req.params;
  assertEntity(req, entity);
  const fields = fieldsFor(req.config, entity).filter((f) => f.key !== 'item_id');
  const prefix = PREFIX(req)[entity];
  const [sql, params] = SQL[entity](req.site.id);
  const raw = await withSite(req.site.id, (t) => t.rows(sql, params));
  const rows = raw.map((r) => ({ ...(entity === 'components' ? serializeItem(fields, r) : serialize(fields, r)), ...Object.fromEntries(prefix.filter((p) => p.get).map((p) => [p.key, p.get(r)])), ...Object.fromEntries(prefix.filter((p) => !p.get).map((p) => [p.key, r[p.key]])) }));

  const columns = [...prefix.map((p) => ({ key: p.key, header: p.header, type: p.type })), ...fields.filter((f) => !prefix.some((p) => p.key === f.key)).map((f) => ({ key: f.key, header: f.label, type: f.type, formula: f.formula }))];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsHub';
  const ws = wb.addWorksheet(ENTITY_LABEL[entity]);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, Math.min(40, c.header.length + 6)), style: numFmt(c.type) ? { numFmt: numFmt(c.type) } : {} }));
  const letter = Object.fromEntries(columns.map((c, i) => [c.key, colLetter(i + 1)]));
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const values = {};
    for (const c of columns) {
      let v = r[c.key];
      if (c.type === 'date' && v) v = new Date(v);
      if (c.formula) {
        try {
          const ast = parse(c.formula);
          const ok = [...new Set(JSON.stringify(ast).match(/"t":"id","v":"([a-z0-9_]+)"/g) || [])].every((m) => letter[m.match(/"v":"([a-z0-9_]+)"/)[1]]);
          if (ok) v = { formula: toExcelFormula(ast, (k) => `${letter[k]}${rowNo}`), result: v ?? 0 };
        } catch { /* keep value */ }
      }
      values[c.key] = v === undefined ? null : v;
    }
    ws.addRow(values);
  });
  styleHeader(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const info = wb.addWorksheet('About');
  [['Site', req.site.name], ['Report', ENTITY_LABEL[entity]], ['Rows', rows.length], ['Exported by', req.user.name], ['Role', req.role], ['Exported at', new Date().toISOString()]].forEach((r) => info.addRow(r));
  info.getColumn(1).font = { bold: true };
  info.getColumn(1).width = 14;
  info.getColumn(2).width = 40;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.site.slug}-${entity}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

reportsRouter.get('/template/:entity', guard('reports_excel', 'import'), h(async (req, res) => {
  const { entity } = req.params;
  if (!IMPORTABLE[entity]) throw new HttpError(404, 'Import is only available for components.');
  assertEntity(req, entity);
  const fields = fieldsFor(req.config, entity).filter((f) => !f.formula && !f.system && !f.hidden);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ENTITY_LABEL[entity]);
  ws.columns = fields.map((f) => ({ header: f.label, key: f.key, width: Math.max(14, f.label.length + 6) }));
  const sample = { sku: 'SAMPLE-001', name: 'Sample component', category: 'Misc', qty: 10, price: 1.5, reorder_level: 5 };
  ws.addRow(Object.fromEntries(fields.map((f) => [f.key, sample[f.key] ?? (f.type === 'select' ? f.options?.[0] : null)])));
  styleHeader(ws);
  const info = wb.addWorksheet('Help');
  info.addRow(['Required columns are marked * in the header row of this sheet in OpsHub. Calculated columns are ignored on import.']);
  fields.filter((f) => f.required).forEach((f) => info.addRow([`${f.label} is required`]));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.site.slug}-${entity}-template.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

const cellValue = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v;
};

reportsRouter.post('/import/:entity',
  guard('reports_excel', 'import'),
  express.raw({ type: () => true, limit: '10mb' }),
  h(async (req, res) => {
    const { entity } = req.params;
    if (!IMPORTABLE[entity]) throw new HttpError(404, 'Import is only available for components.');
    assertEntity(req, entity);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(422, 'Upload an .xlsx file as the request body.', 'validation_failed');
    const partial = req.query.partial === '1';
    const dryRun = req.query.dryRun === '1';
    const fields = fieldsFor(req.config, entity);
    const importable = fields.filter((f) => !f.formula && !f.system);

    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(req.body); } catch { throw new HttpError(422, 'That file is not a valid .xlsx workbook.', 'bad_file'); }
    const ws = wb.worksheets.find((w) => !['about', 'help'].includes(w.name.toLowerCase())) || wb.worksheets[0];
    if (!ws) throw new HttpError(422, 'The workbook has no sheets.', 'bad_file');

    const norm = (s) => String(s ?? '').replace(/\*/g, '').trim().toLowerCase();
    const headerMap = {};
    const ignored = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const hname = norm(cellValue(cell.value));
      const f = fields.find((x) => norm(x.label) === hname || x.key === hname);
      if (!f) ignored.push(String(cellValue(cell.value)));
      else if (f.formula || f.system) ignored.push(`${f.label} (calculated)`);
      else headerMap[col] = f;
    });
    const missing = importable.filter((f) => f.required && !Object.values(headerMap).includes(f)).map((f) => f.label);
    if (missing.length) throw new HttpError(422, `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`, 'missing_columns', { missing });
    if (ws.rowCount > 5001) throw new HttpError(422, 'Please import at most 5000 rows at a time.', 'too_many_rows');

    const parsed = [];
    const errors = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const obj = {};
      for (const [col, f] of Object.entries(headerMap)) {
        const v = cellValue(row.getCell(Number(col)).value);
        if (v !== null && v !== '') obj[f.key] = v;
      }
      if (!Object.keys(obj).length) return;
      try { parsed.push({ n, ...validateInput(fields, obj) }); } catch (e) {
        for (const er of e.details?.errors || [{ message: e.message }]) errors.push({ row: n, field: er.field, message: er.message });
      }
    });
    const seen = new Map();
    parsed.forEach((p) => { if (seen.has(p.core.sku)) errors.push({ row: p.n, field: 'sku', message: `Duplicate SKU "${p.core.sku}" (also on row ${seen.get(p.core.sku)})` }); else seen.set(p.core.sku, p.n); });

    if (errors.length && !partial) {
      throw new HttpError(422, `${errors.length} problem${errors.length > 1 ? 's' : ''} found - nothing was imported.`, 'import_failed', { errors: errors.slice(0, 100), ignored });
    }
    const bad = new Set(errors.map((e) => e.row));
    const good = parsed.filter((p) => !bad.has(p.n));
    if (dryRun) return res.json({ dry_run: true, would_create: null, valid_rows: good.length, errors: errors.slice(0, 100), ignored });

    const result = await withSite(req.site.id, async (t, repo) => {
      const existing = new Map((await repo.select('inventory_items', { limit: 5000 })).map((x) => [x.sku, x]));
      let created = 0;
      let updated = 0;
      for (const p of good) {
        const cur = existing.get(p.core.sku);
        const calc = withCalculated(fields, { ...p.core, ...p.data });
        if (cur) {
          const upd = await repo.update('inventory_items', cur.id, { ...p.core, data: { ...cur.data, ...p.data, ...calc }, updated_at: new Date().toISOString() });
          if (Number(upd.qty) !== Number(cur.qty)) await recordMovement(repo, cur, Number(upd.qty) - Number(cur.qty), 'import', { type: 'import' }, req.user.id);
          updated++;
        } else {
          const ins = await repo.insert('inventory_items', { ...p.core, data: { ...p.data, ...calc }, created_by: req.user.id });
          if (Number(ins.qty) > 0) await recordMovement(repo, { ...ins, qty: 0 }, ins.qty, 'import', { type: 'import' }, req.user.id);
          created++;
        }
      }
      await repo.audit(req.user.id, 'import', 'component', null, { created, updated, skipped: errors.length });
      return { created, updated };
    });
    res.json({ ...result, skipped: bad.size, errors: errors.slice(0, 100), ignored });
  }));
