import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { http, errMsg } from '../lib/api.js';
import { themeVars } from '../lib/theme.js';
import { Logo, Spinner, useAsync, Empty } from '../components/ui.jsx';
import { CheckCircle2, Circle, Loader2, XCircle, Search, MessageSquare } from '../lib/icons.jsx';
import { dtm } from '../lib/format.js';

/** Role: Public. The customer tracks their request by reference number. */
export default function PublicTrack() {
  const { slug } = useParams();
  const [qs] = useSearchParams();
  const meta = useAsync(() => http.get(`/public/sites/${slug}`).then((r) => r.data), [slug]);
  const [ref, setRef] = useState(qs.get('ref') || '');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qRef = qs.get('ref');
    if (qRef && !meta.loading && !meta.error) {
      setBusy(true);
      setErr('');
      http.post(`/${slug}/public/track`, { ref: qRef.trim() })
        .then((res) => setData(res.data))
        .catch((e2) => setErr(errMsg(e2)))
        .finally(() => setBusy(false));
    }
  }, [qs, slug, meta.loading, meta.error]);

  if (meta.loading) return <Spinner />;
  if (meta.error) return <div className="min-h-screen grid place-items-center"><Empty title="Not available" hint="This site does not offer request tracking." /></div>;

  const go = async (e) => {
    e?.preventDefault();
    if (!ref.trim()) return;
    setBusy(true);
    setErr('');
    setData(null);
    try {
      setData((await http.post(`/${slug}/public/track`, { ref: ref.trim() })).data);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="themed min-h-screen py-10 px-4" style={themeVars(meta.data.theme)}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6"><div className="font-heading text-4xl">{meta.data.name}</div><div className="text-muted">Track your request</div></div>
        <form onSubmit={go} className="card p-6 flex flex-col gap-4">
          <div><label className="label">Reference number</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. SC-0012" required /></div>
          {err && <div className="err-text">{err}</div>}
          <button className="btn btn-primary !py-3" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />} Check status</button>
        </form>
        {data && (
          <div className="card p-6 mt-6">
            <div className="flex items-center justify-between gap-3 mb-1"><div className="font-heading text-2xl">{data.label}</div>{data.device && <span className="chip">{data.device}</span>}</div>
            <div className="text-muted mb-5">{data.title}</div>
            <ol className="flex flex-col">
              {data.steps.map((s, i) => (
                <li key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {s.bad ? <XCircle size={24} className="text-bad" /> : s.state === 'done' ? <CheckCircle2 size={24} className="text-ok" /> : s.state === 'current' ? <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} /> : <Circle size={24} className="text-muted" />}
                    {i < data.steps.length - 1 && <div className="w-0.5 flex-1 my-1" style={{ background: s.state === 'done' ? '#16A34A' : 'var(--line)', minHeight: 18 }} />}
                  </div>
                  <div className="pb-4"><div className="font-bold" style={{ opacity: s.state === 'todo' ? 0.45 : 1 }}>{s.label}</div>{s.state === 'current' && !s.bad && <div className="help">We are here</div>}</div>
                </li>))}
            </ol>
            {data.messages.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="label flex items-center gap-1.5"><MessageSquare size={13} /> Messages we sent you</div>
                <ul className="flex flex-col gap-2">{data.messages.map((m, i) => <li key={i} className="card-flat panel-pad text-sm"><div className="italic">&ldquo;{m.message}&rdquo;</div><div className="help">{m.label} - {dtm(m.at)}</div></li>)}</ul>
              </div>)}
          </div>)}
        <div className="flex justify-center items-center gap-3 mt-8 text-xs text-muted"><Link className="underline" to={`/s/${slug}/submit`}>Submit a new request</Link><span>Powered by</span><Logo height={24} /></div>
      </div>
    </div>
  );
}
