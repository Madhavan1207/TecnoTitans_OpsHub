// Safe formula engine used by BOTH server (authoritative) and client (live preview).
// Supports: numbers, field identifiers, + - * / %, unary -, parentheses, comparisons,
// && || !, and functions ROUND, MIN, MAX, ABS, IF, FLOOR, CEIL. No eval(), no property access.

const FUNCS = {
  ROUND: (x, n = 0) => { const f = 10 ** n; return Math.round((x + Number.EPSILON) * f) / f; },
  MIN: (...a) => Math.min(...a),
  MAX: (...a) => Math.max(...a),
  ABS: (x) => Math.abs(x),
  FLOOR: (x) => Math.floor(x),
  CEIL: (x) => Math.ceil(x),
  IF: (c, a, b) => (c ? a : b),
};
export const FORMULA_FUNCTIONS = Object.keys(FUNCS);

function tokenize(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error(`Bad number "${raw}"`);
      t.push({ k: 'num', v: parseFloat(raw) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      t.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/%()<>,!'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return t;
}

const BP = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parse(src) {
  if (typeof src !== 'string' || !src.trim()) throw new Error('Formula is empty');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];

  function primary() {
    const t = next();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'id') {
      if (peek() && peek().v === '(') {
        const name = t.v.toUpperCase();
        if (!FUNCS[name]) throw new Error(`Unknown function ${t.v}()`);
        next();
        const args = [];
        if (peek() && peek().v === ')') { next(); return { t: 'call', name, args }; }
        for (;;) {
          args.push(expr(0));
          const n = next();
          if (!n) throw new Error('Missing )');
          if (n.v === ')') break;
          if (n.v !== ',') throw new Error('Expected , or )');
        }
        return { t: 'call', name, args };
      }
      return { t: 'id', v: t.v.toLowerCase() };
    }
    if (t.v === '(') {
      const e = expr(0);
      const n = next();
      if (!n || n.v !== ')') throw new Error('Missing )');
      return e;
    }
    if (t.v === '-') return { t: 'neg', e: expr(7) };
    if (t.v === '!') return { t: 'not', e: expr(7) };
    throw new Error(`Unexpected "${t.v}"`);
  }

  function expr(min) {
    let left = primary();
    for (;;) {
      const o = peek();
      if (!o || o.k !== 'op' || !(o.v in BP) || BP[o.v] <= min) break;
      next();
      const right = expr(BP[o.v]);
      left = { t: 'bin', op: o.v, l: left, r: right };
    }
    return left;
  }

  const ast = expr(0);
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}"`);
  return ast;
}

export function identifiers(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.t === 'id') out.add(ast.v);
  else if (ast.t === 'bin') { identifiers(ast.l, out); identifiers(ast.r, out); }
  else if (ast.t === 'neg' || ast.t === 'not') identifiers(ast.e, out);
  else if (ast.t === 'call') ast.args.forEach((a) => identifiers(a, out));
  return out;
}

export function evaluate(ast, ctx) {
  switch (ast.t) {
    case 'num': return ast.v;
    case 'id': {
      const v = ctx[ast.v];
      const n = v === '' || v == null ? 0 : Number(v);
      if (Number.isNaN(n)) throw new Error(`${ast.v} is not a number`);
      return n;
    }
    case 'neg': return -evaluate(ast.e, ctx);
    case 'not': return evaluate(ast.e, ctx) ? 0 : 1;
    case 'call': return FUNCS[ast.name](...ast.args.map((a) => evaluate(a, ctx)));
    case 'bin': {
      const a = evaluate(ast.l, ctx);
      const b = evaluate(ast.r, ctx);
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new Error('Division by zero'); return a / b;
        case '%': if (b === 0) throw new Error('Division by zero'); return a % b;
        case '>': return +(a > b);
        case '<': return +(a < b);
        case '>=': return +(a >= b);
        case '<=': return +(a <= b);
        case '==': return +(a === b);
        case '!=': return +(a !== b);
        case '&&': return +(!!a && !!b);
        case '||': return +(!!a || !!b);
        default: break;
      }
      break;
    }
    default: break;
  }
  throw new Error('Bad expression');
}

/** Validate a formula against the list of field keys available. Returns {ok, error, refs}. */
export function checkFormula(src, availableKeys) {
  try {
    const ast = parse(src);
    const refs = [...identifiers(ast)];
    const missing = refs.filter((r) => !availableKeys.includes(r));
    if (missing.length) return { ok: false, error: `Unknown field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`, refs };
    return { ok: true, refs };
  } catch (e) {
    return { ok: false, error: e.message, refs: [] };
  }
}

/** Topologically order calculated fields; throws on circular references. */
export function orderCalculated(fields) {
  const calc = fields.filter((f) => f.formula);
  const deps = new Map(calc.map((f) => [f.key, [...identifiers(parse(f.formula))].filter((r) => calc.some((c) => c.key === r))]));
  const out = [];
  const state = {};
  const visit = (k, trail = []) => {
    if (state[k] === 2) return;
    if (state[k] === 1) throw new Error(`Circular formula: ${[...trail, k].join(' -> ')}`);
    state[k] = 1;
    (deps.get(k) || []).forEach((d) => visit(d, [...trail, k]));
    state[k] = 2;
    out.push(calc.find((f) => f.key === k));
  };
  calc.forEach((f) => visit(f.key));
  return out;
}

/** Compute all calculated fields for a record. Never throws: failed formulas become null. */
export function computeRecord(fields, record) {
  const out = { ...record };
  let ordered;
  try { ordered = orderCalculated(fields); } catch { return out; }
  for (const f of ordered) {
    try {
      const v = evaluate(parse(f.formula), out);
      out[f.key] = Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 1e6) / 1e6 : null;
    } catch {
      out[f.key] = null;
    }
  }
  return out;
}

/** Translate an AST to an Excel formula string. cell(key) returns an A1 reference. */
export function toExcelFormula(ast, cell) {
  switch (ast.t) {
    case 'num': return String(ast.v);
    case 'id': return cell(ast.v);
    case 'neg': return `-(${toExcelFormula(ast.e, cell)})`;
    case 'not': return `NOT(${toExcelFormula(ast.e, cell)})`;
    case 'call': return `${ast.name}(${ast.args.map((a) => toExcelFormula(a, cell)).join(',')})`;
    case 'bin': {
      const l = toExcelFormula(ast.l, cell);
      const r = toExcelFormula(ast.r, cell);
      if (ast.op === '&&') return `AND(${l},${r})`;
      if (ast.op === '||') return `OR(${l},${r})`;
      const op = ast.op === '==' ? '=' : ast.op === '!=' ? '<>' : ast.op;
      return `(${l}${op}${r})`;
    }
    default: return '0';
  }
}
