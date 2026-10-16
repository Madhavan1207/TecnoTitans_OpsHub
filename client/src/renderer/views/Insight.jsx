import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useSite } from '../SiteContext.jsx';
import { DataTable, Empty, ErrorBox, Kpi, PageHeader, Spinner, useAsync, Chip, Modal } from '../../components/ui.jsx';
import { Download, Upload, Lock, FileSpreadsheet, ShieldAlert } from '../../lib/icons.jsx';
import { saveBlob, errMsg, errDetails } from '../../lib/api.js';
import { toast } from '../../lib/store.js';
import { human, money, num } from '../../lib/format.js';

const COLORS = ['var(--primary)', 'var(--accent)', '#16A34A', '#D97706', '#DC2626', '#64748B', '#0EA5E9'];

function Widget({ w }) {
  const money$ = w.unit === 'currency';
  const tick = { fontSize: 11, fill: 'var(--muted)' };
  const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 6, color: 'var(--ink)', fontSize: 12 }, formatter: (v) => (money$ ? money(v) : num(v)) };
  if (w.type === 'kpis') return <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 col-span-full">{w.data.map((k) => <Kpi key={k.label} label={k.label} tone={k.tone} value={k.format === 'currency' ? money(k.value) : num(k.value)} />)}</div>;
  return (
    <div className="card panel-pad">
      <div className="font-heading text-lg mb-3">{w.title}</div>
      {w.type === 'table' ? (w.data.length ? <DataTable dense rows={w.data} columns={w.columns.map((c) => ({ key: c, label: human(c), num: ['qty', 'reorder_level'].includes(c) }))} /> : <Empty title="All stocked up" hint="Nothing below its reorder level." />) :
        !w.data.length ? <Empty title="No data yet" /> : (
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              {w.type === 'pie' ? (
                <PieChart><Pie data={w.data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={2} stroke="var(--surface)">{w.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} formatter={human} /></PieChart>
              ) : w.type === 'line' ? (
                <LineChart data={w.data}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="name" tick={tick} interval="preserveStartEnd" /><YAxis tick={tick} allowDecimals={false} width={36} /><Tooltip {...tip} /><Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={3} dot={{ r: 3, fill: 'var(--primary)', stroke: 'var(--accent)' }} /></LineChart>
              ) : (
                <BarChart data={w.data}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="name" tick={tick} interval={0} angle={-18} textAnchor="end" height={56} /><YAxis tick={tick} width={44} /><Tooltip {...tip} /><Bar dataKey="value" fill="var(--primary)" stroke="var(--accent)" strokeWidth={1.5} radius={[3, 3, 0, 0]} /></BarChart>
              )}
            </ResponsiveContainer>
          </div>)}
    </div>
  );
}

export function Analytics() {
  const site = useSite();
  const { data, loading, error, reload } = useAsync(() => site.api.get('/analytics'), []);
  return (
    <>
      <PageHeader title="Analytics" subtitle={`Live charts for ${site.config.name}. Only the modules this site runs are charted.`} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.widgets.length ? <Empty title="No charts selected" hint="Choose charts in the builder under Analytics settings." /> : (
        <div className="grid gap-4 xl:gap-5 lg:grid-cols-2">{data.widgets.map((w) => <Widget key={w.key} w={w} />)}</div>)}
    </>
  );
}

export function Reports() {
  const site = useSite();
  const { data, loading, error } = useAsync(() => site.api.get('/reports'), []);
  const [busy, setBusy] = useState('');
  const file = useRef(null);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const download = async (path, key) => { setBusy(key); try { saveBlob(await site.api.blob(path)); toast.ok('Download started'); } catch (e) { toast.bad(e.response?.status === 403 ? `Your role (${site.roleLabel}) cannot do that.` : errMsg(e)); } finally { setBusy(''); } };
  const run = async (partial) => {
    setBusy('import'); setResult(null);
    try { const buf = await pending.arrayBuffer(); const r = await site.api.upload('/reports/import/components', buf, partial ? { partial: 1 } : {}); setResult({ ok: true, ...r }); toast.ok(`Imported: ${r.created} new, ${r.updated} updated`); setPending(null); }
    catch (e) { setResult({ ok: false, message: errMsg(e), errors: errDetails(e)?.errors || [], ignored: errDetails(e)?.ignored }); }
    finally { setBusy(''); if (file.current) file.current.value = ''; }
  };
  const importable = data.entities.find((e) => e.importable);
  return (
    <>
      <PageHeader title="Reports" subtitle="Export to Excel (with live formulas) and bulk import. Access is controlled by role." icon={<FileSpreadsheet size={26} />} />
      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        <Chip tone={data.can_export ? 'ok' : 'bad'}>{data.can_export ? <>Export allowed</> : <><Lock size={11} /> Export needs {data.export_min_role}</>}</Chip>
        <Chip tone={data.can_import ? 'ok' : 'bad'}>{data.can_import ? <>Import allowed</> : <><Lock size={11} /> Import needs {data.import_min_role}</>}</Chip>
        <Chip>You are: {site.roleLabel} ({site.role})</Chip>
      </div>
      <div className="grid gap-4 xl:gap-5 lg:grid-cols-2">
        <section className="card panel-pad"><div className="font-heading text-xl mb-3">Export</div>
          <div className="flex flex-col gap-2">{data.entities.map((e) => (
            <div key={e.entity} className="flex items-center justify-between card-flat panel-pad"><span className="font-bold">{e.label}</span>
              <button className="btn btn-sm" disabled={!data.can_export || busy === e.entity} onClick={() => download(`/reports/export/${e.entity}`, e.entity)} title={data.can_export ? '' : `Needs ${data.export_min_role}`}>{data.can_export ? <Download size={14} /> : <Lock size={14} />} .xlsx</button></div>))}</div>
        </section>
        <section className="card panel-pad"><div className="font-heading text-xl mb-3">Import components</div>
          {!importable ? <div className="help">Import is not available on this site.</div> : !data.can_import ? (
            <div className="card-flat panel-pad flex gap-3 text-sm"><ShieldAlert className="text-warn shrink-0" /><div>Only <b>{data.import_min_role}</b> and above can import. You are signed in as <b>{site.roleLabel}</b>.</div></div>
          ) : (
            <div className="flex flex-col gap-3">
              <button className="btn btn-sm self-start" onClick={() => download('/reports/template/components', 'tpl')}><Download size={14} /> Download template</button>
              <input ref={file} type="file" accept=".xlsx" className="input" onChange={(e) => { setPending(e.target.files[0] || null); setResult(null); }} />
              <div className="flex gap-2"><button className="btn btn-primary" disabled={!pending || busy === 'import'} onClick={() => run(false)}><Upload size={15} /> Import (all or nothing)</button>
                <button className="btn" disabled={!pending || busy === 'import'} onClick={() => run(true)}>Import valid rows only</button></div>
              <p className="help">Matching columns by header (label or key). Existing SKUs are updated, new SKUs created. Calculated columns are ignored.</p>
            </div>)}
          {result && (
            <div className="mt-4 card-flat panel-pad text-sm" style={{ borderColor: result.ok ? '#16A34A' : '#DC2626' }}>
              {result.ok ? <b>Done: {result.created} created, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ''}.</b> : <b className="text-bad">{result.message}</b>}
              {result.ignored?.length > 0 && <div className="help">Ignored columns: {result.ignored.join(', ')}</div>}
              {result.errors?.length > 0 && <ul className="mt-2 max-h-40 overflow-y-auto text-xs list-disc pl-5">{result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
            </div>)}
        </section>
      </div>
    </>
  );
}
void Modal;
