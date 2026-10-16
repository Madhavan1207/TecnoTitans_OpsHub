// Config-driven form + table columns. NOTHING here knows about a specific site: it renders whatever
// field list the site config provides (core fields, custom fields, calculated fields).
import { computeRecord } from '@shared/formula.js';
import { Calculator, Lock } from '../lib/icons.jsx';
import { dt, human, money, num } from '../lib/format.js';
import { StatusChip } from './ui.jsx';

export function initialValues(fields, base = {}) {
  const v = {};
  for (const f of fields) if (!f.formula && !f.system && f.default !== undefined) v[f.key] = f.default;
  return { ...v, ...base };
}

/** Raw form state -> API payload (numbers coerced, empty omitted, calculated/system skipped). */
export function buildPayload(fields, value, { partial = false } = {}) {
  const out = {};
  for (const f of fields) {
    if (f.formula || f.system) continue;
    const v = value[f.key];
    if (v === undefined || v === '' || v === null) { if (partial && v === '') out[f.key] = null; continue; }
    if (f.type === 'number' || f.type === 'currency' || f.type === 'ref') out[f.key] = Number(v);
    else if (f.type === 'boolean') out[f.key] = !!v;
    else out[f.key] = v;
  }
  return out;
}

function Input({ f, value, onChange, error, options }) {
  const common = { id: `f_${f.key}`, className: `input ${error ? 'input-err' : ''}` };
  if (f.type === 'textarea') return <textarea {...common} className={`textarea ${error ? 'input-err' : ''}`} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
  if (f.type === 'select') return (
    <select {...common} className={`select ${error ? 'input-err' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{f.required ? 'Select...' : '-'}</option>{(f.options || []).map((o) => <option key={o} value={o}>{human(o)}</option>)}
    </select>
  );
  if (f.type === 'ref') return (
    <select {...common} className={`select ${error ? 'input-err' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{f.required ? 'Select...' : 'None'}</option>{(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  if (f.type === 'boolean') return (
    <label className="flex items-center gap-2 text-sm font-medium py-2"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 18, height: 18 }} /> Yes</label>
  );
  if (f.type === 'number' || f.type === 'currency') return <input {...common} type="number" inputMode="decimal" step="any" min={f.min} max={f.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
  if (f.type === 'phone') return <input {...common} type="tel" inputMode="tel" autoComplete="tel" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder || 'e.g. 98200 12345'} />;
  if (f.type === 'date') return <input {...common} type="date" value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />;
  return <input {...common} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
}

export function DynamicForm({ fields, value, onChange, errors = {}, columns = 1, refOptions = {}, mode = 'create', lockKeys = [] }) {
  const live = computeRecord(fields, Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === '' ? 0 : v])));
  const visible = fields.filter((f) => !f.hidden && !(f.system && mode === 'create'));
  return (
    <div className={`grid gap-4 ${columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
      {visible.map((f) => {
        const wide = f.type === 'textarea';
        const calc = !!f.formula;
        const locked = calc || f.system || lockKeys.includes(f.key);
        return (
          <div key={f.key} className={wide ? 'sm:col-span-full' : ''}>
            <label className="label flex items-center gap-1.5" htmlFor={`f_${f.key}`}>
              {f.label}{f.required && <span className="text-bad">*</span>}
              {calc && <span className="chip chip-info !normal-case !tracking-normal"><Calculator size={11} /> {f.formula}</span>}
              {f.system && <Lock size={11} />}
            </label>
            {calc || f.system ? (
              <input className="input" readOnly value={f.type === 'currency' ? money(live[f.key] ?? value[f.key]) : num(live[f.key] ?? value[f.key])} />
            ) : locked ? (
              <input className="input" readOnly value={value[f.key] ?? ''} />
            ) : (
              <Input f={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} error={errors[f.key]} options={refOptions[f.ref]} />
            )}
            {errors[f.key] ? <div className="err-text">{errors[f.key]}</div> : f.help && !calc ? <div className="help">{f.help}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Table columns generated from field config. */
export function fieldColumns(fields, { skip = [], refLabel } = {}) {
  return fields.filter((f) => !f.hidden && !skip.includes(f.key) && f.type !== 'textarea').map((f) => ({
    key: f.key, label: f.label, num: f.type === 'number' || f.type === 'currency',
    render: (r) => {
      const v = r[f.key];
      if (v == null || v === '') return <span className="text-muted">-</span>;
      if (f.type === 'currency') return money(v);
      if (f.type === 'number') return num(v);
      if (f.type === 'boolean') return v ? 'Yes' : 'No';
      if (f.type === 'date') return dt(v);
      if (f.type === 'select' && ['priority', 'condition'].includes(f.key)) return <StatusChip s={v} />;
      if (f.type === 'ref') return refLabel ? refLabel(r, f) : v;
      return String(v);
    },
  }));
}

export function serverErrors(e) {
  const list = e?.response?.data?.details?.errors;
  if (!Array.isArray(list)) return {};
  return Object.fromEntries(list.filter((x) => x.field).map((x) => [x.field, x.message]));
}
