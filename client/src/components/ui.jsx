import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Inbox, AlertTriangle, CheckCircle2, Info } from '../lib/icons.jsx';
import { useToasts } from '../lib/store.js';
import { human, statusTone } from '../lib/format.js';

export const Logo = ({ height = 38, className = '' }) => (
  <img src="/electrolyte-logo.png" alt="Electrolyte" style={{ height }} className={`block select-none ${className}`} draggable={false} />
);

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
