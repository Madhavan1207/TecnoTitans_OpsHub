import { MODULES, GROUPS, PORT_TYPES } from '@shared/registry.js';
import { PRESETS } from '@shared/presets.js';
import { Icon } from '../lib/icons.jsx';
import { Chip, PageHeader } from '../components/ui.jsx';

const Port = ({ t, label }) => <span className="chip" style={{ borderColor: PORT_TYPES[t].color, color: PORT_TYPES[t].color }}>{label}</span>;

export default function Catalogue() {
  return (
    <>
      <PageHeader title="Module catalogue" subtitle="The 13 approved modules. Each is a typed node: it accepts specific inputs and produces one typed output. Scope is frozen to these 13." />
      <div className="flex flex-wrap gap-3 mb-8">{PRESETS.map((p) => <div key={p.key} className="card panel-pad max-w-xs"><div className="font-heading text-lg">{p.label}</div><div className="help mb-2">{p.desc}</div><div className="flex flex-wrap gap-1">{p.modules.map((m) => <Chip key={m}>{MODULES.find((x) => x.key === m).label.split(' ')[0]}</Chip>)}</div></div>)}</div>
      {GROUPS.map((g) => (
        <section key={g} className="mb-8"><h2 className="font-heading text-2xl mb-3">{g}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.filter((m) => m.group === g).map((m) => (
              <article key={m.key} className="card panel-pad flex flex-col gap-2.5">
                <div className="flex items-start gap-3"><span className="w-10 h-10 rounded grid place-items-center text-white shrink-0" style={{ background: m.color }}><Icon name={m.icon} size={20} /></span>
                  <div><div className="text-[11px] font-bold text-muted">MODULE {String(m.no).padStart(2, '0')} {m.core && <Chip tone="primary">always on</Chip>}</div><h3 className="font-bold leading-tight">{m.label}</h3></div></div>
                <p className="text-sm text-muted">{m.desc}</p>
                <div className="text-xs space-y-1.5 mt-auto">
                  <div className="flex flex-wrap gap-1 items-center"><b className="w-12">Needs</b>{m.inputs.length ? m.inputs.map((i) => <span key={i.id} className="flex gap-1">{i.accepts.slice(0, 2).map((a) => <Port key={a} t={a} label={`${PORT_TYPES[a].label}${i.required ? '' : '?'}`} />)}</span>) : <span className="text-muted">nothing</span>}</div>
                  <div className="flex flex-wrap gap-1 items-center"><b className="w-12">Gives</b>{m.output ? <Port t={m.output.type} label={m.output.label} /> : <span className="text-muted">-</span>}</div>
                  {(m.requires.length > 0 || m.requiresAny.length > 0) && <div className="flex flex-wrap gap-1 items-center"><b className="w-12">Depends</b>{[...m.requires, ...m.requiresAny].map((r) => <Chip key={r}>{MODULES.find((x) => x.key === r).label.split(' ')[0]}</Chip>)}</div>}
                  {m.resource && <div className="tag-mono text-muted">/api/:siteId/{m.resource}</div>}
                </div>
              </article>))}
          </div></section>))}
    </>
  );
}
