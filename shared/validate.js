// Site-config normalisation, typed-graph rules and schema validation.
// Used by the builder (live feedback) AND by the API (authoritative check on save / publish).
import { MODULES, MODULE_MAP, CORE_MODULES, PORT_TYPES, FIELD_TYPES, DEFAULT_THEME, ROLES, resolveFields, moduleConfig, findNode } from './registry.js';
import { checkFormula, orderCalculated } from './formula.js';

const DEFAULT_POS = {
  auth_rbac: { x: 0, y: 0 }, dashboard_shell: { x: 0, y: 130 }, user_management: { x: 0, y: 260 },
  inventory: { x: 290, y: 0 }, request: { x: 290, y: 170 }, approval: { x: 580, y: 170 },
  material_assignment: { x: 870, y: 60 }, assignment_frontend: { x: 1160, y: 60 }, consumption_tracking: { x: 1160, y: 200 },
  pcb_repair: { x: 870, y: 290 }, return_management: { x: 1160, y: 340 }, analytics: { x: 580, y: 340 }, reports_excel: { x: 580, y: 470 },
};

export const edgeId = (e) => `${e.source}->${e.target}:${e.targetHandle}`;
export const THEME_LAYOUTS = ['sidebar', 'topnav', 'rail'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const RESERVED_KEYS = ['id', 'site_id', 'status', 'created_at', 'updated_at', 'data', 'created_by', 'requester_id', 'req_no', 'asg_no', 'job_no', 'ret_no',
  'request_id', 'assignment_id', 'repair_id', 'assignee_id', 'technician_id', 'completed_at', 'returned_at', 'qty_consumed', 'qty_returned', 'restocked',
  'source_type', 'item_id', 'used_by', 'used_at'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const isValidSlug = (s) => SLUG_RE.test(s || '') && !['api', 'hub', 'auth', 'admin', 'builder', 'login', 'public', 'sites', 'registry', 'preview', 's'].includes(s);

const clone = (o) => JSON.parse(JSON.stringify(o));

export function emptyConfig({ name = 'New site', slug = 'new-site' } = {}) {
  return normalizeConfig({ name, slug, tagline: '', theme: { ...DEFAULT_THEME }, modules: [], edges: [], pages: [], roles: {} });
}

/** Make any config structurally complete: core nodes, positions, pages, theme defaults. */
export function normalizeConfig(input) {
  const c = clone(input || {});
  c.name = c.name || 'Untitled site';
  c.slug = c.slug || 'untitled';
  c.tagline = c.tagline || '';
  c.theme = { ...DEFAULT_THEME, ...(c.theme || {}) };
  c.roles = c.roles || {};
  c.modules = Array.isArray(c.modules) ? c.modules.filter((m) => m && MODULE_MAP[m.type]) : [];
  const seen = new Set();
  c.modules = c.modules.filter((m) => (seen.has(m.type) ? false : seen.add(m.type)));
  for (const key of CORE_MODULES) {
    if (!seen.has(key)) c.modules.push({ id: key, type: key, position: DEFAULT_POS[key], config: {} });
  }
  c.modules.forEach((m) => {
    m.id = m.type;
    m.config = m.config || {};
    m.position = m.position && Number.isFinite(m.position.x) ? m.position : DEFAULT_POS[m.type] || { x: 0, y: 0 };
  });
  const have = new Set(c.modules.map((m) => m.type));
  c.edges = (Array.isArray(c.edges) ? c.edges : [])
    .filter((e) => e && have.has(e.source) && have.has(e.target))
    .map((e) => ({ id: edgeId(e), source: e.source, target: e.target, targetHandle: e.targetHandle }));
  c.pages = derivePages(c);
  return c;
}

/** Pages follow modules: one page per module that has a UI, keeping the owner's title/icon/order/visibility. */
export function derivePages(config) {
  const present = MODULES.filter((m) => m.page && findNode(config, m.key));
  const existing = (config.pages || []).filter((p) => present.some((m) => m.key === p.module));
  const out = existing.map((p) => ({ ...p, path: MODULE_MAP[p.module].page.path }));
  for (const m of present) {
    if (!out.some((p) => p.module === m.key)) out.push({ path: m.page.path, title: m.page.title, module: m.key, icon: m.page.icon, hidden: false });
  }
  return out;
}

/* ---------- typed connections ---------- */

export function inputPort(moduleKey, handle) {
  return MODULE_MAP[moduleKey]?.inputs.find((i) => i.id === handle);
}

/** Can `source` connect into `target`.`handle`? Returns {ok, reason}. */
export function isValidConnection(config, { source, target, targetHandle }) {
  if (source === target) return { ok: false, reason: 'A module cannot connect to itself.' };
  const s = MODULE_MAP[source];
  const t = MODULE_MAP[target];
  if (!s || !t) return { ok: false, reason: 'Unknown module.' };
  if (!findNode(config, source) || !findNode(config, target)) return { ok: false, reason: 'Both modules must be on the canvas.' };
  const port = inputPort(target, targetHandle);
  if (!port) return { ok: false, reason: `${t.label} has no input called "${targetHandle}".` };
  if (!s.output) return { ok: false, reason: `${s.label} has no output.` };
  if (!port.accepts.includes(s.output.type)) {
    return { ok: false, reason: `${t.label} accepts ${port.accepts.map((a) => PORT_TYPES[a].label).join(' / ')} here, but ${s.label} outputs ${PORT_TYPES[s.output.type].label}.` };
  }
  if ((config.edges || []).some((e) => e.source === source && e.target === target && e.targetHandle === targetHandle)) {
    return { ok: false, reason: 'Already connected.' };
  }
  if (wouldCycle(config, source, target)) return { ok: false, reason: 'That would create a loop.' };
  return { ok: true };
}

function wouldCycle(config, source, target) {
  const adj = {};
  for (const e of config.edges || []) (adj[e.source] ||= []).push(e.target);
  const stack = [target];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (n === source) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    (adj[n] || []).forEach((x) => stack.push(x));
  }
  return false;
}

/** Add a connection; if the input accepts a single edge, the old one is replaced. */
export function connect(config, conn) {
  const chk = isValidConnection(config, conn);
  if (!chk.ok) return { config, error: chk.reason };
  const port = inputPort(conn.target, conn.targetHandle);
  const c = clone(config);
  if (!port.multiple) c.edges = c.edges.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle));
  c.edges.push({ id: edgeId(conn), ...conn });
  return { config: c };
}

/* ---------- add / remove with dependency rules ---------- */

export function canAddModule(config, key) {
  const m = MODULE_MAP[key];
  if (!m) return { ok: false, reason: 'Unknown module.' };
  if (findNode(config, key)) return { ok: false, reason: `${m.label} is already on the canvas.` };
  const missing = m.requires.filter((r) => !findNode(config, r));
  if (missing.length) return { ok: false, reason: `${m.label} needs ${missing.map((r) => MODULE_MAP[r].label).join(' and ')} on the canvas first.` };
  if (m.requiresAny.length && !m.requiresAny.some((r) => findNode(config, r))) {
    return { ok: false, reason: `${m.label} needs at least one of: ${m.requiresAny.map((r) => MODULE_MAP[r].label).join(', ')}.` };
  }
  return { ok: true };
}

/** Add a module and auto-wire its inputs to the best matching modules already present. */
export function addModule(config, key, position) {
  const chk = canAddModule(config, key);
  if (!chk.ok) return { config, error: chk.reason };
  let c = clone(config);
  const m = MODULE_MAP[key];
  c.modules.push({ id: key, type: key, position: position || DEFAULT_POS[key] || { x: 0, y: 0 }, config: {} });
  for (const port of m.inputs) {
    const sources = MODULES.filter((s) => s.key !== key && findNode(c, s.key) && s.output && port.accepts.includes(s.output.type));
    let pick = sources;
    if (!port.multiple) {
      // prefer approved_request over request when both exist
      const pref = port.accepts.slice().reverse();
      pick = [sources.sort((a, b) => pref.indexOf(a.output.type) - pref.indexOf(b.output.type))[0]].filter(Boolean);
    } else if (sources.some((s) => s.output.type === 'approved_request')) {
      pick = sources.filter((s) => s.output.type !== 'request');
    }
    for (const s of pick) c.edges.push({ id: edgeId({ source: s.key, target: key, targetHandle: port.id }), source: s.key, target: key, targetHandle: port.id });
  }
  // Adding Approval re-routes consumers of raw requests so they only see approved ones.
  if (key === 'approval') {
    c.edges = c.edges.map((e) => (e.source === 'request' && e.target !== 'approval' && e.targetHandle === 'request'
      ? { ...e, source: 'approval', id: edgeId({ ...e, source: 'approval' }) } : e));
  }
  c.pages = derivePages(c);
  return { config: c };
}

export function canRemoveModule(config, key) {
  const m = MODULE_MAP[key];
  if (!m) return { ok: false, reason: 'Unknown module.' };
  if (m.core) return { ok: false, reason: `${m.label} is part of every site and cannot be removed.` };
  const rest = (config.modules || []).filter((n) => n.type !== key);
  const dependents = rest.filter((n) => {
    const d = MODULE_MAP[n.type];
    if (d.requires.includes(key)) return true;
    if (d.requiresAny.includes(key) && !d.requiresAny.some((r) => r !== key && rest.some((x) => x.type === r))) return true;
    return false;
  });
  if (dependents.length) return { ok: false, reason: `Remove ${dependents.map((d) => MODULE_MAP[d.type].label).join(', ')} first - it depends on ${m.label}.` };
  return { ok: true };
}

export function removeModule(config, key) {
  const chk = canRemoveModule(config, key);
  if (!chk.ok) return { config, error: chk.reason };
  const c = clone(config);
  c.modules = c.modules.filter((n) => n.type !== key);
  if (key === 'approval') {
    c.edges = c.edges.map((e) => (e.source === 'approval' && findNode(c, 'request') ? { ...e, source: 'request', id: edgeId({ ...e, source: 'request' }) } : e));
  }
  c.edges = c.edges.filter((e) => e.source !== key && e.target !== key);
  c.pages = derivePages(c);
  return { config: c };
}

/* ---------- validation ---------- */

const err = (code, message, extra = {}) => ({ severity: 'error', code, message, ...extra });
const warn = (code, message, extra = {}) => ({ severity: 'warning', code, message, ...extra });

export function validateFields(fields, moduleKey) {
  const issues = [];
  const base = MODULE_MAP[moduleKey]?.fields || [];
  const keys = new Set();
  for (const f of fields) {
    const at = { module: moduleKey, field: f.key };
    if (!KEY_RE.test(f.key || '')) issues.push(err('field.key', `Field key "${f.key}" must be lowercase letters, numbers or _ and start with a letter.`, at));
    if (keys.has(f.key)) issues.push(err('field.duplicate', `Duplicate field key "${f.key}".`, at));
    keys.add(f.key);
    if (!f.label?.trim()) issues.push(err('field.label', `Field "${f.key}" needs a label.`, at));
    const t = f.type === 'ref' ? 'ref' : f.type;
    if (!FIELD_TYPES.includes(t) && t !== 'ref') issues.push(err('field.type', `Field "${f.key}" has unknown type "${f.type}".`, at));
    if (f.type === 'select' && !(f.options || []).filter(Boolean).length) issues.push(err('field.options', `Dropdown "${f.label || f.key}" needs at least one option.`, at));
    if (f.min != null && f.max != null && Number(f.min) > Number(f.max)) issues.push(err('field.range', `"${f.label || f.key}": min is larger than max.`, at));
    if (f.formula && f.core) issues.push(err('field.core_formula', `"${f.label}" is a built-in field and cannot be calculated.`, at));
    const clash = base.find((b) => b.core && b.key === f.key && !f.core);
    if (clash || (!f.core && RESERVED_KEYS.includes(f.key))) issues.push(err('field.reserved', `"${f.key}" is a reserved name. Pick another key.`, at));
  }
  for (const f of fields.filter((x) => x.formula)) {
    const res = checkFormula(f.formula, fields.map((x) => x.key));
    if (!res.ok) issues.push(err('formula.invalid', `Formula for "${f.label || f.key}": ${res.error}`, { module: moduleKey, field: f.key }));
    else if (res.refs.includes(f.key)) issues.push(err('formula.self', `Formula for "${f.label || f.key}" refers to itself.`, { module: moduleKey, field: f.key }));
    else {
      const nonNumeric = res.refs.map((r) => fields.find((x) => x.key === r)).filter((x) => x && !['number', 'currency'].includes(x.type) && !x.formula);
      if (nonNumeric.length) issues.push(err('formula.type', `Formula for "${f.label || f.key}" uses non-numeric field "${nonNumeric[0].label || nonNumeric[0].key}".`, { module: moduleKey, field: f.key }));
    }
  }
  if (!issues.some((i) => i.code.startsWith('formula'))) {
    try { orderCalculated(fields); } catch (e) { issues.push(err('formula.cycle', e.message, { module: moduleKey })); }
  }
  return issues;
}

export function validateConfig(input) {
  const config = input || {};
  const issues = [];
  if (!config.name?.trim()) issues.push(err('site.name', 'Site needs a name.'));
  if (!isValidSlug(config.slug)) issues.push(err('site.slug', 'Slug must be 3-40 lowercase letters, numbers or dashes.'));

  const present = new Set((config.modules || []).map((m) => m.type));
  for (const m of config.modules || []) if (!MODULE_MAP[m.type]) issues.push(err('module.unknown', `Unknown module "${m.type}".`));
  for (const key of CORE_MODULES) if (!present.has(key)) issues.push(err('module.core', `${MODULE_MAP[key].label} is required.`, { module: key }));

  for (const m of MODULES) {
    if (!present.has(m.key)) continue;
    for (const r of m.requires) if (!present.has(r)) issues.push(err('module.requires', `${m.label} cannot be used without ${MODULE_MAP[r].label}.`, { module: m.key }));
    if (m.requiresAny.length && !m.requiresAny.some((r) => present.has(r))) {
      issues.push(err('module.requires_any', `${m.label} needs one of: ${m.requiresAny.map((r) => MODULE_MAP[r].label).join(', ')}.`, { module: m.key }));
    }
  }

  // edges: typed
  const edgeKeys = new Set();
  for (const e of config.edges || []) {
    const res = (() => {
      if (!present.has(e.source) || !present.has(e.target)) return { ok: false, reason: `Connection ${e.source} -> ${e.target} points at a missing module.` };
      const s = MODULE_MAP[e.source];
      const t = MODULE_MAP[e.target];
      const port = inputPort(e.target, e.targetHandle);
      if (!port) return { ok: false, reason: `${t.label} has no input "${e.targetHandle}".` };
      if (!s.output || !port.accepts.includes(s.output.type)) return { ok: false, reason: `Type mismatch: ${s.label} (${PORT_TYPES[s.output?.type]?.label}) cannot feed ${t.label} (${port.label}).` };
      return { ok: true };
    })();
    if (!res.ok) issues.push(err('edge.type', res.reason, { edge: edgeId(e) }));
    const k = edgeId(e);
    if (edgeKeys.has(k)) issues.push(err('edge.duplicate', `Duplicate connection ${k}.`));
    edgeKeys.add(k);
  }
  for (const m of MODULES) {
    if (!present.has(m.key)) continue;
    for (const port of m.inputs) {
      const incoming = (config.edges || []).filter((e) => e.target === m.key && e.targetHandle === port.id);
      if (port.required && !incoming.length) issues.push(err('edge.missing', `${m.label}: connect something to "${port.label}".`, { module: m.key, handle: port.id }));
      if (!port.multiple && incoming.length > 1) issues.push(err('edge.multiple', `${m.label}: "${port.label}" accepts only one connection.`, { module: m.key, handle: port.id }));
    }
  }
  const cyc = (() => {
    const adj = {};
    for (const e of config.edges || []) (adj[e.source] ||= []).push(e.target);
    const st = {};
    const visit = (n) => { if (st[n] === 1) return true; if (st[n] === 2) return false; st[n] = 1; const r = (adj[n] || []).some(visit); st[n] = 2; return r; };
    return Object.keys(adj).some(visit);
  })();
  if (cyc) issues.push(err('edge.cycle', 'The module graph contains a loop.'));

  // fields + module settings
  for (const m of config.modules || []) {
    const def = MODULE_MAP[m.type];
    if (!def) continue;
    if (def.fields) {
      const raw = m.config?.fields || [];
      const dup = raw.find((f, i) => raw.findIndex((x) => x.key === f.key) !== i);
      if (dup) issues.push(err('field.duplicate', `Duplicate field key "${dup.key}" in ${def.label}.`, { module: m.type, field: dup.key }));
      issues.push(...validateFields(resolveFields(config, m.type), m.type));
    }
    const cfg = moduleConfig(config, m.type);
    if (m.type === 'approval') {
      const levels = cfg.levels || [];
      if (!levels.length) issues.push(err('approval.levels', 'Approval needs at least one level.', { module: 'approval' }));
      if (levels.length > 4) issues.push(err('approval.levels', 'Approval supports up to 4 levels.', { module: 'approval' }));
      levels.forEach((l, i) => {
        if (!['manager', 'admin'].includes(l.role)) issues.push(err('approval.role', `Level ${i + 1} must be approved by Manager or Admin.`, { module: 'approval' }));
      });
    }
    if (m.type === 'request' && cfg.notifyCustomer) {
      const pf = resolveFields(config, 'request').find((f) => f.key === cfg.phoneField);
      if (!pf) issues.push(err('notify.phone_field', `SMS updates are on, but there is no field with the key "${cfg.phoneField}". Add a Phone field with that key.`, { module: 'request' }));
      else if (!['phone', 'text'].includes(pf.type)) issues.push(err('notify.phone_type', `"${pf.label}" must be a Phone (or text) field to receive SMS.`, { module: 'request' }));
      else if (pf.type === 'text') issues.push(warn('notify.phone_text', `"${pf.label}" is a plain text field. Use the Phone type so numbers are validated before sending SMS.`, { module: 'request' }));
    }
    if (m.type === 'pcb_repair') {
      const st = cfg.statuses || [];
      if (st.length < 2) issues.push(err('repair.statuses', 'Repair pipeline needs at least 2 statuses.', { module: 'pcb_repair' }));
      if (new Set(st).size !== st.length) issues.push(err('repair.statuses', 'Repair statuses must be unique.', { module: 'pcb_repair' }));
      if (st.some((s) => !/^[a-z][a-z0-9_]*$/.test(s))) issues.push(err('repair.statuses', 'Repair statuses use lowercase letters, numbers and _ only.', { module: 'pcb_repair' }));
    }
    for (const [act, role] of Object.entries(cfg.permissions || {})) {
      if (!ROLES.includes(role)) issues.push(err('perm.role', `${def.label}: unknown role "${role}" for ${act}.`, { module: m.type }));
    }
  }
  if (present.has('material_assignment') && present.has('approval')) {
    const e = (config.edges || []).find((x) => x.target === 'material_assignment' && x.targetHandle === 'request');
    if (e && e.source === 'request') issues.push(warn('flow.bypass', 'Material Assignment is connected straight to Request, so approvals will be skipped for assignments. Connect it to Approval instead.', { module: 'material_assignment' }));
  }

  // theme
  const th = config.theme || {};
  for (const k of ['primary', 'accent', 'bg', 'surface', 'ink']) if (th[k] && !HEX.test(th[k])) issues.push(err('theme.color', `Theme colour "${k}" must be a hex value like #F5B700.`));
  if (!THEME_LAYOUTS.includes(th.layout)) issues.push(err('theme.layout', `Layout must be one of: ${THEME_LAYOUTS.join(', ')}.`));

  // pages
  const paths = new Set();
  for (const p of config.pages || []) {
    if (!present.has(p.module)) issues.push(err('page.module', `Page "${p.title}" points at a module that is not on the canvas.`));
    if (paths.has(p.path)) issues.push(err('page.duplicate', `Two pages share the path "${p.path}".`));
    paths.add(p.path);
  }
  if (!(config.pages || []).some((p) => !p.hidden) && !moduleConfig(config, 'dashboard_shell').showOverview) {
    issues.push(warn('pages.empty', 'The site has no visible pages.'));
  }
  if (!['inventory', 'request', 'pcb_repair', 'user_management'].some((k) => present.has(k))) {
    issues.push(warn('site.empty', 'This site has no working modules yet - add Inventory or Request to get started.'));
  }
  return { errors: issues.filter((i) => i.severity === 'error'), warnings: issues.filter((i) => i.severity === 'warning'), ok: !issues.some((i) => i.severity === 'error') };
}

/** Human summary of what differs between two configs (used in release history). */
export function diffConfigs(a, b) {
  const A = new Set((a?.modules || []).map((m) => m.type));
  const B = new Set((b?.modules || []).map((m) => m.type));
  const added = [...B].filter((x) => !A.has(x));
  const removed = [...A].filter((x) => !B.has(x));
  const changed = [];
  for (const k of [...B].filter((x) => A.has(x))) {
    if (JSON.stringify(findNode(a, k)?.config || {}) !== JSON.stringify(findNode(b, k)?.config || {})) changed.push(k);
  }
  const themeChanged = JSON.stringify(a?.theme || {}) !== JSON.stringify(b?.theme || {});
  return { added, removed, changed, themeChanged };
}
