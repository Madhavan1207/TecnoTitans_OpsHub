import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { DataTable, ErrorBox, PageHeader, Spinner, useAsync, Chip } from '../../components/ui.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { roleLabel } from '@shared/registry.js';

export default function Team() {
  const site = useSite();
  const { data, loading, error, reload } = useAsync(() => site.api.get('/members'), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const manage = site.can('user_management', 'manage');
  const change = async (m, r) => { try { await site.api.put(`/members/${m.user_id}`, { role: r }); toast.ok('Role updated'); reload(); } catch (e) { toast.bad(errMsg(e)); } };
  const remove = async (m) => { if (!window.confirm(`Remove ${m.name} from this site?`)) return; try { await site.api.del(`/members/${m.user_id}`); toast.ok('Removed'); reload(); } catch (e) { toast.bad(errMsg(e)); } };
  const add = async () => { try { await site.api.post('/members', { email, role }); setEmail(''); toast.ok('Member added'); reload(); } catch (e) { toast.bad(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Team" subtitle="People with access to this site and their role here. Accounts are created once in the hub." />
      {manage && <div className="card panel-pad mb-5 flex flex-wrap gap-3 items-end"><div className="flex-1 min-w-[220px]"><label className="label">Add existing hub user by email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        <div><label className="label">Role</label><select className="select" value={role} onChange={(e) => setRole(e.target.value)}>{['member', 'manager', 'admin'].map((r) => <option key={r} value={r}>{roleLabel(site.config, r)}</option>)}</select></div><button className="btn btn-primary" disabled={!email} onClick={add}>Add</button></div>}
      <div className="card">{loading ? <Spinner /> : error ? <ErrorBox error={error} /> : <DataTable rows={data} columns={[
        { key: 'name', label: 'Name', render: (m) => <b>{m.name}</b> }, { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role here', render: (m) => (manage ? <select className="select !w-auto !py-1" value={m.role} onChange={(e) => change(m, e.target.value)}>{['member', 'manager', 'admin'].map((r) => <option key={r} value={r}>{roleLabel(site.config, r)}</option>)}</select> : <Chip>{roleLabel(site.config, m.role)}</Chip>) },
        { key: 'hub_role', label: 'Hub', render: (m) => (m.hub_role === 'admin' ? <Chip tone="primary">hub admin</Chip> : '') },
        ...(manage ? [{ key: 'x', label: '', render: (m) => <button className="btn btn-sm btn-ghost" onClick={() => remove(m)}>Remove</button> }] : [])]} />}</div>
    </>
  );
}
