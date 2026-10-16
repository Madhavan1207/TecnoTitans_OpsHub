// Three genuinely different layouts, picked by config.theme.layout. Same data, different product feel.
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { Icon, LogOut, Eye, Wrench, ArrowLeft } from '../lib/icons.jsx';
import { Logo } from '../components/ui.jsx';
import SiteSwitcher from './SiteSwitcher.jsx';
import { useSite } from './SiteContext.jsx';
import { luminance } from '../lib/theme.js';

function useChrome() {
  const site = useSite();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const items = [
    ...(site.mod('dashboard_shell').showOverview ? [{ path: '', title: site.mod('dashboard_shell').overviewTitle || 'Overview', icon: 'Home' }] : []),
    ...site.config.pages.filter((p) => !p.hidden),
  ];
  const to = (p) => `${site.base}${p.path ? `/${p.path}` : ''}${site.q}`;
  const dark = luminance(site.config.theme.bg) < 0.3;
  const builderBtn = site.role === 'admin' && !site.preview && (
    <button className="btn btn-sm" onClick={() => nav(`/builder/${site.slug}`)} title="Open the visual builder"><Wrench size={14} /> Builder</button>
  );
  return { site, items, to, user, logout, dark, builderBtn, nav };
}

const PreviewBanner = () => {
  const site = useSite();
  const nav = useNavigate();
  if (!site.preview) return null;
  return (
    <div className="flex items-center justify-center gap-3 px-3 py-2 text-sm font-bold" style={{ background: '#FFDD0A', color: '#0D1621', borderBottom: '2px solid #0D1621' }}>
      <Eye size={16} /> PREVIEW of the unpublished draft - read only. Players see the live version.
      <button className="btn btn-sm btn-dark" onClick={() => nav(`/builder/${site.slug}`)}><ArrowLeft size={13} /> Back to builder</button>
    </div>
  );
};

const UserMenu = ({ inherit }) => {
  const { site, user, logout, nav } = useChrome();
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-right leading-tight hidden sm:block">
        <div className="text-sm font-bold">{user?.name}</div>
        <div className="text-[11px] opacity-70">{site.roleLabel}</div>
      </div>
      <button className="btn btn-sm btn-icon" style={inherit ? { background: 'transparent', color: 'inherit', borderColor: 'currentColor', boxShadow: 'none' } : {}} onClick={() => { logout(); nav('/login'); }} title="Sign out"><LogOut size={15} /></button>
    </div>
  );
};

/* ---------------- 1. SIDEBAR (Central Stores) ---------------- */
export function SidebarShell({ children }) {
  const { site, items, to, dark, builderBtn } = useChrome();
  const sbBg = dark ? 'var(--surface)' : 'var(--ink)';
  const sbFg = dark ? 'var(--ink)' : 'var(--bg)';
  return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <div className="flex flex-1 min-h-0">
        <aside className="w-52 xl:w-64 shrink-0 hidden md:flex flex-col sticky top-0 h-screen overflow-y-auto" style={{ background: sbBg, color: sbFg }}>
          <div className="px-5 pt-5 pb-4">
            <div className="font-heading text-3xl leading-none" style={{ color: 'var(--primary)' }}>{site.config.name}</div>
            <div className="text-xs opacity-70 mt-1.5">{site.config.tagline}</div>
          </div>
          <div className="stripe" />
          <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
            {items.map((p) => (
              <NavLink key={p.path} end={!p.path} to={to(p)} className="flex items-center gap-3 px-3 py-2.5 rounded-theme text-sm font-bold transition-colors"
                style={({ isActive }) => (isActive ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { color: 'inherit', opacity: 0.85 })}>
                <Icon name={p.icon} size={17} />{p.title}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
            <div className="flex items-center gap-2 flex-wrap"><SiteSwitcher current={site.slug} tone="dark" /> {builderBtn}</div>
            <Logo height={30} />
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 lg:px-6 xl:px-8 py-3" style={{ borderBottom: 'var(--bw) solid var(--line-strong)', background: 'var(--surface)' }}>
            <div className="md:hidden font-heading text-xl" style={{ color: 'var(--ink)' }}>{site.config.name}</div>
            <div className="hidden md:block text-xs font-bold uppercase tracking-widest text-muted">Electrolyte OpsHub / {site.config.name}</div>
            <div className="flex items-center gap-3"><div className="md:hidden"><SiteSwitcher current={site.slug} compact /></div><UserMenu /></div>
          </header>
          <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
            {items.map((p) => <NavLink key={p.path} end={!p.path} to={to(p)} className="chip" style={({ isActive }) => (isActive ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : {})}>{p.title}</NavLink>)}
          </nav>
          <main className="p-4 lg:p-6 xl:p-8 flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 2. TOP NAV (Service Centre) ---------------- */
export function TopNavShell({ children }) {
  const { site, items, to, builderBtn } = useChrome();
  return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', boxShadow: '0 2px 12px rgba(16,40,36,.05)' }}>
        <div className="max-w-6xl mx-auto px-5 flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full grid place-items-center font-heading text-lg" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>{site.config.name[0]}</span>
            <div className="leading-tight"><div className="font-heading text-xl">{site.config.name}</div><div className="text-[11px] text-muted">{site.config.tagline}</div></div>
          </div>
          <nav className="flex gap-1 flex-nowrap overflow-x-auto topnav-scroll order-3 w-full pt-1" style={{ borderTop: '1px solid var(--line)' }}>
            {items.map((p) => (
              <NavLink key={p.path} end={!p.path} to={to(p)} className="px-3 xl:px-3.5 py-2 text-sm font-bold rounded-full flex items-center gap-1.5 xl:gap-2 whitespace-nowrap shrink-0"
                style={({ isActive }) => (isActive ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { color: 'var(--muted)' })}>
                <Icon name={p.icon} size={15} />{p.title}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 order-2 ml-auto"><SiteSwitcher current={site.slug} />{builderBtn}<UserMenu /></div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 lg:p-5 xl:py-8">{children}</main>
      <footer className="py-5 flex items-center justify-center gap-3 text-xs text-muted"><span>Powered by</span><Logo height={24} /></footer>
    </div>
  );
}

/* ---------------- 3. ICON RAIL (Distribution) ---------------- */
export function RailShell({ children }) {
  const { site, items, to, builderBtn } = useChrome();
  return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <div className="flex flex-1 min-h-0">
        <aside className="w-[72px] shrink-0 sticky top-0 h-screen flex flex-col items-center py-4 gap-2" style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}>
          <div className="w-11 h-11 rounded-xl grid place-items-center font-heading text-2xl mb-2" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }} title={site.config.name}>{site.config.name[0]}</div>
          {items.map((p) => (
            <NavLink key={p.path} end={!p.path} to={to(p)} title={p.title} className="group relative w-11 h-11 rounded-xl grid place-items-center transition-colors"
              style={({ isActive }) => (isActive ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { color: 'var(--muted)' })}>
              <Icon name={p.icon} size={19} />
              <span className="pointer-events-none absolute left-14 z-50 px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{p.title}</span>
            </NavLink>
          ))}
          <div className="mt-auto flex flex-col items-center gap-2"><SiteSwitcher current={site.slug} compact />{builderBtn && <span className="scale-90">{builderBtn}</span>}</div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-baseline gap-3"><span className="font-heading text-xl">{site.config.name}</span><span className="text-xs text-muted">{site.config.tagline}</span></div>
            <div className="flex items-center gap-4"><Logo height={24} /><UserMenu /></div>
          </header>
          <main className="p-4 lg:p-6 flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

export const SHELLS = { sidebar: SidebarShell, topnav: TopNavShell, rail: RailShell };
