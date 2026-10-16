import { http, errMsg } from '../lib/api.js';
import { toast } from '../lib/store.js';
import { Chip, DataTable, Empty, Spinner, useAsync } from '../components/ui.jsx';
import { MODULE_MAP } from '@shared/registry.js';
import { RotateCcw, Rocket, Eye } from '../lib/icons.jsx';
import { dtm } from '../lib/format.js';

export default function Releases({ slug, onChanged }) {
  const versions = useAsync(() => http.get(`/sites/${slug}/versions`).then((r) => r.data), [slug]);
  const deploys = useAsync(() => http.get(`/sites/${slug}/deploys`).then((r) => r.data), [slug]);
  const rollback = async (v) => {
    if (!window.confirm(`Roll back ${slug} to v${v.version}? It goes live immediately for all users. Data is not affected.`)) return;
    try { await http.post(`/sites/${slug}/rollback`, { version: v.version, note: `Rolled back to v${v.version}` }); toast.ok(`v${v.version} is live again`); versions.reload(); deploys.reload(); onChanged?.(); } catch (e) { toast.bad(errMsg(e)); }
  };
  const diffChips = (d) => d && <>{d.added?.map((k) => <Chip key={`a${k}`} tone="ok">+ {MODULE_MAP[k]?.label}</Chip>)}{d.removed?.map((k) => <Chip key={`r${k}`} tone="bad">- {MODULE_MAP[k]?.label}</Chip>)}{d.changed?.map((k) => <Chip key={`c${k}`} tone="info">edited {MODULE_MAP[k]?.label}</Chip>)}{d.themeChanged && <Chip tone="info">theme</Chip>}</>;
  return (
    <div className="max-w-5xl mx-auto p-6 grid gap-8">
      <section><h2 className="font-heading text-3xl mb-1">Releases</h2><p className="text-sm text-muted mb-4">Every publish creates an immutable version. Roll back to any version in one click - it takes effect instantly with no restart.</p>
        {versions.loading ? <Spinner /> : !versions.data?.length ? <Empty title="Not published yet" hint="Publish from the canvas to create v1." /> : (
          <div className="flex flex-col gap-3">{versions.data.map((v) => (
            <div key={v.id} className="card panel-pad flex flex-wrap items-center gap-4" style={v.is_live ? { background: '#FFFBE0' } : {}}>
              <div className="font-heading text-4xl w-16">v{v.version}</div>
              <div className="flex-1 min-w-[240px]"><div className="font-bold">{v.note || 'No note'} {v.is_live && <Chip tone="ok">LIVE</Chip>}</div><div className="help">{v.created_by_name || 'system'} - {dtm(v.created_at)} - {v.modules.length} modules</div><div className="flex flex-wrap gap-1 mt-1.5">{diffChips(v.diff)}</div></div>
              {!v.is_live && <button className="btn btn-sm" onClick={() => rollback(v)}><RotateCcw size={14} /> Roll back to this</button>}
              {v.is_live && <a className="btn btn-sm" href={`/s/${slug}`} target="_blank" rel="noreferrer"><Eye size={14} /> Open live site</a>}
            </div>))}</div>)}
      </section>
      <section><h2 className="font-heading text-3xl mb-3">Deploy history</h2>
        <div className="card">{deploys.loading ? <Spinner /> : <DataTable rows={deploys.data} columns={[
          { key: 'created_at', label: 'When', render: (d) => dtm(d.created_at) },
          { key: 'action', label: 'Action', render: (d) => <Chip tone={d.action === 'publish' ? 'ok' : 'warn'}>{d.action === 'publish' ? <Rocket size={11} /> : <RotateCcw size={11} />}{d.action}</Chip> },
          { key: 'version', label: 'Version', render: (d) => <b>v{d.version}</b> }, { key: 'from_version', label: 'Replaced', render: (d) => (d.from_version ? `v${d.from_version}` : '-') },
          { key: 'actor_name', label: 'By' }, { key: 'note', label: 'Note' }]} empty={<Empty title="No deployments yet" />} />}</div></section>
    </div>
  );
}
