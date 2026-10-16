import axios from 'axios';
import { useAuth } from './store.js';

export const http = axios.create({ baseURL: '/api' });
http.interceptors.request.use((c) => {
  const t = useAuth.getState().token;
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
http.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401 && !e.config.url.includes('/auth/login') && useAuth.getState().token) useAuth.getState().logout();
  return Promise.reject(e);
});

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';
export const errDetails = (e) => e?.response?.data?.details;

/** API client bound to one site. In preview mode every call carries the preview header (server makes it read-only). */
export function siteApi(slug, preview = false) {
  const cfg = preview ? { headers: { 'x-opshub-preview': '1' } } : {};
  const base = `/${slug}`;
  return {
    slug,
    get: (p, params) => http.get(base + p, { ...cfg, params }).then((r) => r.data),
    post: (p, body) => http.post(base + p, body ?? {}, cfg).then((r) => r.data),
    put: (p, body) => http.put(base + p, body ?? {}, cfg).then((r) => r.data),
    del: (p) => http.delete(base + p, cfg).then((r) => r.data),
    blob: async (p) => {
      const r = await http.get(base + p, { ...cfg, responseType: 'blob' });
      const cd = r.headers['content-disposition'] || '';
      return { blob: r.data, filename: (cd.match(/filename="([^"]+)"/) || [])[1] || 'download.xlsx' };
    },
    upload: (p, buf, params) => http.post(base + p, buf, { ...cfg, params, headers: { ...(cfg.headers || {}), 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, transformRequest: [(d) => d] }).then((r) => r.data),
  };
}

export function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
