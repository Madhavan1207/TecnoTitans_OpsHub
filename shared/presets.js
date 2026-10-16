// Builder presets (Inventory Starter, Approval Chain, Repair Shop) and the three demo-site templates.
import { DEFAULT_THEME, F, MODULE_MAP } from './registry.js';
import { addModule, emptyConfig, normalizeConfig } from './validate.js';

export const PRESETS = [
  { key: 'inventory_starter', label: 'Inventory Starter', desc: 'Stock list with analytics and Excel import / export.', modules: ['inventory', 'analytics', 'reports_excel'] },
  { key: 'approval_chain', label: 'Approval Chain', desc: 'Request, then approval, then assignment of stock, with an assignment desk.', modules: ['inventory', 'request', 'approval', 'material_assignment', 'assignment_frontend'] },
  { key: 'repair_shop', label: 'Repair Shop', desc: 'Repair requests, approval, PCB repair jobs, returns and analytics.', modules: ['inventory', 'request', 'approval', 'pcb_repair', 'return_management', 'analytics'] },
];

export function buildFromModules(base, keys, configs = {}) {
  let c = normalizeConfig(base);
  for (const key of keys) {
    const r = addModule(c, key);
    if (r.error) throw new Error(`Preset error: ${r.error}`);
    c = r.config;
    if (configs[key]) c.modules.find((m) => m.type === key).config = { ...configs[key] };
  }
  return normalizeConfig(c);
}

/** Replace the canvas modules with a preset, keeping name / slug / theme / roles. */
export function applyPreset(config, presetKey) {
  const p = PRESETS.find((x) => x.key === presetKey);
  if (!p) throw new Error('Unknown preset');
  const base = { ...config, modules: [], edges: [], pages: [] };
  return buildFromModules(base, p.modules);
}

/* ------------------------- demo site templates ------------------------- */

const centralStores = () => buildFromModules(
  emptyConfig({ name: 'Central Stores', slug: 'central-stores' }),
  ['user_management', 'inventory', 'analytics', 'reports_excel'],
  {
    inventory: {
      lowStockAlerts: true,
      fields: [
        F('sku', 'SKU', 'text', { core: true, required: true }),
        F('name', 'Component', 'text', { core: true, required: true }),
        F('category', 'Category', 'text', { core: true }),
        F('qty', 'On hand', 'number', { core: true, required: true, min: 0, default: 0 }),
        F('price', 'Unit price', 'currency', { core: true, min: 0, default: 0 }),
        F('reorder_level', 'Reorder at', 'number', { core: true, min: 0, default: 0 }),
        F('supplier', 'Supplier', 'text'),
        F('location', 'Rack / bin', 'text'),
        F('total', 'TOTAL', 'currency', { formula: 'qty * price', help: 'TOTAL = QTY x PRICE' }),
        F('shortfall', 'Shortfall', 'number', { formula: 'MAX(reorder_level - qty, 0)', help: 'How many units below the reorder level' }),
      ],
    },
    analytics: { widgets: ['kpis', 'stock_by_category', 'low_stock', 'consumption_by_item'] },
    reports_excel: { permissions: { export: 'manager', import: 'admin' } },
    dashboard_shell: { formColumns: 2, showOverview: true, overviewTitle: 'Stores overview' },
  },
);

const serviceCentre = () => buildFromModules(
  emptyConfig({ name: 'Service Centre', slug: 'service-centre' }),
  ['user_management', 'inventory', 'request', 'approval', 'pcb_repair', 'return_management', 'analytics', 'reports_excel'],
  {
    inventory: {
      lowStockAlerts: true,
      fields: [
        F('sku', 'Part no.', 'text', { core: true, required: true }),
        F('name', 'Spare part', 'text', { core: true, required: true }),
        F('category', 'Part type', 'text', { core: true }),
        F('qty', 'In stock', 'number', { core: true, required: true, min: 0, default: 0 }),
        F('price', 'Cost', 'currency', { core: true, min: 0, default: 0 }),
        F('reorder_level', 'Reorder level', 'number', { core: true, min: 0, default: 0 }),
        F('total', 'Stock value', 'currency', { formula: 'qty * price' }),
      ],
    },
    request: {
      numberPrefix: 'SC', publicIntake: true, notifyCustomer: true, phoneField: 'customer_phone',
      fields: [
        F('title', 'Problem summary', 'text', { core: true, required: true }),
        F('item_id', 'Component', 'ref', { core: true, ref: 'components', hidden: true }),
        F('qty', 'Qty', 'number', { core: true, required: true, min: 1, default: 1, hidden: true }),
        F('priority', 'Priority', 'select', { core: true, options: ['low', 'normal', 'high', 'urgent'], default: 'normal' }),
        F('notes', 'Notes', 'textarea', { core: true }),
        F('customer_name', 'Customer name', 'text', { required: true }),
        F('customer_phone', 'Mobile number', 'phone', { required: true, help: 'We text updates to this number' }),
        F('device_type', 'Device type', 'select', { options: ['Laptop', 'Phone', 'TV', 'Mainboard', 'Other'] }),
        F('warranty', 'In warranty?', 'boolean'),
        F('purchase_date', 'Purchase date', 'date'),
      ],
    },
    approval: { levels: [{ role: 'manager', label: 'Estimate approval' }], allowSelfApproval: false, requireComment: true },
    pcb_repair: {
      statuses: ['diagnosing', 'awaiting_parts', 'repairing', 'testing', 'completed'],
      fields: [
        F('device', 'Device / board', 'text', { core: true, required: true }),
        F('fault', 'Reported fault', 'textarea', { core: true, required: true }),
        F('labour_cost', 'Labour', 'currency', { core: true, min: 0, default: 0 }),
        F('parts_cost', 'Parts', 'currency', { core: true, system: true }),
        F('board_serial', 'Board serial', 'text'),
        F('estimated_days', 'Estimated days', 'number', { min: 0 }),
        F('total_cost', 'Subtotal', 'currency', { formula: 'labour_cost + parts_cost' }),
        F('gst', 'GST 18%', 'currency', { formula: 'ROUND(total_cost * 0.18, 2)' }),
        F('grand_total', 'Grand total', 'currency', { formula: 'total_cost + gst' }),
      ],
    },
    return_management: { restockGood: false },
    analytics: { widgets: ['kpis', 'requests_by_status', 'requests_trend', 'repair_status'] },
    dashboard_shell: { formColumns: 2, showOverview: true, overviewTitle: 'Service desk' },
  },
);

const distribution = () => buildFromModules(
  emptyConfig({ name: 'Distribution', slug: 'distribution' }),
  ['user_management', 'inventory', 'request', 'material_assignment', 'assignment_frontend', 'consumption_tracking', 'analytics', 'reports_excel'],
  {
    inventory: {
      lowStockAlerts: true,
      fields: [
        F('sku', 'Item code', 'text', { core: true, required: true }),
        F('name', 'Material', 'text', { core: true, required: true }),
        F('category', 'Group', 'text', { core: true }),
        F('qty', 'Available', 'number', { core: true, required: true, min: 0, default: 0 }),
        F('price', 'Rate', 'currency', { core: true, min: 0, default: 0 }),
        F('reorder_level', 'Min level', 'number', { core: true, min: 0, default: 0 }),
        F('uom', 'Unit', 'select', { options: ['pcs', 'm', 'kg', 'box'] }),
        F('total', 'Value', 'currency', { formula: 'qty * price' }),
      ],
    },
    request: {
      numberPrefix: 'DR', publicIntake: false,
      fields: [
        F('title', 'What is needed', 'text', { core: true, required: true }),
        F('item_id', 'Material', 'ref', { core: true, ref: 'components' }),
        F('qty', 'Qty', 'number', { core: true, required: true, min: 1, default: 1 }),
        F('priority', 'Priority', 'select', { core: true, options: ['low', 'normal', 'high', 'urgent'], default: 'normal' }),
        F('notes', 'Notes', 'textarea', { core: true }),
        F('field_site', 'Field site', 'text', { required: true }),
        F('needed_by', 'Needed by', 'date'),
      ],
    },
    material_assignment: {
      autoAssignOnApproval: false, allowPartialQty: true,
      fields: [
        F('qty', 'Qty to issue', 'number', { core: true, required: true, min: 0.01 }),
        F('assigned_to', 'Issued to', 'text', { core: true, required: true }),
        F('vehicle_no', 'Vehicle no.', 'text'),
      ],
    },
    analytics: { widgets: ['kpis', 'requests_by_status', 'assignments_trend', 'consumption_by_item', 'low_stock'] },
    dashboard_shell: { formColumns: 1, showOverview: true, overviewTitle: 'Field operations' },
  },
);

export const SITE_TEMPLATES = [
  {
    slug: 'central-stores', tagline: 'Inventory, stock control and analytics.',
    theme: { ...DEFAULT_THEME, mode: 'light', layout: 'sidebar', primary: '#FFDD0A', accent: '#1D4FB5', bg: '#F4F1E8', surface: '#FFFFFF', ink: '#0D1621', radius: 4, shadow: 'hard', font: 'grotesk', heading: 'display', density: 'comfortable' },
    roles: { member: { label: 'Store clerk' }, manager: { label: 'Store keeper' }, admin: { label: 'Stores head' } },
    build: centralStores,
  },
  {
    slug: 'service-centre', tagline: 'Requests, approvals, repairs and returns.',
    theme: { ...DEFAULT_THEME, mode: 'light', layout: 'topnav', primary: '#0E9F8E', accent: '#E4572E', bg: '#F2F7F6', surface: '#FFFFFF', ink: '#10302C', radius: 14, shadow: 'soft', font: 'serif', heading: 'normal', density: 'comfortable' },
    roles: { member: { label: 'Technician' }, manager: { label: 'Service manager' }, admin: { label: 'Centre admin' } },
    build: serviceCentre,
  },
  {
    slug: 'distribution', tagline: 'Issue material and track field consumption.',
    theme: { ...DEFAULT_THEME, mode: 'dark', layout: 'rail', primary: '#8B5CF6', accent: '#22D3EE', bg: '#12101F', surface: '#1C1930', ink: '#EDEBFA', radius: 10, shadow: 'flat', font: 'mono', heading: 'normal', density: 'compact' },
    roles: { member: { label: 'Field staff' }, manager: { label: 'Dispatcher' }, admin: { label: 'Distribution head' } },
    build: distribution,
  },
];

export function buildTemplate(slug) {
  const t = SITE_TEMPLATES.find((x) => x.slug === slug);
  if (!t) throw new Error('Unknown template');
  const c = t.build();
  c.slug = t.slug;
  c.name = { 'central-stores': 'Central Stores', 'service-centre': 'Service Centre', distribution: 'Distribution' }[slug];
  c.tagline = t.tagline;
  c.theme = { ...t.theme };
  c.roles = t.roles;
  return normalizeConfig(c);
}

export const moduleLabel = (k) => MODULE_MAP[k]?.label || k;
