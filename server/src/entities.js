// The generic "form -> table" engine. Given a site's field configuration it validates input,
// splits core columns from JSONB custom fields, evaluates calculated fields and serialises rows.
// There is NO per-site hand-coding: change the field config, publish, and the API behaves differently.
import { computeRecord } from '../../shared/formula.js';
import { resolveFields, EXPORTABLE } from '../../shared/registry.js';
import { phoneSchema, emailSchema } from '../../shared/validation.js';
import { HttpError } from './core.js';

export const ENTITIES = {
  components: { table: 'inventory_items', module: 'inventory' },
  requests: { table: 'requests', module: 'request' },
  assignments: { table: 'assignments', module: 'material_assignment' },
  consumption: { table: 'consumption_logs', module: 'consumption_tracking' },
  returns: { table: 'returns', module: 'return_management' },
  repairs: { table: 'repair_jobs', module: 'pcb_repair' },
};
export { EXPORTABLE };

export const fieldsFor = (config, entity) => resolveFields(config, ENTITIES[entity].module);

const isNum = (t) => t === 'number' || t === 'currency';
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function coerce(f, v) {
  if (v === null || v === '' || v === undefined) return { value: null };
  const type = (f.key.toLowerCase().includes('phone') && (f.type === 'text' || f.type === 'phone')) ? 'phone'
    : (f.key.toLowerCase().includes('email') && (f.type === 'text' || f.type === 'email')) ? 'email'
    : f.type;
  switch (type) {
    case 'number':
    case 'currency': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number` };
      if (f.min != null && n < Number(f.min)) return { error: `${f.label} must be at least ${f.min}` };
      if (f.max != null && n > Number(f.max)) return { error: `${f.label} must be at most ${f.max}` };
      return { value: n };
    }
    case 'boolean':
      if (typeof v === 'boolean') return { value: v };
      if (['true', '1', 'yes', 'y'].includes(String(v).toLowerCase())) return { value: true };
      if (['false', '0', 'no', 'n'].includes(String(v).toLowerCase())) return { value: false };
      return { error: `${f.label} must be yes or no` };
    case 'date': {
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return { error: `${f.label} must be a date (YYYY-MM-DD)` };
      return { value: s.slice(0, 10) };
    }
    case 'select': {
      const s = String(v);
      if (!(f.options || []).map(String).includes(s)) return { error: `${f.label} must be one of: ${(f.options || []).join(', ')}` };
      return { value: s };
    }
    case 'phone': {
      const raw = String(v).trim();
      const parsed = phoneSchema(f.label, !!f.required).safeParse(raw);
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      const digits = raw.replace(/\D/g, '');
      return { value: (raw.startsWith('+') ? '+' : '') + digits };
    }
    case 'email': {
      const s = String(v).trim();
      if (!s) return { value: null };
      const parsed = emailSchema(f.label, !!f.required).safeParse(s);
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      return { value: s.toLowerCase() };
    }
    case 'ref': {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) return { error: `${f.label} is not a valid selection` };
      return { value: n };
    }
    default: {
      const s = String(v).trim();
      if (s.length > 4000) return { error: `${f.label} is too long` };
      return { value: s };
    }
  }
}

/**
 * Validate `input` against the configured fields.
 *  partial=true  -> only the keys present are validated (PATCH/PUT semantics)
 *  allow         -> extra non-field keys the caller handles itself (e.g. request_id)
 * Returns { core, data, all } where `all` is the merged record used for calculated fields.
 */
export function validateInput(fields, input, { partial = false, allow = [] } = {}) {
  const errors = [];
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  for (const k of Object.keys(input || {})) {
    if (allow.includes(k)) continue;
    const f = byKey[k];
    if (!f) errors.push({ field: k, message: `Unknown field "${k}"` });
    else if (f.formula) errors.push({ field: k, message: `${f.label} is calculated (${f.formula}) and cannot be set` });
    else if (f.system) errors.push({ field: k, message: `${f.label} is managed by the system` });
  }
  const core = {};
  const data = {};
  for (const f of fields) {
    if (f.formula || f.system) continue;
    const present = input && Object.prototype.hasOwnProperty.call(input, f.key);
    if (!present && partial) continue;
    let raw = present ? input[f.key] : undefined;
    if ((raw === undefined || raw === '' || raw === null) && f.default !== undefined && !partial) raw = f.default;
    const { value, error } = coerce(f, raw);
    if (error) { errors.push({ field: f.key, message: error }); continue; }
    if ((value === null || value === undefined) && f.required) { errors.push({ field: f.key, message: `${f.label} is required` }); continue; }
    (f.core ? core : data)[f.key] = value;
  }
  if (errors.length) throw new HttpError(422, errors[0].message, 'validation_failed', { errors });
  return { core, data };
}

/** Compute calculated fields for a record: stored in data JSONB so SQL / reports can use them. */
export function withCalculated(fields, row) {
  const flat = flatten(row);
  const calc = computeRecord(fields, flat);
  const out = {};
  for (const f of fields) if (f.formula) out[f.key] = calc[f.key];
  return out;
}

export function flatten(row) {
  const { data, site_id: _s, ...cols } = row;
  return { ...(data || {}), ...cols };
}

/** API shape of one row: columns + custom fields + freshly computed calculated fields. */
export function serialize(fields, row) {
  const flat = flatten(row);
  return computeRecord(fields, flat);
}

export function assertKnownEntity(entity) {
  if (!ENTITIES[entity]) throw new HttpError(404, `Unknown resource "${entity}".`);
}
export { isNum };
