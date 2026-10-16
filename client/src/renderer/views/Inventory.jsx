import { useState } from 'react';
import { useSite } from '../SiteContext.jsx';
import { Chip, DataTable, Drawer, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip, useAsync } from '../../components/ui.jsx';
import { DynamicForm, buildPayload, fieldColumns, initialValues, serverErrors } from '../../components/DynamicForm.jsx';
import { Plus, Search, AlertTriangle, Trash2, SlidersHorizontal } from '../../lib/icons.jsx';
import { toast } from '../../lib/store.js';
import { errMsg } from '../../lib/api.js';
import { dtm, human, num } from '../../lib/format.js';

export default function Inventory() {
  const site = useSite();
  const fields = site.fields('inventory');
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const { data, loading, error, reload } = useAsync(() => site.api.get('/components', { q: q || undefined, low: low ? 1 : undefined }), [q, low]);
  const label = (f) => f.label;
  const cols = [
    ...fieldColumns(fields, { skip: [] }),
    { key: '_low', label: '', render: (r) => (site.mod('inventory').lowStockAlerts && r.low_stock ? <Chip tone="warn"><AlertTriangle size={11} /> low</Chip> : null) },
  ];
  void label;
  return (
    <>
      <PageHeader title="Inventory" subtitle={`Stock of components for ${site.config.name}. Columns and forms come from this site's field configuration.`}
        actions={site.can('inventory', 'create') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New component</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 p-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Search SKU, name, category" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 17, height: 17 }} /> Low stock only</label>
        </div>
        {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : <DataTable columns={cols} rows={data} onRowClick={setOpen} empty={<Empty title="No components" hint="Add one, or import many from Excel in Reports." />} />}
      </div>
      {creating && <ItemForm fields={fields} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {open && <ItemDrawer id={open.id} fields={fields} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function ItemForm({ fields, item, onClose, onSaved }) {
  const site = useSite();
  const [v, setV] = useState(() => (item ? { ...item } : initialValues(fields)));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErrs({});
    try {
      if (item) await site.api.put(`/components/${item.id}`, buildPayload(fields, v, { partial: true }));
      else await site.api.post('/components', buildPayload(fields, v));
      toast.ok(item ? 'Component updated' : 'Component created'); onSaved();
    } catch (e) { setErrs(serverErrors(e)); toast.bad(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? `Edit ${item.sku}` : 'New component'} onClose={onClose} width={640}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <DynamicForm fields={fields} value={v} onChange={setV} errors={errs} columns={site.mod('dashboard_shell').formColumns} mode={item ? 'edit' : 'create'} />
    </Modal>
  );
}

function ItemDrawer({ id, fields, onClose, onChanged }) {
  const site = useSite();
  const { data: item, reload } = useAsync(() => site.api.get(`/components/${id}`), [id]);
  const { data: moves, reload: reloadMoves } = useAsync(() => site.api.get(`/components/${id}/movements`), [id]);
  const [editing, setEditing] = useState(false);
  const [delta, setDelta] = useState('');
  const refresh = () => { reload(); reloadMoves(); onChanged(); };
  const adjust = async (sign) => {
    const d = Number(delta) * sign;
    if (!d) return;
    try { await site.api.post(`/components/${id}/adjust`, { delta: d }); setDelta(''); toast.ok('Stock updated'); refresh(); } catch (e) { toast.bad(errMsg(e)); }
  };
  const del = async () => {
    if (!window.confirm('Delete this component? This cannot be undone.')) return;
    try { await site.api.del(`/components/${id}`); toast.ok('Deleted'); onChanged(); onClose(); } catch (e) { toast.bad(errMsg(e)); }
  };
  return (
    <Drawer title={item ? `${item.sku}` : 'Component'} onClose={onClose}>
      {!item ? <Spinner /> : (
        <div className="flex flex-col gap-5">
          <div className="card panel-pad">
            <div className="text-xl font-bold mb-3">{item.name}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {fields.filter((f) => !['sku', 'name'].includes(f.key) && !f.hidden).map((f) => (
                <div key={f.key}><dt className="label !mb-0.5">{f.label}</dt><dd className="font-medium">{f.type === 'currency' ? Number(item[f.key] ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : String(item[f.key] ?? '-')}</dd></div>
              ))}
            </dl>
            <div className="flex gap-2 mt-4">
              {site.can('inventory', 'update') && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>}
              {site.can('inventory', 'delete') && <button className="btn btn-sm btn-danger" onClick={del}><Trash2 size={13} /> Delete</button>}
            </div>
          </div>
          {site.can('inventory', 'adjust') && (
            <div className="card-flat panel-pad">
              <div className="label flex items-center gap-1"><SlidersHorizontal size={12} /> Adjust stock (current {num(item.qty)})</div>
              <div className="flex gap-2"><input className="input" type="number" min="0" placeholder="Quantity" value={delta} onChange={(e) => setDelta(e.target.value)} />
                <button className="btn btn-ok" onClick={() => adjust(1)}>Receive</button><button className="btn" onClick={() => adjust(-1)}>Remove</button></div>
            </div>
          )}
          <div>
            <div className="label">Stock movements</div>
            {moves?.length ? <DataTable dense rows={moves} columns={[
              { key: 'created_at', label: 'When', render: (m) => dtm(m.created_at) }, { key: 'reason', label: 'Reason', render: (m) => <StatusChip s={m.reason} /> },
              { key: 'delta', label: 'Change', num: true, render: (m) => <span style={{ color: m.delta < 0 ? '#DC2626' : '#16A34A' }}>{m.delta > 0 ? '+' : ''}{num(m.delta)}</span> }, { key: 'balance', label: 'Balance', num: true, render: (m) => num(m.balance) },
              { key: 'actor_name', label: 'By', render: (m) => m.actor_name || 'system' }]} /> : <div className="help">No movements yet.</div>}
          </div>
        </div>
      )}
      {editing && item && <ItemForm fields={fields} item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
    </Drawer>
  );
}
void human;
