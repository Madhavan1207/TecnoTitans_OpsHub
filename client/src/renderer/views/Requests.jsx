import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { DataTable, Drawer, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip, Tabs, useAsync, Chip } from '../../components/ui.jsx';
import { DynamicForm, buildPayload, fieldColumns, initialValues, serverErrors, validateWithZod } from '../../components/DynamicForm.jsx';
import { Plus, CheckCircle2, XCircle, Clock, MessageSquare, Send, RotateCcw } from '../../lib/icons.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { dtm } from '../../lib/format.js';
import { useComponentOptions } from './shared.jsx';

export default function Requests() {
  const site = useSite();
  const fields = site.fields('request');
  const [tab, setTab] = useState('all');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const { options } = useComponentOptions();
  const { data, loading, error, reload } = useAsync(() => site.api.get('/requests'), []);
  const rows = (data || []).filter((r) => tab === 'all' || r.status === tab);
  const count = (s) => (data || []).filter((r) => r.status === s).length;
  const cols = [
    { key: 'label', label: 'No.', render: (r) => <span className="tag-mono font-bold">{r.label}</span> },
    ...fieldColumns(fields, { skip: ['notes'], refLabel: (r) => (r.item_name ? `${r.item_sku} - ${r.item_name}` : '-') }),
    { key: 'status', label: 'Status', render: (r) => <StatusChip s={r.status} /> },
    { key: 'requester_name', label: 'By', render: (r) => r.requester_name || <span className="text-muted">public</span> },
    { key: 'created_at', label: 'Raised', render: (r) => dtm(r.created_at) },
  ];
  return (
    <>
      <PageHeader title="Requests" subtitle={site.can('request', 'listAll') ? 'Every request on this site.' : 'Requests you have raised.'}
        actions={<>{site.mod('request').publicIntake && <a className="btn" href={`/s/${site.slug}/submit`} target="_blank" rel="noreferrer">Public form</a>}{site.can('request', 'create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New request</button>}</>} />
      <div className="card">
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'all', label: 'All', count: data?.length }, ...['pending', 'approved', 'assigned', 'fulfilled', 'rejected', 'cancelled'].map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), count: count(s) })).filter((t) => t.count)]} /></div>
        {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : <DataTable columns={cols} rows={rows} onRowClick={setOpen} empty={<Empty title="No requests" hint="Raise one with the button above." />} />}
      </div>
      {creating && <NewRequest fields={fields} options={options} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {open && <RequestDrawer id={open.id} fields={fields} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function NewRequest({ fields, options, onClose, onSaved }) {
  const site = useSite();
  const [v, setV] = useState(() => initialValues(fields));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErrs({});
    const check = validateWithZod(fields, v);
    if (!check.valid) {
      setErrs(check.errors);
      toast.bad(Object.values(check.errors)[0]);
      return;
    }
    setBusy(true);
    try {
      const r = await site.api.post('/requests', buildPayload(fields, v));
      toast.ok(`Request ${r.label} raised${r.status === 'pending' ? ' - waiting for approval' : ''}`);
      onSaved();
    } catch (e) {
      setErrs(serverErrors(e));
      toast.bad(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New request" onClose={onClose} width={680} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Submitting...' : 'Submit request'}</button></>}>
      <DynamicForm fields={fields} value={v} onChange={setV} errors={errs} columns={site.mod('dashboard_shell').formColumns} refOptions={{ components: options }} />
      {site.has('approval') && <p className="help mt-4 flex items-center gap-1"><Clock size={12} /> This site requires approval: {site.mod('approval').levels.map((l) => l.label).join(' then ')}.</p>}
    </Modal>
  );
}

function RequestDrawer({ id, fields, onClose, onChanged }) {
  const site = useSite();
  const { data: r, reload } = useAsync(() => site.api.get(`/requests/${id}`), [id]);
  const cancel = async () => { if (!window.confirm('Cancel this request?')) return; try { await site.api.post(`/requests/${id}/cancel`); toast.ok('Request cancelled'); reload(); onChanged(); } catch (e) { toast.bad(errMsg(e)); } };
  return (
    <Drawer title={r ? `${r.label}` : 'Request'} onClose={onClose}>
      {!r ? <Spinner /> : (
        <div className="flex flex-col gap-5">
          <div className="card panel-pad">
            <div className="flex items-center justify-between gap-2 mb-3"><div className="text-lg font-bold">{r.title}</div><StatusChip s={r.status} /></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {fields.filter((f) => !['title'].includes(f.key) && !f.hidden && r[f.key] != null && r[f.key] !== '').map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'col-span-2' : ''}><dt className="label !mb-0.5">{f.label}</dt><dd className="font-medium">{f.key === 'item_id' ? `${r.item_sku} - ${r.item_name}` : f.type === 'boolean' ? (r[f.key] ? 'Yes' : 'No') : String(r[f.key])}</dd></div>
              ))}
              <div><dt className="label !mb-0.5">Raised by</dt><dd className="font-medium">{r.requester_name || 'Public form'}</dd></div>
              <div><dt className="label !mb-0.5">Raised</dt><dd className="font-medium">{dtm(r.created_at)}</dd></div>
            </dl>
            {['pending', 'approved'].includes(r.status) && <button className="btn btn-sm mt-4" onClick={cancel}>Cancel request</button>}
          </div>
          {r.approvals?.length > 0 && (
            <div><div className="label">Approval chain</div>
              <ol className="flex flex-col gap-2">{r.approvals.map((a) => (
                <li key={a.id} className="card-flat panel-pad flex items-start gap-3">
                  {a.status === 'approved' ? <CheckCircle2 className="text-ok shrink-0" size={20} /> : a.status === 'rejected' ? <XCircle className="text-bad shrink-0" size={20} /> : <Clock className="text-muted shrink-0" size={20} />}
                  <div className="text-sm flex-1"><div className="font-bold">Level {a.level}: {a.label} <Chip>{a.role}</Chip></div>
                    <div className="text-muted">{a.status === 'pending' ? 'Waiting' : a.status === 'skipped' ? 'Skipped' : `${a.status} by ${a.decided_by_name || '-'} - ${dtm(a.decided_at)}`}</div>{a.comment && <div className="mt-1 italic">"{a.comment}"</div>}</div>
                </li>))}</ol></div>
          )}
          {site.mod('request').notifyCustomer && <Messages id={id} />}
          {(r.assignment || r.repair) && <div className="card-flat panel-pad text-sm">{r.assignment && <div>Issued as <b>ASG-{String(r.assignment.asg_no).padStart(4, '0')}</b> ({r.assignment.qty}) - <StatusChip s={r.assignment.status} /></div>}{r.repair && <div>Repair job <b>JOB-{String(r.repair.job_no).padStart(4, '0')}</b> - <StatusChip s={r.repair.status} /></div>}</div>}
        </div>
      )}
    </Drawer>
  );
}

const MSG_TONE = { sent: 'ok', failed: 'bad', queued: 'warn', sending: 'warn', skipped: 'mute' };
function Messages({ id }) {
  const site = useSite();
  const { data, reload } = useAsync(() => site.api.get(`/requests/${id}/notifications`), [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const manager = site.can('request', 'listAll');
  const send = async () => { setBusy(true); try { await site.api.post(`/requests/${id}/notify`, { message: text }); setText(''); toast.ok('Message sent to the customer'); reload(); } catch (e) { toast.bad(errMsg(e)); } finally { setBusy(false); } };
  const resend = async (n) => { try { await site.api.post(`/requests/${id}/notifications/${n.id}/resend`); toast.ok('Resent'); reload(); } catch (e) { toast.bad(errMsg(e)); } };
  return (
    <div>
      <div className="label flex items-center gap-1.5"><MessageSquare size={13} /> Customer SMS updates {data && <Chip>{data.length}</Chip>}</div>
      {!data ? <Spinner /> : !data.length ? <div className="help">No messages yet. The customer is texted automatically at each step once a phone number is on the request.</div> : (
        <ol className="flex flex-col gap-2">
          {data.map((n) => (
            <li key={n.id} className="card-flat panel-pad text-sm">
              <div className="flex items-center justify-between gap-2 mb-1"><b>{n.label}</b><Chip tone={MSG_TONE[n.status] || 'mute'}>{n.status}</Chip></div>
              <div className="italic">&ldquo;{n.message}&rdquo;</div>
              <div className="help flex items-center justify-between gap-2"><span>To {n.to_phone} - {dtm(n.sent_at || n.created_at)}{n.provider ? ` - via ${n.provider}` : ''}</span>
                {n.status === 'failed' && manager && <button className="btn btn-sm" onClick={() => resend(n)}><RotateCcw size={12} /> Resend</button>}</div>
              {n.error && <div className="err-text">{n.error}</div>}
            </li>))}
        </ol>)}
      {manager && (
        <div className="flex gap-2 mt-3"><input className="input" maxLength={300} placeholder="Send the customer a quick update..." value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || text.trim().length < 3} onClick={send}><Send size={14} /> Send</button></div>)}
    </div>
  );
}
