import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { DataTable, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip, Tabs, useAsync, Chip } from '../../components/ui.jsx';
import { Check, X } from '../../lib/icons.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { dtm, human } from '../../lib/format.js';

export default function Approvals() {
  const site = useSite();
  const [tab, setTab] = useState('queue');
  const [deciding, setDeciding] = useState(null);
  const { data, loading, error, reload } = useAsync(() => site.api.get('/approvals'), []);
  const hist = useAsync(() => site.api.get('/approvals/history'), []);
  const reqFields = site.fields('request').filter((f) => !f.core && !f.hidden);
  return (
    <>
      <PageHeader title="Approvals" subtitle={`Chain: ${site.mod('approval').levels.map((l) => l.label).join('  >  ')}. You see the steps your role can decide.`} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'queue', label: 'Waiting for you', count: data?.length }, { key: 'history', label: 'Decided' }]} />
      <div className="mt-5">
        {tab === 'queue' ? (loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.length ? <Empty title="All caught up" hint="Nothing is waiting for your approval." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((a) => (
              <div key={a.id} className="card panel-pad flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2"><div><div className="tag-mono font-bold">{a.label}</div><div className="text-lg font-bold leading-tight">{a.title}</div></div><StatusChip s={a.priority} /></div>
                <div className="text-sm text-muted">By <b className="text-ink">{a.requester_name || 'public'}</b>{a.item_name && <> - {a.request_qty} x <b className="text-ink">{a.item_name}</b></>}</div>
                {reqFields.length > 0 && <dl className="grid grid-cols-2 gap-2 text-xs">{reqFields.filter((f) => a.custom?.[f.key] != null && a.custom[f.key] !== '').map((f) => <div key={f.key}><dt className="label !mb-0">{f.label}</dt><dd className="font-medium">{typeof a.custom[f.key] === 'boolean' ? (a.custom[f.key] ? 'Yes' : 'No') : String(a.custom[f.key])}</dd></div>)}</dl>}
                <div className="flex items-center justify-between mt-auto pt-1"><Chip tone="info">Level {a.level}: {a.level_label || a.label_level || human(a.role)}</Chip>
                  <div className="flex gap-2"><button className="btn btn-sm btn-danger" onClick={() => setDeciding({ a, decision: 'reject' })}><X size={14} /> Reject</button><button className="btn btn-sm btn-ok" onClick={() => setDeciding({ a, decision: 'approve' })}><Check size={14} /> Approve</button></div></div>
              </div>))}
          </div>)) : (
          <div className="card"><DataTable rows={hist.data} columns={[{ key: 'label', label: 'Request', render: (r) => <b className="tag-mono">{r.label}</b> }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Decision', render: (r) => <StatusChip s={r.status} /> }, { key: 'decided_by_name', label: 'By' }, { key: 'decided_at', label: 'When', render: (r) => dtm(r.decided_at) }, { key: 'comment', label: 'Comment' }]} empty={<Empty title="No decisions yet" />} /></div>)}
      </div>
      {deciding && <Decide {...deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); reload(); hist.reload(); }} />}
    </>
  );
}

function Decide({ a, decision, onClose, onDone }) {
  const site = useSite();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await site.api.post(`/approvals/${a.id}/decide`, { decision, comment }); toast.ok(decision === 'approve' ? (r.request_status === 'approved' ? 'Approved - ready for the next step' : r.request_status === 'assigned' ? 'Approved and stock issued automatically' : 'Approved - waiting for the next level') : 'Rejected'); onDone(); } catch (e) { toast.bad(errMsg(e)); } finally { setBusy(false); }
  };
  const need = decision === 'reject' && site.mod('approval').requireComment;
  return (
    <Modal title={`${decision === 'approve' ? 'Approve' : 'Reject'} ${a.label}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${decision === 'approve' ? 'btn-ok' : 'btn-danger'}`} disabled={busy || (need && !comment.trim())} onClick={go}>{decision === 'approve' ? 'Approve' : 'Reject'}</button></>}>
      <div className="font-bold mb-3">{a.title}</div>
      <label className="label">Comment{need ? ' (required)' : ' (optional)'}</label>
      <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
    </Modal>
  );
}
