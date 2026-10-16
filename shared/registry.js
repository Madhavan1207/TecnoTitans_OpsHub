// OpsHub module registry - the single source of truth for the 13 approved modules.
// Each module is a TYPED NODE: it declares input ports (what it accepts), one typed output,
// the modules it depends on, the REST resource it mounts, the page it renders and its default
// fields / permissions / settings. The builder, validator, API gateway and renderer all read this.

export const ROLES = ['public', 'member', 'manager', 'admin'];
export const ROLE_RANK = { public: 0, member: 1, manager: 2, admin: 3 };
export const roleAtLeast = (role, min) => (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 99);

export const PORT_TYPES = {
  session: { label: 'Session', color: '#64748B' },
  layout: { label: 'Layout', color: '#64748B' },
  users: { label: 'Users', color: '#0EA5E9' },
  stock: { label: 'Stock', color: '#F5B700' },
  request: { label: 'Request', color: '#2563EB' },
  approved_request: { label: 'Approved request', color: '#16A34A' },
  assignment: { label: 'Assignment', color: '#8B5CF6' },
  consumption: { label: 'Consumption', color: '#EA580C' },
  return: { label: 'Return', color: '#DB2777' },
  repair: { label: 'Repair', color: '#0D9488' },
  ui: { label: 'UI', color: '#64748B' },
  chart: { label: 'Chart', color: '#CA8A04' },
  file: { label: 'File', color: '#475569' },
};

const DATA_TYPES = ['stock', 'request', 'approved_request', 'assignment', 'consumption', 'return', 'repair'];

/** Field helper. core:true => maps to a real DB column; others live in the JSONB `data` column. */
export const F = (key, label, type = 'text', o = {}) => ({ key, label, type, ...o });

const INVENTORY_FIELDS = [
  F('sku', 'SKU', 'text', { core: true, required: true, placeholder: 'e.g. RES-10K-0603' }),
  F('name', 'Component name', 'text', { core: true, required: true }),
  F('category', 'Category', 'text', { core: true, placeholder: 'e.g. Resistors' }),
  F('qty', 'Qty', 'number', { core: true, required: true, min: 0, default: 0 }),
  F('price', 'Price', 'currency', { core: true, min: 0, default: 0 }),
  F('reorder_level', 'Reorder level', 'number', { core: true, min: 0, default: 0 }),
  F('location', 'Shelf / bin', 'text'),
  F('total', 'Total', 'currency', { formula: 'qty * price', help: 'Calculated: Qty x Price' }),
];
const REQUEST_FIELDS = [
  F('title', 'Title', 'text', { core: true, required: true }),
  F('item_id', 'Component', 'ref', { core: true, ref: 'components' }),
  F('qty', 'Qty', 'number', { core: true, required: true, min: 1, default: 1 }),
  F('priority', 'Priority', 'select', { core: true, options: ['low', 'normal', 'high', 'urgent'], default: 'normal' }),
  F('notes', 'Notes', 'textarea', { core: true }),
];
const ASSIGNMENT_FIELDS = [
  F('qty', 'Qty to issue', 'number', { core: true, required: true, min: 0.01 }),
  F('assigned_to', 'Assigned to', 'text', { core: true, required: true, placeholder: 'Team, person or site' }),
];
const CONSUMPTION_FIELDS = [
  F('qty', 'Qty used', 'number', { core: true, required: true, min: 0.01 }),
  F('note', 'Where / how used', 'textarea', { core: true }),
];
const RETURN_FIELDS = [
  F('qty', 'Qty returned', 'number', { core: true, required: true, min: 0.01, default: 1 }),
  F('condition', 'Condition', 'select', { core: true, options: ['good', 'damaged', 'defective'], default: 'good' }),
  F('reason', 'Reason', 'textarea', { core: true }),
];
const REPAIR_FIELDS = [
  F('device', 'Device / board', 'text', { core: true, required: true }),
  F('fault', 'Reported fault', 'textarea', { core: true, required: true }),
  F('labour_cost', 'Labour cost', 'currency', { core: true, min: 0, default: 0 }),
  F('parts_cost', 'Parts cost', 'currency', { core: true, system: true, help: 'Filled automatically from parts used' }),
  F('total_cost', 'Total cost', 'currency', { formula: 'labour_cost + parts_cost' }),
];

const M = (m) => ({ inputs: [], output: null, requires: [], requiresAny: [], resource: null, page: null, fields: null, defaults: {}, actions: {}, settings: [], ...m });

export const MODULES = [
  M({
    key: 'auth_rbac', no: 1, label: 'Authentication & RBAC', group: 'Foundation', icon: 'ShieldCheck', color: '#64748B', core: true,
    desc: 'Global JWT login, bcrypt passwords and Public / Member / Manager / Admin roles. Always on.',
    output: { type: 'session', label: 'Session' },
    defaults: { sessionHours: 8 },
    settings: [{ key: 'sessionHours', label: 'Session length (hours)', type: 'number', min: 1, max: 72 }],
  }),
  M({
    key: 'user_management', no: 2, label: 'User Management', group: 'Foundation', icon: 'Users', color: '#0EA5E9',
    desc: 'See who can access this site and change their role.',
    output: { type: 'users', label: 'Users' }, resource: 'members',
    page: { path: 'team', title: 'Team', icon: 'Users' },
    actions: { list: 'manager', manage: 'admin' },
  }),
  M({
    key: 'inventory', no: 3, label: 'Inventory', group: 'Foundation', icon: 'Boxes', color: '#F5B700',
    desc: 'Stock of components with CRUD, stock adjustments, movements and low-stock alerts.',
    output: { type: 'stock', label: 'Stock' }, resource: 'components',
    page: { path: 'inventory', title: 'Inventory', icon: 'Boxes' },
    fields: INVENTORY_FIELDS,
    defaults: { lowStockAlerts: true },
    actions: { list: 'member', get: 'member', create: 'manager', update: 'manager', adjust: 'manager', delete: 'admin' },
    settings: [{ key: 'lowStockAlerts', label: 'Highlight low stock', type: 'toggle' }],
  }),
  M({
    key: 'dashboard_shell', no: 4, label: 'Dashboard Shell / Navigation / Forms', group: 'Foundation', icon: 'LayoutDashboard', color: '#64748B', core: true,
    desc: 'The layout, navigation and form style of the site. Always on.',
    output: { type: 'layout', label: 'Layout' },
    defaults: { formColumns: 1, showOverview: true, overviewTitle: 'Overview' },
    settings: [
      { key: 'formColumns', label: 'Form columns', type: 'select', options: [1, 2] },
      { key: 'showOverview', label: 'Show overview page', type: 'toggle' },
      { key: 'overviewTitle', label: 'Overview title', type: 'text' },
    ],
  }),
  M({
    key: 'request', no: 5, label: 'Request', group: 'Workflow', icon: 'FilePlus2', color: '#2563EB',
    desc: 'Anyone can raise a request. Fields are fully configurable (customer, device, material...).',
    inputs: [{ id: 'stock', label: 'Stock (optional)', accepts: ['stock'], required: false }],
    output: { type: 'request', label: 'Request' }, resource: 'requests',
    page: { path: 'requests', title: 'Requests', icon: 'FilePlus2' },
    fields: REQUEST_FIELDS,
    defaults: { numberPrefix: 'REQ', publicIntake: false, notifyCustomer: false, phoneField: 'customer_phone' },
    actions: { list: 'member', listAll: 'manager', get: 'member', create: 'member', update: 'member', cancel: 'member' },
    settings: [
      { key: 'numberPrefix', label: 'Number prefix', type: 'text' },
      { key: 'publicIntake', label: 'Allow public intake form (no login)', type: 'toggle', help: 'Shows a public form at /s/<site>/submit' },
      { key: 'notifyCustomer', label: 'Send SMS updates to the customer', type: 'toggle', help: 'Texts the customer at every step: received, approved, repair stages, handed back.' },
      { key: 'phoneField', label: 'Phone field key (for SMS)', type: 'text', help: 'The field that holds the customer mobile number. It should be a Phone field.' },
    ],
  }),
  M({
    key: 'approval', no: 6, label: 'Approval', group: 'Workflow', icon: 'Stamp', color: '#16A34A',
    desc: 'Approval chain with one or more levels. Needs a Request to approve.',
    inputs: [{ id: 'request', label: 'Request', accepts: ['request'], required: true }],
    output: { type: 'approved_request', label: 'Approved request' }, resource: 'approvals',
    requires: ['request'],
    page: { path: 'approvals', title: 'Approvals', icon: 'Stamp' },
    defaults: { levels: [{ role: 'manager', label: 'Manager review' }], allowSelfApproval: false, requireComment: false },
    actions: { list: 'manager', decide: 'manager' },
    settings: [
      { key: 'levels', label: 'Approval chain', type: 'levels' },
      { key: 'allowSelfApproval', label: 'Let people approve their own requests', type: 'toggle' },
      { key: 'requireComment', label: 'Require a comment when rejecting', type: 'toggle' },
    ],
  }),
  M({
    key: 'material_assignment', no: 7, label: 'Material Assignment', group: 'Workflow', icon: 'PackageCheck', color: '#8B5CF6',
    desc: 'Issues stock against a request. Stock decrement is one database transaction.',
    inputs: [
      { id: 'request', label: 'Request / approved request', accepts: ['request', 'approved_request'], required: true },
      { id: 'stock', label: 'Stock', accepts: ['stock'], required: true },
    ],
    output: { type: 'assignment', label: 'Assignment' }, resource: 'assignments',
    requires: ['request', 'inventory'],
    fields: ASSIGNMENT_FIELDS,
    defaults: { autoAssignOnApproval: false, allowPartialQty: true },
    actions: { list: 'member', listAll: 'manager', create: 'manager' },
    settings: [
      { key: 'autoAssignOnApproval', label: 'Issue stock automatically when fully approved', type: 'toggle' },
      { key: 'allowPartialQty', label: 'Allow issuing less than requested', type: 'toggle' },
    ],
  }),
  M({
    key: 'assignment_frontend', no: 8, label: 'Assignment Frontend', group: 'Workflow', icon: 'ClipboardList', color: '#8B5CF6',
    desc: 'The desk screen where approved requests are assigned and issued.',
    inputs: [{ id: 'assignment', label: 'Assignment', accepts: ['assignment'], required: true }],
    output: { type: 'ui', label: 'UI' },
    requires: ['material_assignment'],
    page: { path: 'assignments', title: 'Assignments', icon: 'ClipboardList' },
    settings: [],
  }),
  M({
    key: 'consumption_tracking', no: 9, label: 'Consumption Tracking', group: 'Tracking', icon: 'Activity', color: '#EA580C',
    desc: 'Track how issued material is used in the field, with remaining balance per assignment.',
    inputs: [{ id: 'assignment', label: 'Assignment', accepts: ['assignment'], required: true }],
    output: { type: 'consumption', label: 'Consumption' }, resource: 'consumption',
    requires: ['material_assignment'],
    page: { path: 'consumption', title: 'Consumption', icon: 'Activity' },
    fields: CONSUMPTION_FIELDS,
    actions: { list: 'member', listAll: 'manager', create: 'member' },
    settings: [],
  }),
  M({
    key: 'return_management', no: 10, label: 'Return Management', group: 'Tracking', icon: 'Undo2', color: '#DB2777',
    desc: 'Return unused material (back to stock) or hand a repaired unit back to its owner.',
    inputs: [
      { id: 'source', label: 'Assignment or Repair', accepts: ['assignment', 'repair'], required: true },
      { id: 'stock', label: 'Stock (optional)', accepts: ['stock'], required: false },
    ],
    output: { type: 'return', label: 'Return' }, resource: 'returns',
    requiresAny: ['material_assignment', 'pcb_repair'],
    page: { path: 'returns', title: 'Returns', icon: 'Undo2' },
    fields: RETURN_FIELDS,
    defaults: { restockGood: true },
    actions: { list: 'member', listAll: 'manager', create: 'member' },
    settings: [{ key: 'restockGood', label: 'Put returned material in good condition back into stock', type: 'toggle' }],
  }),
  M({
    key: 'pcb_repair', no: 11, label: 'PCB Repair', group: 'Tracking', icon: 'CircuitBoard', color: '#0D9488',
    desc: 'Repair jobs with status pipeline, repair log and parts used (parts decrement stock).',
    inputs: [
      { id: 'request', label: 'Request / approved request', accepts: ['request', 'approved_request'], required: true },
      { id: 'stock', label: 'Stock (optional)', accepts: ['stock'], required: false },
    ],
    output: { type: 'repair', label: 'Repair' }, resource: 'repairs',
    requires: ['request'],
    page: { path: 'repairs', title: 'Repairs', icon: 'CircuitBoard' },
    fields: REPAIR_FIELDS,
    defaults: { statuses: ['diagnosing', 'awaiting_parts', 'repairing', 'testing', 'completed'] },
    actions: { list: 'member', get: 'member', create: 'member', update: 'member', parts: 'member', delete: 'admin' },
    settings: [{ key: 'statuses', label: 'Repair pipeline (in order, last = done)', type: 'list' }],
  }),
  M({
    key: 'analytics', no: 12, label: 'Analytics Dashboard', group: 'Insight', icon: 'BarChart3', color: '#CA8A04',
    desc: 'Per-site charts (Recharts) built from whatever modules this site has.',
    inputs: [{ id: 'data', label: 'Data sources', accepts: DATA_TYPES, required: true, multiple: true }],
    output: { type: 'chart', label: 'Chart' }, resource: 'analytics',
    requiresAny: ['inventory', 'request', 'material_assignment', 'consumption_tracking', 'return_management', 'pcb_repair'],
    page: { path: 'analytics', title: 'Analytics', icon: 'BarChart3' },
    defaults: { widgets: ['kpis', 'stock_by_category', 'low_stock', 'requests_by_status', 'requests_trend', 'assignments_trend', 'consumption_by_item', 'repair_status'] },
    actions: { view: 'member' },
    settings: [{ key: 'widgets', label: 'Charts to show', type: 'multiselect', options: ['kpis', 'stock_by_category', 'low_stock', 'requests_by_status', 'requests_trend', 'assignments_trend', 'consumption_by_item', 'repair_status'] }],
  }),
  M({
    key: 'reports_excel', no: 13, label: 'Reports with Excel Integration', group: 'Insight', icon: 'FileSpreadsheet', color: '#475569',
    desc: 'Bulk Excel import and export with role restrictions.',
    inputs: [{ id: 'data', label: 'Data sources', accepts: DATA_TYPES, required: true, multiple: true }],
    output: { type: 'file', label: 'File' }, resource: 'reports',
    requiresAny: ['inventory', 'request', 'material_assignment', 'consumption_tracking', 'return_management', 'pcb_repair'],
    page: { path: 'reports', title: 'Reports', icon: 'FileSpreadsheet' },
    defaults: { permissions: { export: 'manager', import: 'admin' } },
    actions: { export: 'manager', import: 'admin' },
    settings: [
      { key: 'permissions.export', label: 'Minimum role to export', type: 'role', roles: ['member', 'manager', 'admin'] },
      { key: 'permissions.import', label: 'Minimum role to import', type: 'role', roles: ['member', 'manager', 'admin'] },
    ],
  }),
];

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]));
export const CORE_MODULES = MODULES.filter((m) => m.core).map((m) => m.key);
export const GROUPS = ['Foundation', 'Workflow', 'Tracking', 'Insight'];

/** REST resource -> module that owns it (used by the API gateway for gating). */
export const RESOURCE_MODULE = Object.fromEntries(MODULES.filter((m) => m.resource).map((m) => [m.resource, m.key]));

/** Which modules own a data entity that can be exported / charted. */
export const EXPORTABLE = {
  components: 'inventory',
  requests: 'request',
  assignments: 'material_assignment',
  consumption: 'consumption_tracking',
  returns: 'return_management',
  repairs: 'pcb_repair',
};
export const IMPORTABLE = { components: 'inventory' };

/** Fields-bearing module for each resource. */
export const RESOURCE_FIELDS_MODULE = { ...EXPORTABLE };

export const FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'date', 'select', 'boolean', 'phone'];

export function deepGet(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function deepSet(obj, path, value) {
  const keys = path.split('.');
  const out = { ...obj };
  let cur = out;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; }
  });
  return out;
}

export function findNode(config, key) {
  return (config?.modules || []).find((m) => m.type === key);
}
export function hasModule(config, key) {
  return !!findNode(config, key);
}

/** Module config merged over registry defaults. */
export function moduleConfig(config, key) {
  const node = findNode(config, key);
  const def = MODULE_MAP[key]?.defaults || {};
  return { ...structuredCloneSafe(def), ...(node?.config || {}), permissions: { ...(def.permissions || {}), ...(node?.config?.permissions || {}) } };
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

/** Effective fields for a module = registry core fields (immutable shape) + site-configured overrides/custom fields. */
export function resolveFields(config, key) {
  const base = MODULE_MAP[key]?.fields || [];
  const saved = findNode(config, key)?.config?.fields;
  if (!saved) return base.map((f) => ({ ...f }));
  const baseCore = Object.fromEntries(base.filter((f) => f.core).map((f) => [f.key, f]));
  const out = [];
  const seen = new Set();
  for (const f of saved) {
    if (!f || !f.key || seen.has(f.key)) continue;
    seen.add(f.key);
    if (baseCore[f.key]) {
      const b = baseCore[f.key];
      out.push({ ...b, label: f.label || b.label, hidden: !!f.hidden && !b.required, help: f.help ?? b.help, placeholder: f.placeholder ?? b.placeholder,
        options: b.type === 'select' ? (f.options?.length ? f.options : b.options) : b.options, default: f.default ?? b.default,
        required: b.required || !!f.required, min: f.min ?? b.min, max: f.max ?? b.max });
    } else out.push({ ...f, core: false });
  }
  for (const b of base) if (b.core && !seen.has(b.key)) out.push({ ...b });
  return out;
}

export function actionMinRole(config, moduleKey, action) {
  const cfg = moduleConfig(config, moduleKey);
  return cfg.permissions?.[action] || MODULE_MAP[moduleKey]?.actions?.[action] || 'admin';
}

export function roleLabel(config, role) {
  return config?.roles?.[role]?.label || ({ public: 'Public', member: 'Member', manager: 'Manager', admin: 'Admin' })[role] || role;
}

export const DEFAULT_THEME = {
  mode: 'light', layout: 'sidebar', primary: '#F5B700', accent: '#1D4FB5', bg: '#F4F1E8', surface: '#FFFFFF', ink: '#0D1621',
  radius: 6, shadow: 'hard', font: 'grotesk', density: 'comfortable', heading: 'display',
};
