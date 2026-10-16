import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { ChevronsUpDown, Check, Home } from '../lib/icons.jsx';

/** Hub-wide site switcher: one login, jump between units. Each site loads with ITS OWN theme/layout/modules. */
export default function SiteSwitcher({ current, tone = 'light', compact = false }) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const nav = useNavigate();
  const token = useAuth((s) => s.token);
  const ref = useRef(null);
  useEffect(() => { if (token) http.get('/sites').then((r) => setSites(r.data)).catch(() => {}); }, [token]);
  useEffect(() => { const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const dark = tone === 'dark';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="btn btn-sm" style={dark ? { background: 'transparent', color: 'inherit', borderColor: 'currentColor', boxShadow: 'none' } : {}} aria-haspopup="listbox">
        <ChevronsUpDown size={15} />{!compact && <span>Switch site</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-64 card p-1.5 right-0" style={{ background: 'var(--surface)', color: 'var(--ink)' }} role="listbox">
          <button className="w-full text-left px-3 py-2 rounded text-sm font-bold flex items-center gap-2 hover:bg-soft" onClick={() => { setOpen(false); nav('/'); }}><Home size={15} /> Hub - all units</button>
          <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
          {sites.filter((s) => s.published).map((s) => (
            <button key={s.slug} role="option" aria-selected={s.slug === current} className="w-full text-left px-3 py-2 rounded flex items-center gap-2.5 hover:bg-soft"
              onClick={() => { setOpen(false); nav(`/s/${s.slug}`); }}>
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: s.theme?.primary, boxShadow: `0 0 0 2px ${s.theme?.accent || '#000'}` }} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-bold truncate">{s.name}</span><span className="block text-[11px] opacity-60 truncate">{s.role_label} - {s.theme?.layout} layout</span></span>
              {s.slug === current && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
