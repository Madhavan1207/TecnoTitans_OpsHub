import { useState } from 'react';
import { http, errMsg } from '../lib/api.js';
import { toast, useAuth } from '../lib/store.js';
import { Chip, DataTable, ErrorBox, Modal, PageHeader, Spinner, useAsync } from '../components/ui.jsx';
import { Plus } from '../lib/icons.jsx';

export default function HubUsers() {
  const me = useAuth((s) => s.user);
  const users = useAsync(() => http.get('/hub/users').then((r) => r.data), []);
  const sites = useAsync(() => http.get('/sites').then((r) => r.data), []);
  const [creating, setCreating] = useState(false);
  const setRole = async (u, siteId, role) => { try { await http.put(`/hub/users/${u.id}/memberships/${siteId}`, { role: role || null }); toast.ok('Access updated'); users.reload(); } catch (e) { toast.bad(errMsg(e)); } };
  const patch = async (u, body, msg) => { try { await http.patch(`/hub/users/${u.id}`, body); toast.ok(msg); users.reload(); } catch (e) { toast.bad(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Users" subtitle="One account per person across the whole hub. Give each person a role per site." actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New user</button>} />
      <div className="card">{users.loading || sites.loading ? <Spinner /> : users.error ? <ErrorBox error={users.error} /> : (
        <DataTable rows={users.data} columns={[
          { key: 'name', label: 'User', render: (u) => <div><b>{u.name}</b> {!u.is_active && <Chip tone="bad">locked</Chip>}<div className="help">{u.email}</div></div> },
          { key: 'hub', label: 'Hub', render: (u) => (u.hub_role === 'admin' ? <Chip tone="primary">hub admin</Chip> : <Chip>user</Chip>) },
          ...(sites.data || []).map((s) => ({ key: s.slug, label: s.name, render: (u) => { const m = u.memberships.find((x) => x.site_id === s.id); return u.hub_role === 'admin' ? <span className="text-muted text-xs">admin (implicit)</span> : (
            <select className="select !py-1 !w-auto" value={m?.role || ''} onChange={(e) => setRole(u, s.id, e.target.value)}><option value="">no access</option><option value="member">member</option><option value="manager">manager</option><option value="admin">admin</option></select>); } })),
          { key: 'x', label: '', render: (u) => u.id !== me.id && (<div className="flex gap-1"><button className="btn btn-sm" onClick={() => patch(u, { isActive: !u.is_active }, u.is_active ? 'User locked' : 'User unlocked')}>{u.is_active ? 'Lock' : 'Unlock'}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { const p = window.prompt('New password (min 8 characters)'); if (p) patch(u, { password: p }, 'Password changed'); }}>Reset password</button></div>) }]} />)}</div>
      {creating && <NewUser sites={sites.data || []} onClose={() => setCreating(false)} onDone={() => { setCreating(false); users.reload(); }} />}
    </>
  );
}
function NewUser({ sites, onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', hubRole: 'user' });
  const [mem, setMem] = useState({});
  const go = async () => { try { await http.post('/hub/users', { ...f, memberships: Object.entries(mem).filter(([, r]) => r).map(([siteId, role]) => ({ siteId, role })) }); toast.ok('User created'); onDone(); } catch (e) { toast.bad(errMsg(e)); } };
  return (
    <Modal title="New user" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}>Create user</button></>}>
      <div className="grid gap-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="label">Password (min 8)</label><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div><label className="label">Hub role</label><select className="select" value={f.hubRole} onChange={(e) => setF({ ...f, hubRole: e.target.value })}><option value="user">User</option><option value="admin">Hub admin</option></select></div>
        <div><label className="label">Site access</label>{sites.map((s) => <div key={s.id} className="flex items-center justify-between mb-1.5"><span className="text-sm font-bold">{s.name}</span><select className="select !w-auto !py-1" value={mem[s.id] || ''} onChange={(e) => setMem({ ...mem, [s.id]: e.target.value })}><option value="">no access</option><option value="member">member</option><option value="manager">manager</option><option value="admin">admin</option></select></div>)}</div>
      </div>
    </Modal>
  );
}
