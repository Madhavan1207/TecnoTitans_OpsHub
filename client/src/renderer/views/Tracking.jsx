import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { DataTable, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip, useAsync, Drawer } from '../../components/ui.jsx';
import { DynamicForm, buildPayload, initialValues, serverErrors, fieldColumns } from '../../components/DynamicForm.jsx';
import { Plus, Undo2, Wrench } from '../../lib/icons.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { dtm, human, money, num } from '../../lib/format.js';
import { ProgressBar, useComponentOptions } from './shared.jsx';

/* ------------------------------- Consumption ------------------------------- */
export function Consumption() {
  const site = useSite();
  const fields = site.fields('consumption_tracking');
  const asg = useAsync(() => site.api.get('/assignments'), []);
  const logs = useAsync(() => site.api.get('/consumption'), []);
  const [using, setUsing] = useState(null);
  const active = (asg.data || []).filter((a) => a.remaining > 0);
  const refresh = () => { setUsing(null); asg.reload(); logs.reload(); };
  return (
    <>
      <PageHeader title="Consumption" subtitle="Log how issued material is used in the field. Balances update instantly." />
      <div className="label">Open assignments</div>
      {asg.loading && !asg.data ? <Spinner /> : !active.length ? <div className="card-flat mb-8"><Empty title="Nothing to log" hint="Assignments with material left will appear here." /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8">
          {active.map((a) => (
            <div key={a.id} className="card panel-pad flex flex-col gap-2.5">
              <div className="flex justify-between"><b className="tag-mono">{a.label}</b><StatusChip s={a.status} /></div>
              <div className="font-bold">{a.item_name}</div><div className="text-xs text-muted">Issued to {a.assigned_to} - request {a.request_title}</div>
              <ProgressBar value={Number(a.qty_consumed)} max={Number(a.qty)} label={`${num(a.qty_consumed)} of ${num(a.qty)} used - ${num(a.remaining)} left`} />
              <button className="btn btn-primary btn-sm mt-1" onClick={() => setUsing(a)}><Plus size={14} /> Log usage</button>
            </div>))}
        </div>)}
      <div className="label">Usage log</div>
      <div className="card">{logs.loading && !logs.data ? <Spinner /> : <DataTable rows={logs.data} empty={<Empty title="No usage logged" />} columns={[{ key: 'label', label: 'Assignment', render: (r) => <b className="tag-mono">{r.label}</b> }, { key: 'item_name', label: 'Material' }, ...fieldColumns(fields), { key: 'used_by_name', label: 'By' }, { key: 'used_at', label: 'When', render: (r) => dtm(r.used_at) }]} />}</div>
      {using && <LogUse a={using} fields={fields} onClose={() => setUsing(null)} onDone={refresh} />}
    </>
  );
}
function LogUse({ a, fields, onClose, onDone }) {
  const site = useSite();
  const [v, setV] = useState(() => initialValues(fields));
  const [errs, setErrs] = useState({});
  const go = async () => { setErrs({}); try { const r = await site.api.post('/consumption', { assignment_id: a.id, ...buildPayload(fields, v) }); toast.ok(`Logged. ${num(r.remaining)} left.`); onDone(); } catch (e) { setErrs(serverErrors(e)); toast.bad(errMsg(e)); } };
  return <Modal title={`Log usage - ${a.label}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}>Save</button></>}><div className="help mb-3">{a.item_name}: {num(a.remaining)} left to use.</div><DynamicForm fields={fields} value={v} onChange={setV} errors={errs} /></Modal>;
}

/* --------------------------------- Returns --------------------------------- */
export function Returns() {
  const site = useSite();
  const fields = site.fields('return_management');
  const { data, loading, error, reload } = useAsync(() => site.api.get('/returns'), []);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader title="Returns" subtitle={site.mod('return_management').restockGood ? 'Material returned in good condition goes back into stock.' : 'Record returned material and repaired units.'}
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Undo2 size={16} /> New return</button>} />
      <div className="card">{loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : <DataTable rows={data} empty={<Empty title="No returns yet" />} columns={[
        { key: 'label', label: 'No.', render: (r) => <b className="tag-mono">{r.label}</b> }, { key: 'source_label', label: 'From', render: (r) => <span className="tag-mono">{r.source_label}</span> },
        { key: 'what', label: 'Item', render: (r) => r.item_name || r.device || '-' }, ...fieldColumns(fields, { skip: ['reason'] }),
        { key: 'restocked', label: 'Restocked', render: (r) => (r.source_type === 'repair' ? '-' : r.restocked ? 'Yes' : 'No') }, { key: 'created_by_name', label: 'By' }, { key: 'created_at', label: 'When', render: (r) => dtm(r.created_at) }]} />}</div>
      {creating && <NewReturn fields={fields} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
    </>
  );
}
function NewReturn({ fields, onClose, onDone }) {
  const site = useSite();
  const kinds = [site.has('material_assignment') && 'assignment', site.has('pcb_repair') && 'repair'].filter(Boolean);
  const [kind, setKind] = useState(kinds[0]);
  const [source, setSource] = useState('');
  const [v, setV] = useState(() => initialValues(fields));
  const [errs, setErrs] = useState({});
  const asg = useAsync(() => (kind === 'assignment' ? site.api.get('/assignments') : Promise.resolve([])), [kind]);
  const rep = useAsync(() => (kind === 'repair' ? site.api.get('/repairs') : Promise.resolve([])), [kind]);
  const lastStatus = site.has('pcb_repair') ? site.mod('pcb_repair').statuses.slice(-1)[0] : '';
  const options = kind === 'assignment' ? (asg.data || []).filter((a) => a.remaining > 0).map((a) => ({ id: a.id, label: `${a.label} - ${a.item_name} (${num(a.remaining)} returnable)` })) : (rep.data || []).filter((j) => j.status === lastStatus).map((j) => ({ id: j.id, label: `${j.label} - ${j.device}` }));
  const shown = kind === 'repair' ? fields.filter((f) => f.key !== 'qty') : fields;
  const go = async () => { setErrs({}); try { await site.api.post('/returns', { source_type: kind, [`${kind}_id`]: Number(source), ...buildPayload(fields, v) }); toast.ok('Return recorded'); onDone(); } catch (e) { setErrs(serverErrors(e)); toast.bad(errMsg(e)); } };
  return (
    <Modal title="New return" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!source} onClick={go}>Record return</button></>}>
      {kinds.length > 1 && <div className="flex gap-2 mb-4">{kinds.map((k) => <button key={k} className={`btn btn-sm ${kind === k ? 'btn-primary' : ''}`} onClick={() => { setKind(k); setSource(''); }}>{k === 'assignment' ? 'Return material' : 'Hand back repaired unit'}</button>)}</div>}
      <label className="label">{kind === 'assignment' ? 'Assignment' : 'Completed repair'}</label>
      <select className="select mb-4" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Select...</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      {kind === 'repair' && !options.length && <div className="help mb-3">Only completed repairs can be handed back.</div>}
      <DynamicForm fields={shown} value={v} onChange={setV} errors={errs} />
    </Modal>
  );
}

/* --------------------------------- Repairs --------------------------------- */
export function Repairs() {
  const site = useSite();
  const statuses = site.mod('pcb_repair').statuses;
  const cols = [...statuses, ...(site.has('return_management') || true ? ['returned'] : [])];
  const { data, loading, error, reload } = useAsync(() => site.api.get('/repairs'), []);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHeader title="Repairs" subtitle="PCB repair pipeline. Move jobs across, log parts (stock is reduced automatically) and hand units back."
        actions={site.can('pcb_repair', 'create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New repair job</button>} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="kanban">
          {cols.map((s) => {
            const jobs = (data || []).filter((j) => j.status === s);
            return (
              <div key={s} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1"><span className="font-heading text-lg">{human(s)}</span><span className="chip chip-mute">{jobs.length}</span></div>
                <div className="flex flex-col gap-3 p-2 rounded-theme min-h-[120px]" style={{ background: 'var(--soft)', border: '1px dashed var(--line)' }}>
                  {jobs.map((j) => (
                    <button key={j.id} className="card panel-pad text-left" onClick={() => setOpen(j)}>
                      <div className="flex justify-between"><b className="tag-mono">{j.label}</b>{j.request_label && <span className="tag-mono text-muted">{j.request_label}</span>}</div>
                      <div className="font-bold leading-tight mt-1">{j.device}</div>
                      {j.request_data?.customer_name && <div className="text-xs text-muted">{j.request_data.customer_name}</div>}
                      <div className="text-xs mt-2 flex justify-between"><span>{j.technician_name || 'Unassigned'}</span><b>{money(j.grand_total ?? j.total_cost ?? Number(j.labour_cost) + Number(j.parts_cost))}</b></div>
                    </button>))}
                </div>
              </div>);
          })}
        </div>)}
      {creating && <NewJob onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {open && <JobDrawer id={open.id} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function NewJob({ onClose, onDone }) {
  const site = useSite();
  const fields = site.fields('pcb_repair');
  const ready = useAsync(() => site.api.get('/repairs/ready'), []);
  const [rid, setRid] = useState('');
  const [v, setV] = useState(() => initialValues(fields));
  const [errs, setErrs] = useState({});
  const pick = (id) => { setRid(id); const r = ready.data?.find((x) => String(x.id) === String(id)); if (r) setV((p) => ({ ...p, device: p.device || r.data?.device_type || r.title, fault: p.fault || r.title })); };
  const go = async () => { setErrs({}); try { await site.api.post('/repairs', { request_id: rid ? Number(rid) : undefined, ...buildPayload(fields, v) }); toast.ok('Repair job opened'); onDone(); } catch (e) { setErrs(serverErrors(e)); toast.bad(errMsg(e)); } };
  return (
    <Modal title="New repair job" onClose={onClose} width={680} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}>Open job</button></>}>
      <label className="label">From approved request</label>
      <select className="select mb-4" value={rid} onChange={(e) => pick(e.target.value)}><option value="">Walk-in (no request)</option>{(ready.data || []).map((r) => <option key={r.id} value={r.id}>{r.label} - {r.title}{r.data?.customer_name ? ` (${r.data.customer_name})` : ''}</option>)}</select>
      <DynamicForm fields={fields} value={v} onChange={setV} errors={errs} columns={site.mod('dashboard_shell').formColumns} />
    </Modal>
  );
}

function JobDrawer({ id, onClose, onChanged }) {
  const site = useSite();
  const fields = site.fields('pcb_repair');
  const statuses = site.mod('pcb_repair').statuses;
  const { data: j, reload } = useAsync(() => site.api.get(`/repairs/${id}`), [id]);
  const { options } = useComponentOptions();
  const [part, setPart] = useState({ item: '', qty: 1 });
  const [labour, setLabour] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn, msg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.ok(msg);
      reload();
      onChanged?.();
    } catch (e) {
      toast.bad(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const closed = j?.status === 'returned';
  return (
    <Drawer title={j ? `${j.label} - ${j.device}` : 'Repair job'} onClose={onClose} width={560}>
      {!j ? <Spinner /> : (
        <div className="flex flex-col gap-5">
          <div className="card panel-pad">
            <div className="flex justify-between items-center mb-2"><StatusChip s={j.status} /><span className="text-xs text-muted">{j.technician_name}</span></div>
            <p className="text-sm mb-3">{j.fault}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {fields.filter((f) => !['device', 'fault'].includes(f.key) && !f.hidden && j[f.key] != null).map((f) => <div key={f.key}><dt className="label !mb-0.5">{f.label}{f.formula && ' (calc)'}</dt><dd className="font-bold">{f.type === 'currency' ? money(j[f.key]) : String(j[f.key])}</dd></div>)}
              {j.request_data?.customer_name && <div><dt className="label !mb-0.5">Customer</dt><dd className="font-bold">{j.request_data.customer_name} {j.request_data.customer_phone}</dd></div>}
            </dl>
          </div>
          {!closed && site.can('pcb_repair', 'update') && (
            <div className="card-flat panel-pad flex flex-col gap-3">
              <div className="label !mb-0">Move to status</div>
              <div className="flex flex-wrap gap-2">{statuses.map((s) => <button key={s} className={`btn btn-sm ${j.status === s ? 'btn-primary' : ''}`} disabled={busy || j.status === s} onClick={() => act(() => site.api.post(`/repairs/${id}/status`, { status: s, note: note || undefined }), `Moved to ${human(s)}`)}>{human(s)}</button>)}</div>
              <input className="input" placeholder="Optional note for the log" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2 items-end"><div className="flex-1"><label className="label">Labour cost</label><input className="input" type="number" min="0" value={labour ?? j.labour_cost} onChange={(e) => setLabour(e.target.value)} /></div><button className="btn btn-sm" onClick={() => act(() => site.api.put(`/repairs/${id}`, { labour_cost: Number(labour) }), 'Labour updated')}>Update</button></div>
            </div>)}
          {!closed && site.has('inventory') && site.can('pcb_repair', 'parts') && (
            <div className="card-flat panel-pad"><div className="label">Use a part (reduces stock)</div>
              <div className="flex gap-2"><select className="select" value={part.item} onChange={(e) => setPart({ ...part, item: e.target.value })}><option value="">Select part...</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                <input className="input !w-20" type="number" min="1" value={part.qty} onChange={(e) => setPart({ ...part, qty: e.target.value })} />
                <button className="btn btn-sm btn-primary" disabled={!part.item} onClick={() => act(() => site.api.post(`/repairs/${id}/parts`, { item_id: Number(part.item), qty: Number(part.qty) }), 'Part used - stock reduced')}><Wrench size={14} /> Add</button></div></div>)}
          <div><div className="label">Repair log</div>
            <ol className="flex flex-col gap-2">{j.logs.map((l) => <li key={l.id} className="card-flat panel-pad text-sm"><div>{l.entry}</div><div className="help">{l.actor_name || 'system'} - {dtm(l.created_at)}</div></li>)}</ol></div>
        </div>)}
    </Drawer>
  );
}
