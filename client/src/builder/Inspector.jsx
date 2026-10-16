import { useState } from 'react';
import { MODULE_MAP, FIELD_TYPES, roleLabel, deepGet, deepSet, resolveFields, moduleConfig } from '@shared/registry.js';
import { validateFields, THEME_LAYOUTS } from '@shared/validate.js';
import { FORMULA_FUNCTIONS } from '@shared/formula.js';
import { THEME_PRESETS } from '../lib/theme.js';
import { Tabs, Chip } from '../components/ui.jsx';
import { Icon, Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Calculator, Lock, PanelLeft, PanelTop, Rows3, Info } from '../lib/icons.jsx';

const Toggle = ({ value, onChange, label }) => (
  <label className="flex items-center justify-between gap-3 py-1.5 text-sm font-medium cursor-pointer"><span>{label}</span>
    <button type="button" role="switch" aria-checked={!!value} onClick={() => onChange(!value)} className="w-11 h-6 rounded-full relative shrink-0" style={{ background: value ? '#16A34A' : '#CBD5E1', border: '2px solid #0D1621' }}><i className="absolute top-[1px] w-4 h-4 rounded-full bg-white border-2 border-[#0D1621] transition-all" style={{ left: value ? 21 : 1 }} /></button></label>
);

function Setting({ s, cfg, onChange }) {
  const v = deepGet(cfg, s.key);
  const set = (x) => onChange(deepSet(cfg, s.key, x));
  if (s.type === 'toggle') return <Toggle label={s.label} value={v} onChange={set} />;
  if (s.type === 'text') return <div><label className="label">{s.label}</label><input className="input" value={v ?? ''} onChange={(e) => set(e.target.value)} /></div>;
  if (s.type === 'number') return <div><label className="label">{s.label}</label><input className="input" type="number" min={s.min} max={s.max} value={v ?? ''} onChange={(e) => set(Number(e.target.value))} /></div>;
  if (s.type === 'select') return <div><label className="label">{s.label}</label><select className="select" value={v} onChange={(e) => set(Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}>{s.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  if (s.type === 'role') return <div><label className="label">{s.label}</label><select className="select" value={v} onChange={(e) => set(e.target.value)}>{s.roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>;
  if (s.type === 'multiselect') return <div><label className="label">{s.label}</label><div className="flex flex-wrap gap-1.5">{s.options.map((o) => { const on = (v || []).includes(o); return <button key={o} type="button" className={`chip cursor-pointer ${on ? 'chip-primary' : ''}`} onClick={() => set(on ? v.filter((x) => x !== o) : [...(v || []), o])}>{o.replace(/_/g, ' ')}</button>; })}</div></div>;
  if (s.type === 'list') {
    const list = v || [];
    return (
      <div><label className="label">{s.label}</label>
        {list.map((item, i) => (
          <div key={i} className="flex gap-1.5 mb-1.5"><input className="input !py-1.5" value={item} onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : x)))} />
            <button className="btn btn-sm btn-icon" disabled={i === 0} onClick={() => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}><ArrowUp size={13} /></button>
            <button className="btn btn-sm btn-icon" disabled={list.length <= 2} onClick={() => set(list.filter((_, j) => j !== i))}><Trash2 size={13} /></button></div>))}
        <button className="btn btn-sm" onClick={() => set([...list, `step_${list.length + 1}`])}><Plus size={13} /> Add step</button></div>
    );
  }
  if (s.type === 'levels') {
    const levels = v || [];
    return (
      <div><label className="label">{s.label}</label>
        {levels.map((l, i) => (
          <div key={i} className="card-flat p-2 mb-2 flex gap-1.5 items-center"><span className="chip chip-info">{i + 1}</span>
            <input className="input !py-1.5" value={l.label} onChange={(e) => set(levels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Step name" />
            <select className="select !w-28 !py-1.5" value={l.role} onChange={(e) => set(levels.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}><option value="manager">Manager</option><option value="admin">Admin</option></select>
            <button className="btn btn-sm btn-icon" disabled={levels.length <= 1} onClick={() => set(levels.filter((_, j) => j !== i))}><Trash2 size={13} /></button></div>))}
        <button className="btn btn-sm" disabled={levels.length >= 4} onClick={() => set([...levels, { role: 'admin', label: `Level ${levels.length + 1}` }])}><Plus size={13} /> Add approval level</button></div>
    );
  }
  return null;
}

/* ------------------------------ field editor ------------------------------ */
function FieldEditor({ config, moduleKey, update }) {
  const fields = resolveFields(config, moduleKey);
  const issues = validateFields(fields, moduleKey);
  const [open, setOpen] = useState(null);
  const save = (next) => update({ fields: next });
  const patch = (key, p) => save(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const move = (i, d) => { const n = [...fields]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  const add = (calc) => {
    let n = 1; while (fields.some((f) => f.key === `${calc ? 'calc' : 'field'}_${n}`)) n++;
    const key = `${calc ? 'calc' : 'field'}_${n}`;
    save([...fields, calc ? { key, label: 'New calculation', type: 'number', formula: '' } : { key, label: 'New field', type: 'text' }]);
    setOpen(key);
  };
  const numeric = fields.filter((f) => f.type === 'number' || f.type === 'currency').map((f) => f.key);
  return (
    <div>
      <div className="label flex items-center justify-between">Fields (form + table + Excel)<span className="normal-case tracking-normal font-medium">{fields.length}</span></div>
      <ul className="flex flex-col gap-1.5">
        {fields.map((f, i) => {
          const err = issues.filter((x) => x.field === f.key);
          const isOpen = open === f.key;
          return (
            <li key={f.key} className="card-flat" style={err.length ? { borderColor: '#DC2626' } : {}}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <button className="flex-1 min-w-0 text-left flex items-center gap-2" onClick={() => setOpen(isOpen ? null : f.key)}>
                  {f.formula !== undefined && !f.core ? <Calculator size={13} className="text-accent shrink-0" /> : f.core ? <Lock size={12} className="text-muted shrink-0" /> : <span className="w-3" />}
                  <span className="text-sm font-bold truncate">{f.label || f.key}</span><span className="tag-mono text-muted truncate">{f.key}</span>
                  {f.hidden && <EyeOff size={12} className="text-muted" />}</button>
                <Chip>{f.type}</Chip>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)}><ArrowUp size={12} /></button><button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
              </div>
              {err.length > 0 && <div className="px-2 pb-1.5 err-text">{err[0].message}</div>}
              {isOpen && (
                <div className="p-2.5 pt-1 grid gap-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                  <div><label className="label">Label</label><input className="input" value={f.label} onChange={(e) => patch(f.key, { label: e.target.value })} /></div>
                  {!f.core && <div><label className="label">Key (used in formulas and Excel)</label><input className="input tag-mono" value={f.key} onChange={(e) => { const nk = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'); save(fields.map((x) => (x.key === f.key ? { ...x, key: nk } : x))); setOpen(nk); }} /></div>}
                  {!f.core && f.formula === undefined && <div><label className="label">Type</label><select className="select" value={f.type} onChange={(e) => patch(f.key, { type: e.target.value })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>}
                  {f.formula !== undefined && !f.core && (
                    <div><label className="label">Formula</label><input className="input tag-mono" value={f.formula} onChange={(e) => patch(f.key, { formula: e.target.value })} placeholder="qty * price" />
                      <div className="help">Use field keys: <b>{numeric.filter((k) => k !== f.key).join(', ') || 'add number fields first'}</b>. Functions: {FORMULA_FUNCTIONS.join(', ')}.</div>
                      <select className="select mt-1.5" value={f.type} onChange={(e) => patch(f.key, { type: e.target.value })}><option value="number">Shows as number</option><option value="currency">Shows as currency</option></select></div>)}
                  {f.type === 'select' && !f.formula && <div><label className="label">Options (comma separated)</label><input className="input" value={(f.options || []).join(', ')} onChange={(e) => patch(f.key, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>}
                  {(f.type === 'number' || f.type === 'currency') && !f.formula && <div className="grid grid-cols-2 gap-2"><div><label className="label">Min</label><input className="input" type="number" value={f.min ?? ''} onChange={(e) => patch(f.key, { min: e.target.value === '' ? undefined : Number(e.target.value) })} /></div><div><label className="label">Max</label><input className="input" type="number" value={f.max ?? ''} onChange={(e) => patch(f.key, { max: e.target.value === '' ? undefined : Number(e.target.value) })} /></div></div>}
                  {!f.formula && !f.system && <div className="flex gap-4">{!f.core || !MODULE_MAP[moduleKey].fields.find((b) => b.key === f.key)?.required ? <Toggle label="Required" value={f.required} onChange={(x) => patch(f.key, { required: x })} /> : <span className="help">Always required</span>}</div>}
                  {f.core && !MODULE_MAP[moduleKey].fields.find((b) => b.key === f.key)?.required && <Toggle label="Hide from forms (uses default)" value={f.hidden} onChange={(x) => patch(f.key, { hidden: x })} />}
                  <div><label className="label">Help text</label><input className="input" value={f.help || ''} onChange={(e) => patch(f.key, { help: e.target.value })} /></div>
                  {!f.core && <button className="btn btn-sm btn-danger self-start" onClick={() => { save(fields.filter((x) => x.key !== f.key)); setOpen(null); }}><Trash2 size={13} /> Remove field</button>}
                </div>)}
            </li>);
        })}
      </ul>
      <div className="flex gap-2 mt-2.5"><button className="btn btn-sm" onClick={() => add(false)}><Plus size={13} /> Add field</button><button className="btn btn-sm" onClick={() => add(true)}><Calculator size={13} /> Add calculated field</button></div>
      <div className="help mt-2 flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Lock icon = built-in field (can be renamed or hidden, not removed). Changes apply to the form, the table, the API validation and Excel after you publish.</div>
    </div>
  );
}

/* -------------------------------- module tab -------------------------------- */
export function ModuleTab({ config, moduleKey, update, remove, issues }) {
  const m = MODULE_MAP[moduleKey];
  const cfg = moduleConfig(config, moduleKey);
  const node = config.modules.find((n) => n.type === moduleKey);
  const set = (next) => update({ ...(node.config || {}), ...next });
  return (
    <div className="flex flex-col gap-5">
      <div><div className="flex items-center gap-2"><span className="w-9 h-9 rounded grid place-items-center text-white" style={{ background: m.color }}><Icon name={m.icon} size={18} /></span><div><div className="font-heading text-xl leading-none">{m.label}</div><div className="help">{m.group}{m.resource ? ` - /api/:site/${m.resource}` : ''}</div></div></div>
        <p className="text-sm text-muted mt-2">{m.desc}</p></div>
      {issues.length > 0 && <ul className="card-flat panel-pad text-xs text-bad list-disc pl-6" style={{ borderColor: '#DC2626' }}>{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      {m.settings.length > 0 && <div className="flex flex-col gap-3"><div className="label !mb-0">Workflow settings</div>{m.settings.map((s) => <Setting key={s.key} s={s} cfg={cfg} onChange={(next) => set(Object.fromEntries(Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cfg[k])).map((k) => [k, next[k]])))} />)}</div>}
      {m.fields && <FieldEditor config={config} moduleKey={moduleKey} update={(p) => set(p)} />}
      {!m.core && <button className="btn btn-danger btn-sm self-start" onClick={remove}><Trash2 size={13} /> Remove from site</button>}
    </div>
  );
}

/* ---------------------------------- site tab ---------------------------------- */
const LAYOUTS = { sidebar: ['Sidebar', PanelLeft], topnav: ['Top tabs', PanelTop], rail: ['Icon rail', Rows3] };
export function SiteTab({ config, setConfig }) {
  const t = config.theme;
  const setTheme = (p) => setConfig({ ...config, theme: { ...t, ...p } });
  const colors = [['primary', 'Brand'], ['accent', 'Accent'], ['bg', 'Page'], ['surface', 'Cards'], ['ink', 'Text']];
  const movePage = (i, d) => { const n = [...config.pages]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setConfig({ ...config, pages: n }); };
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3"><div className="label !mb-0">Identity</div>
        <div><label className="label">Site name</label><input className="input" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} /></div>
        <div><label className="label">Tagline</label><input className="input" value={config.tagline || ''} onChange={(e) => setConfig({ ...config, tagline: e.target.value })} /></div>
        <div className="help">Address: <span className="tag-mono">/s/{config.slug}</span> (fixed after creation)</div></section>
      <section className="flex flex-col gap-3"><div className="label !mb-0">Layout (changes the whole screen structure)</div>
        <div className="grid grid-cols-3 gap-2">{THEME_LAYOUTS.map((l) => { const [name, I] = LAYOUTS[l]; return <button key={l} onClick={() => setTheme({ layout: l })} className="card-flat panel-pad flex flex-col items-center gap-1 text-xs font-bold" style={t.layout === l ? { borderColor: '#0D1621', boxShadow: '3px 3px 0 #FFDD0A', background: '#FFFBE0' } : {}}><I size={22} />{name}</button>; })}</div></section>
      <section className="flex flex-col gap-3"><div className="label !mb-0">Theme</div>
        <div className="flex flex-wrap gap-1.5">{THEME_PRESETS.map((p) => <button key={p.name} className="chip cursor-pointer" onClick={() => setTheme(p.theme)}><i className="w-3 h-3 rounded-full" style={{ background: p.theme.primary }} />{p.name}</button>)}</div>
        <div className="grid grid-cols-5 gap-2">{colors.map(([k, l]) => <div key={k} className="text-center"><input type="color" value={t[k]} onChange={(e) => setTheme({ [k]: e.target.value })} className="w-full h-9 p-0 border-2 border-[#0D1621] rounded cursor-pointer" /><div className="text-[10px] font-bold mt-1">{l}</div></div>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Card style</label><select className="select" value={t.shadow} onChange={(e) => setTheme({ shadow: e.target.value })}><option value="hard">Bold outline</option><option value="soft">Soft shadow</option><option value="flat">Flat</option></select></div>
          <div><label className="label">Font</label><select className="select" value={t.font} onChange={(e) => setTheme({ font: e.target.value })}><option value="grotesk">Grotesk</option><option value="serif">Serif</option><option value="mono">Mono</option></select></div>
          <div><label className="label">Headings</label><select className="select" value={t.heading} onChange={(e) => setTheme({ heading: e.target.value })}><option value="display">Display caps</option><option value="normal">Normal</option></select></div>
          <div><label className="label">Density</label><select className="select" value={t.density} onChange={(e) => setTheme({ density: e.target.value })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div></div>
        <div><label className="label">Corner radius: {t.radius}px</label><input type="range" min="0" max="24" value={t.radius} onChange={(e) => setTheme({ radius: Number(e.target.value) })} className="w-full" /></div></section>
      <section className="flex flex-col gap-2"><div className="label !mb-0">Role names on this site</div>
        {['member', 'manager', 'admin'].map((r) => <div key={r} className="flex items-center gap-2"><span className="chip w-20 justify-center">{r}</span><input className="input !py-1.5" value={config.roles?.[r]?.label ?? ''} placeholder={roleLabel({}, r)} onChange={(e) => setConfig({ ...config, roles: { ...config.roles, [r]: { label: e.target.value } } })} /></div>)}</section>
      <section className="flex flex-col gap-2"><div className="label !mb-0">Pages and navigation</div>
        {config.pages.map((p, i) => (
          <div key={p.path} className="flex items-center gap-1.5"><input className="input !py-1.5" value={p.title} onChange={(e) => setConfig({ ...config, pages: config.pages.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <button className="btn btn-sm btn-icon" onClick={() => setConfig({ ...config, pages: config.pages.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)) })} title={p.hidden ? 'Hidden' : 'Visible'}>{p.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            <button className="btn btn-sm btn-icon" onClick={() => movePage(i, -1)}><ArrowUp size={13} /></button><button className="btn btn-sm btn-icon" onClick={() => movePage(i, 1)}><ArrowDown size={13} /></button></div>))}
        {!config.pages.length && <div className="help">Add modules to create pages.</div>}</section>
    </div>
  );
}
export const _Tabs = Tabs;
