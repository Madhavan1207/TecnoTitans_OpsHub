import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { http, errMsg } from '../lib/api.js';
import { useAuth, toast } from '../lib/store.js';
import { Chip, Empty, Modal, PageHeader, Spinner, useAsync } from '../components/ui.jsx';
import { ArrowRight, Plus, Wrench, PanelLeft, PanelTop, Rows3 } from '../lib/icons.jsx';
import { themeVars } from '../lib/theme.js';
import { MODULE_MAP } from '@shared/registry.js';
import { PRESETS } from '@shared/presets.js';
import { money, num } from '../lib/format.js';

const LAYOUT_ICON = { sidebar: PanelLeft, topnav: PanelTop, rail: Rows3 };

export default function Hub() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const sites = useAsync(() => http.get('/sites').then((r) => r.data), []);
  const ov = useAsync(() => http.get('/hub/overview').then((r) => r.data), []);
  const [creating, setCreating] = useState(false);
  const stat = (slug) => ov.data?.find((o) => o.slug === slug);
  return (
    <>
      <PageHeader title="Your units" subtitle={`One login, ${sites.data?.length ?? '...'} operations sites. Each opens with its own theme, layout, modules and workflows.`}
        actions={user?.hubRole === 'admin' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New site</button>} />
      {sites.loading ? <Spinner /> : !sites.data?.length ? <Empty title="No sites yet" hint="Ask a hub admin to give you access to a site." /> : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:gap-6">
          {sites.data.map((s) => {
            const st = stat(s.slug);
            const LIcon = LAYOUT_ICON[s.theme?.layout] || PanelLeft;
            return (
              <article key={s.slug} className="card overflow-hidden flex flex-col">
                <div className="p-5 pb-4 flex flex-col gap-2" style={{ ...themeVars(s.theme), background: 'var(--bg)', color: 'var(--ink)', borderBottom: '2px solid #0D1621' }}>
                  <div className="flex items-center justify-between"><span className="w-10 h-10 rounded-theme grid place-items-center font-heading text-xl" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>{s.name[0]}</span>
                    <span className="chip" style={{ background: 'var(--surface)', color: 'var(--ink)' }}><LIcon size={12} /> {s.theme?.layout} layout</span></div>
                  <h3 className="font-heading text-3xl leading-none mt-1" style={{ fontFamily: 'var(--font-display)' }}>{s.name}</h3>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>{s.tagline}</p>
                  <div className="flex gap-1.5 mt-1">{[s.theme?.primary, s.theme?.accent, s.theme?.ink, s.theme?.surface].map((c, i) => <i key={i} className="w-5 h-5 rounded-full border border-black/20" style={{ background: c }} />)}</div>
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1 bg-white">
                  <div className="flex items-center gap-2 flex-wrap"><Chip tone="primary">{s.role_label}</Chip><Chip>{s.published ? `live v${s.version}` : 'not published'}</Chip></div>
                  <div className="flex flex-wrap gap-1">{s.modules.filter((m) => !MODULE_MAP[m]?.core).map((m) => <span key={m} className="chip chip-mute">{MODULE_MAP[m]?.label.split(' ')[0]}</span>)}</div>
                  {st && <div className="grid grid-cols-3 gap-2 text-center mt-1">
                    {st.items != null && <Stat k="Items" v={num(st.items)} />}{st.stock_value != null && <Stat k="Stock value" v={money(st.stock_value).replace('.00', '')} />}{st.low_stock != null && <Stat k="Low" v={st.low_stock} warn={st.low_stock > 0} />}
                    {st.open_requests != null && <Stat k="Open req." v={st.open_requests} />}{st.open_repairs != null && <Stat k="Repairs" v={st.open_repairs} />}{st.assignments != null && <Stat k="Issued" v={st.assignments} />}
                  </div>}
                  <div className="mt-auto pt-2 flex gap-2">
                    <Link to={`/s/${s.slug}`} className="btn btn-primary flex-1">Open <ArrowRight size={15} /></Link>
                    {s.role === 'admin' && <button className="btn" onClick={() => nav(`/builder/${s.slug}`)}><Wrench size={15} /> Builder</button>}
                  </div>
                </div>
              </article>);
          })}
        </div>)}
      {creating && <CreateSite onClose={() => setCreating(false)} onDone={(slug) => { setCreating(false); nav(`/builder/${slug}`); }} />}
    </>
  );
}
const Stat = ({ k, v, warn }) => <div className="rounded p-2" style={{ background: warn ? '#FEF3C7' : '#F4F1E8' }}><div className="text-lg font-bold leading-none tabular-nums">{v}</div><div className="text-[10px] uppercase tracking-wider text-muted mt-1">{k}</div></div>;

function CreateSite({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [preset, setPreset] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const { data } = await http.post('/sites', { name, slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), preset: preset || undefined }); toast.ok('Site created'); onDone(data.slug); } catch (e) { toast.bad(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Modal title="New site" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!name || busy} onClick={go}>Create and open builder</button></>}>
      <label className="label">Name</label><input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Field Labs" />
      <label className="label">URL slug</label><input className="input mb-1" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="auto from name" /><div className="help mb-4">Appears as /s/{slug || 'your-slug'}</div>
      <label className="label">Start from</label>
      <div className="grid gap-2">{[{ key: '', label: 'Blank site', desc: 'Only the always-on core modules.' }, ...PRESETS].map((p) => (
        <button key={p.key} type="button" onClick={() => setPreset(p.key)} className="card-flat panel-pad text-left" style={preset === p.key ? { borderColor: '#0D1621', boxShadow: '3px 3px 0 #FFDD0A', background: '#FFFBE0' } : {}}><b>{p.label}</b><div className="help">{p.desc}</div></button>))}</div>
    </Modal>
  );
}
