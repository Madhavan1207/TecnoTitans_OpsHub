// Demo data. Idempotent: does nothing if the hub already has users.
import { db, withSite } from '../src/db.js';
import { hashPassword } from '../src/core.js';
import { createSite } from '../src/sites.js';
import { buildTemplate } from '../../shared/presets.js';
import { issueAssignment, assignmentStatus } from '../src/routes/workflow.js';
import { changeStock } from '../src/routes/inventory.js';
import { withCalculated } from '../src/entities.js';
import { resolveFields } from '../../shared/registry.js';

export const DEMO_PASSWORD = 'Demo@1234';
export const ADMIN_PASSWORD = 'Admin@123';

const ago = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600 * 1000).toISOString();

const USERS = [
  ['admin@opshub.dev', 'Priya Menon (Hub Admin)', 'admin', ADMIN_PASSWORD],
  ['stores@opshub.dev', 'Rahul Sharma', 'user', DEMO_PASSWORD],
  ['storeadmin@opshub.dev', 'Kavita Nair', 'user', DEMO_PASSWORD],
  ['servicemgr@opshub.dev', 'Anita Desai', 'user', DEMO_PASSWORD],
  ['tech@opshub.dev', 'Vikram Rao', 'user', DEMO_PASSWORD],
  ['dispatch@opshub.dev', 'Meera Iyer', 'user', DEMO_PASSWORD],
  ['field@opshub.dev', 'Arjun Patil', 'user', DEMO_PASSWORD],
];
// [email, site, role]
const MEMBERS = [
  ['stores@opshub.dev', 'central-stores', 'manager'], ['stores@opshub.dev', 'distribution', 'member'],
  ['storeadmin@opshub.dev', 'central-stores', 'admin'],
  ['servicemgr@opshub.dev', 'service-centre', 'manager'],
  ['tech@opshub.dev', 'service-centre', 'member'], ['tech@opshub.dev', 'central-stores', 'member'],
  ['dispatch@opshub.dev', 'distribution', 'manager'],
  ['field@opshub.dev', 'distribution', 'member'],
];

const CENTRAL = [
  ['RES-10K-0603', '10k resistor 0603', 'Resistors', 12000, 0.02, 3000, 'Rack A1', 'Yageo'],
  ['RES-1K-0603', '1k resistor 0603', 'Resistors', 8000, 0.02, 3000, 'Rack A1', 'Yageo'],
  ['CAP-100N-0603', '100nF capacitor 0603', 'Capacitors', 15000, 0.03, 5000, 'Rack A2', 'Murata'],
  ['CAP-10U-1206', '10uF capacitor 1206', 'Capacitors', 900, 0.12, 1000, 'Rack A2', 'Murata'],
  ['IC-STM32F103', 'STM32F103C8T6 MCU', 'ICs', 240, 3.4, 100, 'Cabinet B1', 'STMicro'],
  ['IC-LM7805', 'LM7805 regulator', 'ICs', 60, 0.45, 80, 'Cabinet B1', 'TI'],
  ['IC-NE555', 'NE555 timer', 'ICs', 410, 0.3, 150, 'Cabinet B1', 'TI'],
  ['CON-USBC-16P', 'USB-C 16 pin connector', 'Connectors', 520, 0.38, 200, 'Rack C3', 'Amphenol'],
  ['CON-HDR-2X20', '2x20 pin header', 'Connectors', 330, 0.22, 150, 'Rack C3', 'Samtec'],
  ['PCB-BLANK-100', 'Blank PCB 100x100', 'PCBs', 85, 1.8, 50, 'Shelf D1', 'JLC'],
  ['LED-RED-0805', 'Red LED 0805', 'Optoelectronics', 4000, 0.04, 1500, 'Rack A3', 'Kingbright'],
  ['XTAL-8M', '8 MHz crystal', 'Passives', 35, 0.5, 60, 'Rack A3', 'Abracon'],
  ['CAB-USB-1M', 'USB cable 1 m', 'Cables', 150, 1.1, 50, 'Shelf E2', 'Generic'],
  ['FUSE-2A-5X20', '2A fuse 5x20', 'Protection', 700, 0.09, 300, 'Rack C1', 'Littelfuse'],
];
const SERVICE_PARTS = [
  ['BAT-LAP-14', 'Laptop battery 14"', 'Batteries', 14, 38, 5],
  ['DISP-FLEX-156', 'Display flex cable 15.6"', 'Cables', 22, 6.5, 8],
  ['DC-JACK-45', 'DC power jack 4.5mm', 'Connectors', 40, 1.2, 15],
  ['IC-BGA-EC', 'Embedded controller BGA', 'ICs', 6, 9.8, 5],
  ['CAP-TANT-100U', '100uF tantalum capacitor', 'Capacitors', 120, 0.35, 40],
  ['MOSFET-AO4407', 'AO4407 P-MOSFET', 'ICs', 55, 0.55, 20],
  ['KB-LAP-US', 'Laptop keyboard US', 'Keyboards', 3, 18, 4],
  ['THERM-PASTE', 'Thermal paste 4g', 'Consumables', 60, 2.1, 20],
];
const DIST = [
  ['CAB-USB-1M', 'USB cable 1 m', 'Cables', 400, 1.1, 120, 'pcs'],
  ['CAB-CAT6-305', 'Cat6 cable 305 m box', 'Cables', 18, 95, 6, 'box'],
  ['CON-RJ45', 'RJ45 connector', 'Connectors', 1500, 0.15, 400, 'pcs'],
  ['ENC-IP65-200', 'IP65 enclosure 200mm', 'Enclosures', 70, 14, 25, 'pcs'],
  ['FUSE-2A-5X20', '2A fuse 5x20', 'Protection', 300, 0.09, 150, 'pcs'],
  ['WIRE-RED-2.5', 'Red wire 2.5 mm', 'Wire', 900, 0.8, 300, 'm'],
  ['MCB-16A', 'MCB 16A single pole', 'Protection', 22, 3.9, 30, 'pcs'],
  ['TERM-BLK-12', '12-way terminal block', 'Connectors', 110, 0.6, 40, 'pcs'],
];

async function seedItems(site, rows, mapper) {
  const cfgFields = resolveFields(site.config, 'inventory');
  const out = {};
  await withSite(site.id, async (t, repo) => {
    for (const [i, row] of rows.entries()) {
      const { core, data } = mapper(row);
      const calc = withCalculated(cfgFields, { ...core, ...data });
      const item = await repo.insert('inventory_items', { ...core, data: { ...data, ...calc }, created_at: ago(30 - i) });
      await repo.insert('stock_movements', { item_id: item.id, delta: item.qty, balance: item.qty, reason: 'receipt', ref_type: 'item', ref_id: item.id, created_at: ago(30 - i) });
      out[core.sku] = item;
    }
  });
  return out;
}

export async function seedDemo({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  if ((await db().query('SELECT 1 FROM users LIMIT 1')).length) { log('Already seeded - skipping.'); return false; }

  const uid = {};
  for (const [email, name, role, pw] of USERS) {
    const [u] = await db().query('INSERT INTO users (email, name, password_hash, hub_role) VALUES ($1,$2,$3,$4) RETURNING id', [email, name, await hashPassword(pw), role]);
    uid[email] = u.id;
  }
  const sites = {};
  for (const slug of ['central-stores', 'service-centre', 'distribution']) {
    const config = buildTemplate(slug);
    const s = await createSite({ name: config.name, slug, tagline: config.tagline, config, actorId: uid['admin@opshub.dev'], publish: true });
    sites[slug] = { id: s.id, config };
    await db().query("DELETE FROM site_members WHERE site_id = $1 AND user_id = $2", [s.id, uid['admin@opshub.dev']]); // hub admin is implicit admin
  }
  for (const [email, slug, role] of MEMBERS) await db().query('INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3)', [sites[slug].id, uid[email], role]);
  log('users + sites created');

  /* ---------------- Central Stores: stock + movements ---------------- */
  const cs = await seedItems(sites['central-stores'], CENTRAL, ([sku, name, category, qty, price, reorder_level, location, supplier]) => ({ core: { sku, name, category, qty, price, reorder_level }, data: { location, supplier } }));
  await withSite(sites['central-stores'].id, async (t, repo) => {
    await changeStock(repo, cs['IC-LM7805'].id, -20, 'adjustment', null, uid['stores@opshub.dev']);
    await changeStock(repo, cs['CAP-100N-0603'].id, 5000, 'receipt', null, uid['stores@opshub.dev']);
  });

  /* ---------------- Service Centre: request -> approval -> repair -> return ---------------- */
  const svc = sites['service-centre'];
  const parts = await seedItems(svc, SERVICE_PARTS, ([sku, name, category, qty, price, reorder_level]) => ({ core: { sku, name, category, qty, price, reorder_level }, data: {} }));
  const manager = uid['servicemgr@opshub.dev']; const tech = uid['tech@opshub.dev'];
  const repairFields = resolveFields(svc.config, 'pcb_repair');
  const reqFields = resolveFields(svc.config, 'request');
  await withSite(svc.id, async (t, repo) => {
    const mk = async (title, customer, device_type, priority, status, days, extra = {}) => {
      const no = await repo.nextNo('request');
      const data = { customer_name: customer, customer_phone: '98200' + String(10000 + no * 137), device_type, warranty: no % 2 === 0, ...extra };
      const r = await repo.insert('requests', { req_no: no, title, qty: 1, priority, notes: null, status, requester_id: tech, data: { ...data, ...withCalculated(reqFields, { qty: 1, ...data }) }, created_at: ago(days), updated_at: ago(days) });
      const ap = await repo.insert('approvals', { request_id: r.id, level: 1, role: 'manager', label: 'Estimate approval', status: status === 'pending' ? 'pending' : status === 'rejected' ? 'rejected' : 'approved', decided_by: status === 'pending' ? null : manager, comment: status === 'rejected' ? 'Beyond economical repair' : null, decided_at: status === 'pending' ? null : ago(days, -2) });
      void ap; return r;
    };
    const openJob = async (rq, device, fault, status, labour, days, serial) => {
      const no = await repo.nextNo('repair');
      const data = { board_serial: serial, estimated_days: 3 };
      const j = await repo.insert('repair_jobs', { job_no: no, request_id: rq.id, device, fault, status, technician_id: tech, labour_cost: labour, parts_cost: 0, data, created_by: tech, created_at: ago(days), updated_at: ago(days) });
      await repo.insert('repair_logs', { repair_id: j.id, entry: 'Job opened', to_status: 'diagnosing', actor_id: tech, created_at: ago(days) });
      await repo.update('requests', rq.id, { status: 'assigned' });
      return j;
    };
    const usePart = async (job, sku, qty, days) => {
      const { after } = await changeStock(repo, parts[sku].id, -qty, 'repair_part', { type: 'repair', id: job.id }, tech);
      const cost = Math.round((Number(job.parts_cost) + qty * Number(after.price)) * 100) / 100;
      const upd = { ...job, parts_cost: cost };
      await repo.update('repair_jobs', job.id, { parts_cost: cost, data: { ...job.data, ...withCalculated(repairFields, upd) } });
      await repo.insert('repair_logs', { repair_id: job.id, entry: `Used ${qty} x ${after.name}`, part_item_id: after.id, part_qty: qty, actor_id: tech, created_at: ago(days) });
      job.parts_cost = cost; return job;
    };
    const setStatus = async (job, to, days, completed = false) => {
      await repo.update('repair_jobs', job.id, { status: to, completed_at: completed ? ago(days) : null, updated_at: ago(days) });
      await repo.insert('repair_logs', { repair_id: job.id, entry: `Status changed to ${to.replace(/_/g, ' ')}`, from_status: job.status, to_status: to, actor_id: tech, created_at: ago(days) });
      if (completed && job.request_id) await repo.update('requests', job.request_id, { status: 'fulfilled' });
      job.status = to;
    };
    const recalc = async (job) => repo.update('repair_jobs', job.id, { data: { ...job.data, ...withCalculated(repairFields, { ...job, ...job.data }) } });

    await mk('Laptop screen flickers', 'Sanjay Kulkarni', 'Laptop', 'high', 'pending', 0);
    await mk('Phone not charging', 'Neha Joshi', 'Phone', 'normal', 'pending', 1);
    await mk('TV no backlight', 'R. Fernandes', 'TV', 'normal', 'approved', 2);
    const r4 = await mk('Mainboard dead - no power', 'Omkar Pawar', 'Mainboard', 'urgent', 'approved', 6);
    const j4 = await openJob(r4, 'Dell Latitude 5420 board', 'No power, no LED', 'diagnosing', 40, 6, 'SN-D5420-8841');
    await setStatus(j4, 'repairing', 4); await usePart(j4, 'DC-JACK-45', 1, 4); await usePart(j4, 'MOSFET-AO4407', 2, 3); await recalc(j4);
    const r5 = await mk('Laptop battery drains fast', 'Sunita Rao', 'Laptop', 'normal', 'approved', 8);
    const j5 = await openJob(r5, 'HP Pavilion 15', 'Battery lasts 20 minutes', 'diagnosing', 25, 8, 'SN-HP15-2210');
    await setStatus(j5, 'awaiting_parts', 7); await usePart(j5, 'BAT-LAP-14', 1, 5); await setStatus(j5, 'testing', 4); await recalc(j5);
    const r6 = await mk('Keyboard keys unresponsive', 'Imran Shaikh', 'Laptop', 'low', 'approved', 10);
    const j6 = await openJob(r6, 'Lenovo ThinkPad E14', 'Several keys dead', 'diagnosing', 30, 10, 'SN-LT14-0932');
    await usePart(j6, 'KB-LAP-US', 1, 8); await setStatus(j6, 'completed', 6, true); await recalc(j6);
    const r7 = await mk('Display flex tear', 'Divya Shah', 'Laptop', 'normal', 'approved', 13);
    const j7 = await openJob(r7, 'Asus VivoBook 15', 'Flicker + vertical lines', 'diagnosing', 35, 13, 'SN-AV15-7710');
    await usePart(j7, 'DISP-FLEX-156', 1, 12); await setStatus(j7, 'completed', 10, true); await recalc(j7);
    await repo.update('repair_jobs', j7.id, { status: 'returned', returned_at: ago(9) });
    await repo.insert('repair_logs', { repair_id: j7.id, entry: 'Returned to customer', from_status: 'completed', to_status: 'returned', actor_id: tech, created_at: ago(9) });
    const rn = await repo.nextNo('return');
    await repo.insert('returns', { ret_no: rn, source_type: 'repair', repair_id: j7.id, qty: 1, condition: 'good', reason: 'Repaired unit handed back', restocked: false, created_by: manager, created_at: ago(9) });
    await mk('Water damage - TV mainboard', 'Hotel Sagar', 'Mainboard', 'normal', 'rejected', 11);
  });

  /* ---------------- Distribution: request -> assignment -> consumption ---------------- */
  const dist = sites['distribution'];
  const di = await seedItems(dist, DIST, ([sku, name, category, qty, price, reorder_level, uom]) => ({ core: { sku, name, category, qty, price, reorder_level }, data: { uom } }));
  const dispatcher = uid['dispatch@opshub.dev']; const field = uid['field@opshub.dev'];
  const dreq = resolveFields(dist.config, 'request');
  await withSite(dist.id, async (t, repo) => {
    const mk = async (title, sku, qty, site, status, days) => {
      const no = await repo.nextNo('request');
      const data = { field_site: site, needed_by: ago(-3).slice(0, 10) };
      return repo.insert('requests', { req_no: no, title, item_id: di[sku].id, qty, priority: 'normal', status, requester_id: field, data: { ...data, ...withCalculated(dreq, { qty, ...data }) }, created_at: ago(days), updated_at: ago(days) });
    };
    const issue = async (rq, to, days) => {
      const a = await issueAssignment(repo, { requestId: rq.id, assignedTo: to, assigneeId: field, data: { vehicle_no: 'MH-04-' + (1000 + rq.req_no * 17) }, actorId: dispatcher });
      await t.exec('UPDATE assignments SET created_at = $2 WHERE site_id = $3 AND id = $1', [a.id, ago(days), dist.id]);
      return a;
    };
    const use = async (a, qty, note, days) => {
      await repo.insert('consumption_logs', { assignment_id: a.id, qty, note, used_by: field, used_at: ago(days) });
      const cur = await repo.get('assignments', a.id);
      const next = { ...cur, qty_consumed: Number(cur.qty_consumed) + qty };
      await repo.update('assignments', a.id, { qty_consumed: next.qty_consumed, status: assignmentStatus(next) });
    };
    const r1 = await mk('Cat6 for Tower 3 rollout', 'CAB-CAT6-305', 4, 'Tower 3, Andheri', 'approved', 9);
    const a1 = await issue(r1, 'Cabling crew A', 8); await use(a1, 1, 'Floor 1 backbone', 6); await use(a1, 2, 'Floor 2 backbone', 4);
    const r2 = await mk('RJ45 connectors for patch panels', 'CON-RJ45', 300, 'Tower 3, Andheri', 'approved', 7);
    const a2 = await issue(r2, 'Cabling crew A', 6); await use(a2, 120, 'Patch panel F1', 5);
    const r3 = await mk('Enclosures for roadside units', 'ENC-IP65-200', 20, 'Highway site 12', 'approved', 5);
    const a3 = await issue(r3, 'Field team B', 4); await use(a3, 20, 'Installed RSU-01..20', 2);
    const r4 = await mk('Terminal blocks for substation', 'TERM-BLK-12', 40, 'Substation K', 'approved', 3);
    const a4 = await issue(r4, 'Electrical crew', 2); await use(a4, 10, 'Panel 1', 1);
    await mk('MCBs for new feeder', 'MCB-16A', 10, 'Substation K', 'approved', 1);
    await mk('Fuses for spares kit', 'FUSE-2A-5X20', 100, 'Depot', 'approved', 0);
    await mk('USB cables (cancelled - duplicate)', 'CAB-USB-1M', 50, 'Depot', 'cancelled', 4);
  });
  log('demo data loaded');
  return true;
}
