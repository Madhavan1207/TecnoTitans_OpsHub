import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { ChevronsUpDown, Check, Home } from '../lib/icons.jsx';

/** Hub-wide site switcher: one login, jump between units. Each site loads with ITS OWN theme/layout/modules. */
export default function SiteSwitcher({ current, tone = 'light', compact = false, dropup }) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [direction, setDirection] = useState('down');
  const [align, setAlign] = useState('right');
  const nav = useNavigate();
  const token = useAuth((s) => s.token);
  const ref = useRef(null);

  useEffect(() => {
    if (token) http.get('/sites').then((r) => setSites(r.data)).catch(() => {});
  }, [token]);

  useEffect(() => {
    const f = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const isUp = dropup !== undefined ? dropup : (spaceBelow < 300 && spaceAbove > spaceBelow);
      setDirection(isUp ? 'up' : 'down');
      setAlign(rect.left < 220 ? 'left' : 'right');
    }
    setOpen((prev) => !prev);
  };

  const dark = tone === 'dark';
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="btn btn-sm"
        style={dark ? { background: 'transparent', color: 'inherit', borderColor: 'currentColor', boxShadow: 'none' } : {}}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ChevronsUpDown size={15} />{!compact && <span>Switch site</span>}
      </button>
      {open && (
        <div
          className={`absolute z-50 w-64 card p-1.5 max-h-[calc(100vh-100px)] overflow-y-auto ${
            direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${align === 'left' ? 'left-0' : 'right-0'}`}
          style={{ background: 'var(--surface)', color: 'var(--ink)' }}
          role="listbox"
        >
          <button
            className="w-full text-left px-3 py-2 rounded text-sm font-bold flex items-center gap-2 hover:bg-soft"
            onClick={() => { setOpen(false); nav('/'); }}
          >
            <Home size={15} /> Hub - all units
          </button>
          <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
          {sites.filter((s) => s.published).map((s) => (
            <button
              key={s.slug}
              role="option"
              aria-selected={s.slug === current}
              className="w-full text-left px-3 py-2 rounded flex items-center gap-2.5 hover:bg-soft"
              onClick={() => { setOpen(false); nav(`/s/${s.slug}`); }}
            >
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: s.theme?.primary, boxShadow: `0 0 0 2px ${s.theme?.accent || '#000'}` }} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold truncate">{s.name}</span>
                <span className="block text-[11px] opacity-60 truncate">{s.role_label} - {s.theme?.layout} layout</span>
              </span>
              {s.slug === current && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
