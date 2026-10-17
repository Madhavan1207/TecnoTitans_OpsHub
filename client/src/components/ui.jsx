import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Inbox, AlertTriangle, CheckCircle2, Info } from '../lib/icons.jsx';
import { useToasts } from '../lib/store.js';
import { human, statusTone } from '../lib/format.js';

export const Logo = ({ height = 38, className = '' }) => {
  const width = Math.round(height * (380 / 96));
  return (
    <svg
      viewBox="0 0 380 96"
      width={width}
      height={height}
      className={`block select-none ${className}`}
      draggable={false}
      role="img"
      aria-label="OpsHub"
      style={{ height, width: 'auto' }}
    >
      <defs>
        <radialGradient id="hubGlow" cx="54" cy="48" r="48" fx="54" fy="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#1D4FB5" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#0A0F18" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="topGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="leftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFDD0A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="rightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#1D4FB5" />
        </linearGradient>
        <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFDD0A" />
          <stop offset="100%" stopColor="#FACC15" />
        </linearGradient>
      </defs>

      <rect width="380" height="96" rx="20" fill="#0A0F18" stroke="#1E293B" strokeWidth="1.5" />
      <circle cx="54" cy="48" r="42" fill="url(#hubGlow)" />
      <ellipse cx="54" cy="48" rx="36" ry="16" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.65" transform="rotate(-18 54 48)" />
      <circle cx="20" cy="54" r="2.5" fill="#38BDF8" />
      <circle cx="88" cy="42" r="2.5" fill="#FFDD0A" />

      <polygon points="54,20 78,33.5 54,46 30,33.5" fill="url(#topGrad)" stroke="#0A0F18" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="54" cy="33.5" r="2" fill="#FFFFFF" opacity="0.9" />

      <polygon points="28.5,36 52.5,48.5 52.5,75 28.5,62.5" fill="url(#leftGrad)" stroke="#0A0F18" strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points="36,44 44,48 44,66" fill="none" stroke="#0A0F18" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <circle cx="36" cy="44" r="1.5" fill="#0A0F18" opacity="0.5" />

      <polygon points="55.5,48.5 79.5,36 79.5,62.5 55.5,75" fill="url(#rightGrad)" stroke="#0A0F18" strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points="72,44 64,48 64,66" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <circle cx="72" cy="44" r="1.5" fill="#FFFFFF" opacity="0.6" />

      <circle cx="54" cy="48" r="3.5" fill="#FFFFFF" />
      <circle cx="54" cy="48" r="6" fill="none" stroke="#38BDF8" strokeWidth="1" opacity="0.8" />

      <text x="110" y="56" fill="#FFFFFF" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '38px', fontWeight: 800, letterSpacing: '2px' }}>OPS</text>
      <rect x="194" y="26" width="84" height="36" rx="8" fill="url(#badgeGrad)" />
      <text x="236" y="52" textAnchor="middle" fill="#0A0F18" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '23px', fontWeight: 900, letterSpacing: '1.5px' }}>HUB</text>
      <circle cx="112" cy="74" r="2.5" fill="#10B981" />
      <text x="120" y="77" fill="#94A3B8" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', fontWeight: 600, letterSpacing: '2.5px' }}>OPERATIONS PLATFORM</text>
    </svg>
  );
};

export function useAsync(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true);
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: null }));
    try { const data = await fn(); if (alive.current) set({ data, loading: false, error: null }); return data; } catch (e) { if (alive.current) set({ data: null, loading: false, error: e }); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false; }; }, [run]);
  return { ...state, reload: run, setData: (data) => set((s) => ({ ...s, data })) };
}

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center justify-center gap-2 p-10 text-muted text-sm"><Loader2 className="animate-spin" size={18} /> {label}...</div>
);

export const Empty = ({ title = 'Nothing here yet', hint, children }) => (
  <div className="flex flex-col items-center text-center gap-2 p-10 text-muted">
    <Inbox size={34} />
    <div className="font-heading text-lg text-ink">{title}</div>
    {hint && <div className="text-sm max-w-sm">{hint}</div>}
    {children}
  </div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="card-flat p-4 flex items-start gap-3 border-bad" style={{ borderColor: '#DC2626' }}>
    <AlertTriangle className="text-bad shrink-0" size={20} />
    <div className="flex-1 text-sm">{error?.response?.data?.message || error?.message || 'Something went wrong.'}</div>
    {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
  </div>
);

export const StatusChip = ({ s }) => <span className={`chip ${statusTone(s)}`}>{human(s)}</span>;
export const Chip = ({ tone = 'mute', children, className = '' }) => <span className={`chip chip-${tone} ${className}`}>{children}</span>;

export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl leading-none flex items-center gap-2">{icon}{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 560, footer }) {
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(13,22,33,.55)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card w-full mt-[6vh] mb-10" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: 'var(--bw) solid var(--line-strong)' }}>
          <h2 className="font-heading text-xl">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3.5 flex justify-end gap-2" style={{ borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children, width = 520 }) {
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="fixed inset-0 z-40" style={{ background: 'rgba(13,22,33,.4)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="absolute right-0 top-0 h-full overflow-y-auto themed" style={{ width: `min(100%, ${width}px)`, borderLeft: 'var(--bw) solid var(--line-strong)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5" style={{ background: 'var(--surface)', borderBottom: 'var(--bw) solid var(--line-strong)' }}>
          <h2 className="font-heading text-xl">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div key={t.id} className="card px-4 py-3 flex items-start gap-2.5 text-sm font-medium" style={{ background: t.tone === 'bad' ? '#FEE2E2' : t.tone === 'info' ? '#DBEAFE' : '#DCFCE7', color: '#0D1621', borderColor: '#0D1621', boxShadow: '3px 3px 0 #0D1621' }}>
          {t.tone === 'bad' ? <AlertTriangle size={18} className="text-bad shrink-0" /> : t.tone === 'info' ? <Info size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="text-ok shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, tone, hint }) {
  const color = tone === 'warn' ? '#D97706' : tone === 'ok' ? '#16A34A' : tone === 'info' ? 'var(--accent)' : 'var(--ink)';
  return (
    <div className="card panel-pad">
      <div className="label !mb-1">{label}</div>
      <div className="text-3xl font-bold leading-none tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="help">{hint}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap" style={{ borderBottom: 'var(--bw) solid var(--line-strong)' }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} className="px-3.5 py-2 text-sm font-bold -mb-[2px]"
          style={{ borderBottom: `4px solid ${value === t.key ? 'var(--primary)' : 'transparent'}`, color: value === t.key ? 'var(--ink)' : 'var(--muted)' }}>
          {t.label}{t.count != null && <span className="ml-1.5 chip chip-mute">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function useConfirm() {
  return (msg) => window.confirm(msg);
}

export function DataTable({ columns, rows, onRowClick, empty, dense }) {
  if (!rows?.length) return empty || <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className={`tbl ${dense ? 'text-xs' : ''}`}>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
              {columns.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
