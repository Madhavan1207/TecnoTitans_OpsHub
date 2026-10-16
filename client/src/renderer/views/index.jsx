import { Link } from 'react-router-dom';
import { useSite } from '../SiteContext.jsx';
import { Icon } from '../../lib/icons.jsx';
import { Kpi, PageHeader, Spinner, useAsync, Chip } from '../../components/ui.jsx';
import { MODULE_MAP } from '@shared/registry.js';
import Inventory from './Inventory.jsx';
import Requests from './Requests.jsx';
import Approvals from './Approvals.jsx';
import Assignments from './Assignments.jsx';
import { Consumption, Returns, Repairs } from './Tracking.jsx';
import { Analytics, Reports } from './Insight.jsx';
import Team from './Team.jsx';
import { num, money } from '../../lib/format.js';

export const VIEWS = {
  inventory: Inventory, request: Requests, approval: Approvals, assignment_frontend: Assignments, consumption_tracking: Consumption,
  return_management: Returns, pcb_repair: Repairs, analytics: Analytics, reports_excel: Reports, user_management: Team,
};

/** Overview generated from the config: KPIs + "needs attention" + shortcuts for every page the site has. */
export function Overview() {
  const site = useSite();
  const kp = useAsync(() => (site.has('analytics') && site.can('analytics', 'view') ? site.api.get('/analytics') : Promise.resolve(null)), []);
  const appr = useAsync(() => (site.can('approval', 'list') ? site.api.get('/approvals') : Promise.resolve(null)), []);
  const ready = useAsync(() => (site.can('material_assignment', 'create') ? site.api.get('/assignments/ready') : Promise.resolve(null)), []);
  const low = useAsync(() => (site.can('inventory', 'list') && site.mod('inventory').lowStockAlerts ? site.api.get('/components', { low: 1 }) : Promise.resolve(null)), []);
  const kpis = kp.data?.widgets?.find((w) => w.key === 'kpis')?.data;
  const base = `${site.base}`;
  const att = [
    appr.data?.length > 0 && { to: 'approvals', label: `${appr.data.length} request${appr.data.length > 1 ? 's' : ''} waiting for your approval`, tone: 'warn' },
    ready.data?.length > 0 && { to: 'assignments', label: `${ready.data.length} approved request${ready.data.length > 1 ? 's' : ''} ready to issue`, tone: 'info' },
    low.data?.length > 0 && { to: 'inventory', label: `${low.data.length} component${low.data.length > 1 ? 's' : ''} at or below reorder level`, tone: 'warn' },
  ].filter(Boolean);
  return (
    <>
      <PageHeader title={site.mod('dashboard_shell').overviewTitle || 'Overview'} subtitle={`Welcome to ${site.config.name}. You are signed in as ${site.roleLabel}.`} />
      {kp.loading && site.has('analytics') ? <Spinner /> : kpis && <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">{kpis.map((k) => <Kpi key={k.label} label={k.label} tone={k.tone} value={k.format === 'currency' ? money(k.value) : num(k.value)} />)}</div>}
      {att.length > 0 && (
        <div className="card panel-pad mb-6"><div className="label">Needs attention</div>
          <ul className="flex flex-col gap-2">{att.map((a) => <li key={a.to}><Link className="flex items-center gap-2 font-bold hover:underline" to={`${base}/${a.to}${site.q}`}><Chip tone={a.tone}>!</Chip>{a.label}</Link></li>)}</ul></div>)}
      <div className="label">Jump to</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {site.config.pages.filter((p) => !p.hidden).map((p) => (
          <Link key={p.path} to={`${base}/${p.path}${site.q}`} className="card panel-pad flex gap-3 items-start transition-transform hover:-translate-y-0.5">
            <span className="w-10 h-10 rounded-theme grid place-items-center shrink-0" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}><Icon name={p.icon} size={20} /></span>
            <span><span className="block font-heading text-lg leading-tight">{p.title}</span><span className="block text-xs text-muted mt-0.5">{MODULE_MAP[p.module]?.desc}</span></span>
          </Link>))}
      </div>
    </>
  );
}
