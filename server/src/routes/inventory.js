import { Router } from 'express';
import { withSite } from '../db.js';
import { guard, h, HttpError } from '../core.js';
import { fieldsFor, serialize, validateInput, withCalculated } from '../entities.js';

const ENT = 'components';

export async function recordMovement(repo, item, delta, reason, ref, actorId = null) {
  ref = ref || {};
  return repo.insert('stock_movements', {
    item_id: item.id, delta, balance: Number(item.qty) + Number(delta), reason, ref_type: ref.type || null, ref_id: ref.id || null, actor_id: actorId,
  });
}

/** Lock an item row and change its quantity atomically. Throws 409 if stock would go negative. */
export async function changeStock(repo, itemId, delta, reason, ref, actorId) {
  const item = await repo.get('inventory_items', itemId, { forUpdate: true });
  if (!item) throw new HttpError(404, 'Component not found on this site.');
  const next = Number(item.qty) + Number(delta);
  if (next < 0) {
    throw new HttpError(409, `Not enough stock for ${item.name}: ${item.qty} available, ${Math.abs(delta)} needed.`, 'insufficient_stock', { available: item.qty, needed: Math.abs(delta), item_id: item.id });
  }
  const updated = await repo.update('inventory_items', item.id, { qty: next, updated_at: new Date().toISOString() });
  await recordMovement(repo, item, delta, reason, ref, actorId);
  return { before: item, after: updated };
}

export const serializeItem = (fields, row) => ({ ...serialize(fields, row), low_stock: Number(row.reorder_level) > 0 && Number(row.qty) <= Number(row.reorder_level) });

const r = Router({ mergeParams: true });

r.get('/', guard('inventory', 'list'), h(async (req, res) => {
  const fields = fieldsFor(req.config, ENT);
  const q = req.query.q ? `%${String(req.query.q).slice(0, 60)}%` : null;
  const cat = req.query.category ? String(req.query.category) : null;
  const low = req.query.low === '1' ? true : null;
  const rows = await withSite(req.site.id, (t) => t.rows(
    `SELECT * FROM inventory_items WHERE site_id = $1
       AND ($2::text IS NULL OR sku ILIKE $2 OR name ILIKE $2 OR category ILIKE $2)
       AND ($3::text IS NULL OR category = $3)
       AND ($4::boolean IS NULL OR (reorder_level > 0 AND qty <= reorder_level))
     ORDER BY name LIMIT 3000`, [req.site.id, q, cat, low],
  ));
  res.json(rows.map((x) => serializeItem(fields, x)));
}));

r.get('/:id', guard('inventory', 'get'), h(async (req, res) => {
  const fields = fieldsFor(req.config, ENT);
  const row = await withSite(req.site.id, (t, repo) => repo.get('inventory_items', req.params.id));
  if (!row) throw new HttpError(404, 'Component not found.');
  res.json(serializeItem(fields, row));
}));

r.get('/:id/movements', guard('inventory', 'get'), h(async (req, res) => {
  const rows = await withSite(req.site.id, async (t, repo) => {
    if (!(await repo.get('inventory_items', req.params.id))) throw new HttpError(404, 'Component not found.');
    return t.rows(
      `SELECT m.*, u.name AS actor_name FROM stock_movements m LEFT JOIN users u ON u.id = m.actor_id
       WHERE m.site_id = $1 AND m.item_id = $2 ORDER BY m.id DESC LIMIT 100`, [req.site.id, Number(req.params.id)],
    );
  });
  res.json(rows);
}));

r.post('/', guard('inventory', 'create'), h(async (req, res) => {
  const fields = fieldsFor(req.config, ENT);
  const { core, data } = validateInput(fields, req.body);
  const row = await withSite(req.site.id, async (t, repo) => {
    if (await repo.findOne('inventory_items', { sku: core.sku })) throw new HttpError(409, `SKU "${core.sku}" already exists on this site.`, 'duplicate');
    const calc = withCalculated(fields, { ...core, ...data });
    const item = await repo.insert('inventory_items', { ...core, data: { ...data, ...calc }, created_by: req.user.id });
    if (Number(item.qty) > 0) await recordMovement(repo, { ...item, qty: 0 }, item.qty, 'receipt', { type: 'item', id: item.id }, req.user.id);
    await repo.audit(req.user.id, 'create', 'component', item.id, { sku: item.sku });
    return item;
  });
  res.status(201).json(serializeItem(fields, row));
}));

r.put('/:id', guard('inventory', 'update'), h(async (req, res) => {
  const fields = fieldsFor(req.config, ENT);
  const { core, data } = validateInput(fields, req.body, { partial: true });
  const row = await withSite(req.site.id, async (t, repo) => {
    const cur = await repo.get('inventory_items', req.params.id, { forUpdate: true });
    if (!cur) throw new HttpError(404, 'Component not found.');
    if (core.sku && core.sku !== cur.sku && (await repo.findOne('inventory_items', { sku: core.sku }))) throw new HttpError(409, `SKU "${core.sku}" already exists on this site.`, 'duplicate');
    const merged = { ...cur, ...core, data: { ...cur.data, ...data } };
    const calc = withCalculated(fields, merged);
    const upd = await repo.update('inventory_items', cur.id, { ...core, data: { ...cur.data, ...data, ...calc }, updated_at: new Date().toISOString() });
    if (core.qty !== undefined && Number(core.qty) !== Number(cur.qty)) {
      await recordMovement(repo, cur, Number(core.qty) - Number(cur.qty), 'adjustment', { type: 'item', id: cur.id }, req.user.id);
    }
    await repo.audit(req.user.id, 'update', 'component', cur.id, {});
    return upd;
  });
  res.json(serializeItem(fields, row));
}));

r.post('/:id/adjust', guard('inventory', 'adjust'), h(async (req, res) => {
  const fields = fieldsFor(req.config, ENT);
  const delta = Number(req.body?.delta);
  if (!Number.isFinite(delta) || delta === 0) throw new HttpError(422, 'delta must be a non-zero number.', 'validation_failed');
  const reason = ['receipt', 'adjustment'].includes(req.body?.reason) ? req.body.reason : delta > 0 ? 'receipt' : 'adjustment';
  const row = await withSite(req.site.id, async (t, repo) => {
    const { after } = await changeStock(repo, req.params.id, delta, reason, { type: 'item', id: Number(req.params.id) }, req.user.id);
    await repo.audit(req.user.id, 'adjust', 'component', after.id, { delta });
    return after;
  });
  res.json(serializeItem(fields, row));
}));

r.delete('/:id', guard('inventory', 'delete'), h(async (req, res) => {
  await withSite(req.site.id, async (t, repo) => {
    const gone = await repo.delete('inventory_items', req.params.id);
    if (!gone) throw new HttpError(404, 'Component not found.');
  });
  res.json({ deleted: true });
}));

export default r;
