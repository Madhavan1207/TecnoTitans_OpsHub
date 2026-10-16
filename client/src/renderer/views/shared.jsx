import { useEffect, useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { num } from '../../lib/format.js';

/** Inventory options for ref fields, only when the site has inventory. */
export function useComponentOptions() {
  const site = useSite();
  const [opts, setOpts] = useState([]);
  const load = () => { if (site.has('inventory') && site.can('inventory', 'list')) site.api.get('/components').then((r) => setOpts(r.map((i) => ({ value: i.id, label: `${i.sku} - ${i.name} (stock ${num(i.qty)})`, item: i })))).catch(() => {}); };
  useEffect(load, [site.slug]); // eslint-disable-line
  return { options: opts, reload: load };
}

export const useAction = () => async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast.ok(okMsg); return r; } catch (e) { toast.bad(errMsg(e)); throw e; } };

export const ProgressBar = ({ value, max, label }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}><div className="h-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} /></div>
      {label && <div className="help">{label}</div>}
    </div>
  );
};
