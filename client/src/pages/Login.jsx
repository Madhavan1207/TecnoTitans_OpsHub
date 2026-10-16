import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { http, errMsg } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { Logo, useAsync } from '../components/ui.jsx';
import { ArrowRight, Zap } from '../lib/icons.jsx';

const DEMO = [
  ['Hub admin (everything)', 'admin@opshub.dev', 'Admin@123'], ['Stores keeper (manager)', 'stores@opshub.dev', 'Demo@1234'], ['Stores head (site admin)', 'storeadmin@opshub.dev', 'Demo@1234'],
  ['Service manager', 'servicemgr@opshub.dev', 'Demo@1234'], ['Technician (member)', 'tech@opshub.dev', 'Demo@1234'], ['Dispatcher (manager)', 'dispatch@opshub.dev', 'Demo@1234'], ['Field staff (member)', 'field@opshub.dev', 'Demo@1234'],
];

export default function Login() {
  const { token, setAuth } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pub = useAsync(() => http.get('/public/sites').then((r) => r.data), []);
  if (token) return <Navigate to={loc.state?.from || '/'} replace />;
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { const { data } = await http.post('/auth/login', { email, password }); setAuth(data.token, data.user); nav(loc.state?.from || '/', { replace: true }); } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative text-white p-8 lg:p-14 flex flex-col justify-between overflow-hidden" style={{ background: '#0D1621' }}>
        <div className="absolute inset-0 opacity-[.07]" style={{ backgroundImage: 'linear-gradient(#FFDD0A 1px, transparent 1px), linear-gradient(90deg, #FFDD0A 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
        <div className="relative"><Logo height={60} /></div>
        <div className="relative my-12 max-w-xl">
          <div className="stripe mb-6 w-40" />
          <h1 className="font-heading text-6xl lg:text-7xl leading-[.95]" style={{ color: '#FFDD0A', textShadow: '4px 4px 0 #1D4FB5' }}>One hub.<br />Every operation.</h1>
          <p className="mt-6 text-lg opacity-80">Sign in once and switch between Central Stores, Service Centre and Distribution - three different products running from one codebase and one configuration.</p>
        </div>
        <div className="relative">
          <div className="text-xs font-bold tracking-widest uppercase opacity-60 mb-2">Public directory</div>
          <div className="flex flex-wrap gap-2">{(pub.data || []).map((s) => <a key={s.slug} href={s.public_intake ? `/s/${s.slug}/submit` : undefined} className="px-3 py-1.5 text-sm font-bold flex items-center gap-2 rounded" style={{ background: 'rgba(255,255,255,.08)', border: `2px solid ${s.theme?.primary}` }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.theme?.primary }} />{s.name}{s.public_intake && <span className="text-[10px] opacity-70">submit a request</span>}</a>)}</div>
          {(pub.data || []).some((s) => s.public_intake) && <div className="mt-3 text-sm">Customer? <a className="underline font-bold" style={{ color: '#FFDD0A' }} href={`/s/${(pub.data || []).find((s) => s.public_intake).slug}/track`}>Track your request</a></div>}
        </div>
      </section>
      <section className="bg-grid flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <form onSubmit={submit} className="card p-7">
            <h2 className="font-heading text-3xl mb-1">Sign in</h2><p className="text-muted text-sm mb-5">Use your hub account. Roles are per site.</p>
            <label className="label">Email</label><input className="input mb-4" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="label">Password</label><input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {err && <div className="err-text mb-3">{err}</div>}
            <button className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? 'Signing in...' : <>Enter the hub <ArrowRight size={16} /></>}</button>
          </form>
          <div className="mt-6">
            <div className="label flex items-center gap-1"><Zap size={12} /> Demo accounts (click to fill)</div>
            <div className="flex flex-wrap gap-2">{DEMO.map(([l, e, p]) => <button key={e} type="button" className="chip hover:bg-[var(--primary)] cursor-pointer" onClick={() => { setEmail(e); setPassword(p); }}>{l}</button>)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
