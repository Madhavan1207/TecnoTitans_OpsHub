import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { Logo } from '../components/ui.jsx';
import { LogOut, LayoutGrid, Puzzle, UsersRound } from '../lib/icons.jsx';
import SiteSwitcher from '../renderer/SiteSwitcher.jsx';

export default function HubLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const link = ({ isActive }) => `px-3 py-2 text-sm font-bold flex items-center gap-2 rounded ${isActive ? 'bg-[#FFDD0A] text-[#0D1621]' : 'text-white/80 hover:text-white'}`;
  return (
    <div className="min-h-screen bg-grid">
      <header style={{ background: '#0D1621' }} className="text-white">
        <div className="max-w-7xl mx-auto px-5 py-2.5 flex flex-wrap items-center gap-5">
          <NavLink to="/"><Logo height={44} /></NavLink>
          <nav className="flex gap-1 flex-1">
            <NavLink end to="/" className={link}><LayoutGrid size={16} /> Hub</NavLink>
            <NavLink to="/catalogue" className={link}><Puzzle size={16} /> Module catalogue</NavLink>
            {user?.hubRole === 'admin' && <NavLink to="/users" className={link}><UsersRound size={16} /> Users</NavLink>}
          </nav>
          <SiteSwitcher tone="dark" />
          <div className="text-right leading-tight hidden sm:block"><div className="text-sm font-bold">{user?.name}</div><div className="text-[11px] opacity-60">{user?.hubRole === 'admin' ? 'Hub administrator' : 'Hub user'}</div></div>
          <button className="btn btn-sm btn-icon" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)', boxShadow: 'none' }} onClick={() => { logout(); nav('/login'); }} title="Sign out"><LogOut size={15} /></button>
        </div>
        <div className="stripe" />
      </header>
      <main className="max-w-7xl mx-auto p-5 md:p-8"><Outlet /></main>
    </div>
  );
}
