import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { DataTable, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip, useAsync, Chip } from '../../components/ui.jsx';
import { DynamicForm, buildPayload, initialValues, serverErrors } from '../../components/DynamicForm.jsx';
import { PackageCheck, AlertTriangle } from '../../lib/icons.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { dtm, num } from '../../lib/format.js';
import { ProgressBar } from './shared.jsx';

export default function Assignments() {
  const site = useSite();
  const desk = site.can('material_assignment', 'create');
  const ready = useAsync(() => (desk ? site.api.get('/assignments/ready') : Promise.resolve([])), []);
  const list = useAsync(() => site.api.get('/assignments'), []);
  const [issuing, setIssuing] = useState(null);
  const done = () => { setIssuing(null); ready.reload(); list.reload(); };
  return (
    <>
      <PageHeader title="Assignments" subtitle={desk ? 'Issue stock against approved requests. Stock is reduced in the same database transaction.' : 'Material issued to you.'} />
      {desk && (
        <section className="mb-8">
          <div className="label">Ready to issue {ready.data && <Chip tone="info">{ready.data.length}</Chip>}</div>
          {ready.loading && !ready.data ? <Spinner /> : !ready.data?.length ? <div className="card-flat"><Empty title="Nothing waiting" hint="Approved requests with a component will appear here." /></div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ready.data.map((r) => (
                <div key={r.id} className="card panel-pad flex flex-col gap-2.5">
                  <div className="flex justify-between"><span className="tag-mono font-bold">{r.label}</span><StatusChip s={r.priority} /></div>
                  <div className="font-bold leading-tight">{r.title}</div>
                  <div className="text-sm">{num(r.qty)} x {r.item_name} <span className="text-muted tag-mono">({r.item_sku})</span></div>
                  <div className="text-xs flex items-center gap-1.5" style={{ color: r.enough_stock ? '#16A34A' : '#DC2626' }}>{!r.enough_stock && <AlertTriangle size={13} />}Stock available: <b>{num(r.item_stock)}</b>{!r.enough_stock && ' - not enough'}</div>
                  <div className="text-xs text-muted">Requested by {r.requester_name || '-'}{r.data?.field_site ? ` for ${r.data.field_site}` : ''}</div>
                  <button className="btn btn-primary mt-auto" disabled={!r.enough_stock} onClick={() => setIssuing(r)}><PackageCheck size={16} /> Issue material</button>
                </div>))}
            </div>)}
        </section>)}
      <div className="label">Issued</div>
      <div className="card">
        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : (
          <DataTable rows={list.data} empty={<Empty title="No assignments yet" />} columns={[
            { key: 'label', label: 'No.', render: (a) => <b className="tag-mono">{a.label}</b> }, { key: 'item', label: 'Material', render: (a) => `${a.item_name}` },
            { key: 'assigned_to', label: 'Issued to' }, { key: 'qty', label: 'Qty', num: true, render: (a) => num(a.qty) },
            { key: 'progress', label: 'Consumed / returned', render: (a) => <div className="min-w-[150px]"><ProgressBar value={Number(a.qty_consumed) + Number(a.qty_returned)} max={Number(a.qty)} label={`${num(a.qty_consumed)} used, ${num(a.qty_returned)} returned, ${num(a.remaining)} left`} /></div> },
            ...site.fields('material_assignment').filter((f) => !f.core && !f.formula && !f.hidden).map((f) => ({ key: f.key, label: f.label })),
            { key: 'status', label: 'Status', render: (a) => <StatusChip s={a.status} /> }, { key: 'created_at', label: 'Issued', render: (a) => dtm(a.created_at) }]} />)}
      </div>
      {issuing && <Issue req={issuing} onClose={() => setIssuing(null)} onDone={done} />}
    </>
  );
}

function Issue({ req, onClose, onDone }) {
  const site = useSite();
  const fields = site.fields('material_assignment');
  const [v, setV] = useState(() => initialValues(fields, { qty: req.qty, assigned_to: req.data?.field_site || '' }));
  const [assignee, setAssignee] = useState(req.requester_id || '');
  const members = useAsync(() => (site.can('user_management', 'list') ? site.api.get('/members') : Promise.resolve([])), []);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const lock = site.mod('material_assignment').allowPartialQty === false ? ['qty'] : [];
  const go = async () => {
    setBusy(true); setErrs({});
    try { const r = await site.api.post('/assignments', { request_id: req.id, assignee_id: assignee ? Number(assignee) : undefined, ...buildPayload(fields, v) }); toast.ok(`${r.label} issued - stock updated`); onDone(); } catch (e) { setErrs(serverErrors(e)); toast.bad(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Issue ${req.label}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>{busy ? 'Issuing...' : 'Issue and reduce stock'}</button></>}>
      <div className="card-flat panel-pad mb-4 text-sm"><b>{req.title}</b><br />{num(req.qty)} x {req.item_name} - stock {num(req.item_stock)}</div>
      <DynamicForm fields={fields} value={v} onChange={setV} errors={errs} lockKeys={lock} />
      {site.can('user_management', 'list') && (
        <div className="mt-4"><label className="label">Assign to site member (so they can log usage)</label>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Nobody in particular</option>{(members.data || []).map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}</select></div>)}
    </Modal>
  );
}
