import { migrate, initDb, closeDb } from '../src/db.js';
import { seedDemo } from '../scripts/seedLib.js';
import { createApp } from '../src/app.js';

export const PW = { admin: 'Admin@123', demo: 'Demo@1234' };
export const USERS = {
  admin: ['admin@opshub.dev', PW.admin], stores: ['stores@opshub.dev', PW.demo], storeadmin: ['storeadmin@opshub.dev', PW.demo],
  servicemgr: ['servicemgr@opshub.dev', PW.demo], tech: ['tech@opshub.dev', PW.demo], dispatch: ['dispatch@opshub.dev', PW.demo], field: ['field@opshub.dev', PW.demo],
};

export async function boot() {
  await migrate({ reset: true });
  await initDb();
  await seedDemo({ quiet: true });
  const server = await new Promise((r) => { const s = createApp().listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = {};
  const call = async (token, method, path, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && !isBuf ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body),
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: data, headers: res.headers };
  };
  for (const [k, [email, pw]] of Object.entries(USERS)) tokens[k] = (await call(null, 'POST', '/auth/login', { email, password: pw })).body.token;
  const as = (who) => ({
    get: (p, h) => call(tokens[who], 'GET', p, undefined, h),
    post: (p, b, h) => call(tokens[who], 'POST', p, b ?? {}, h),
    put: (p, b) => call(tokens[who], 'PUT', p, b ?? {}),
    del: (p) => call(tokens[who], 'DELETE', p),
    raw: (m, p, b, h) => call(tokens[who], m, p, b, h),
  });
  const anon = { get: (p) => call(null, 'GET', p), post: (p, b) => call(null, 'POST', p, b ?? {}), raw: (m, p, b) => call(null, m, p, b) };
  return { base, tokens, as, anon, close: async () => { await new Promise((r) => server.close(r)); await closeDb(); } };
}
