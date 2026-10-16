import { useEffect, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useParams, Link } from 'react-router-dom';
import { siteApi, http, errMsg } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { themeVars } from '../lib/theme.js';
import { Spinner, useAsync, Empty } from '../components/ui.jsx';
import { SiteProvider, buildSiteContext } from './SiteContext.jsx';
import { SHELLS } from './shells.jsx';
import { VIEWS, Overview } from './views/index.jsx';

export default function SiteApp() {
  const { slug } = useParams();
  const loc = useLocation();
  const preview = new URLSearchParams(loc.search).get('preview') === '1';
  const token = useAuth((s) => s.token);
  const api = useMemo(() => siteApi(slug, preview), [slug, preview]);
  const { data, error, loading } = useAsync(() => api.get('/config'), [slug, preview, token]);

  const theme = data?.config?.theme;
  useEffect(() => { if (data?.config) document.title = `${data.config.name} | OpsHub`; return () => { document.title = 'OpsHub | Electrolyte'; }; }, [data]);

  if (!token) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (loading) return <Spinner label="Loading site" />;
  if (error) {
    const code = error.response?.data?.error;
    return <div className="min-h-screen grid place-items-center bg-grid"><Empty title={code === 'not_published' ? 'Not published yet' : 'Cannot open this site'} hint={errMsg(error)}><Link className="btn btn-primary mt-3" to="/">Back to hub</Link></Empty></div>;
  }
  if (data.role === 'public') return <div className="min-h-screen grid place-items-center bg-grid"><Empty title="No access" hint={`You are signed in but not a member of ${data.site.name}. Ask a hub admin to add you.`}><Link className="btn btn-primary mt-3" to="/">Back to hub</Link></Empty></div>;

  const ctx = buildSiteContext({ slug, config: data.config, role: data.role, roleLabel: data.role_label, preview, api, site: data.site });
  const Shell = SHELLS[data.config.theme.layout] || SHELLS.sidebar;
  return (
    <SiteProvider value={ctx}>
      <div className={`themed min-h-screen density-${theme.density}`} style={themeVars(theme)} data-layout={theme.layout}>
        <Shell>
          <Routes>
            <Route index element={ctx.mod('dashboard_shell').showOverview ? <Overview /> : <Navigate to={`${data.config.pages[0]?.path || ''}${ctx.q}`} replace />} />
            {data.config.pages.map((p) => { const V = VIEWS[p.module]; return V ? <Route key={p.path} path={p.path} element={<V page={p} />} /> : null; })}
            <Route path="*" element={<Empty title="Page not found" hint="This page may have been removed in the latest release." />} />
          </Routes>
        </Shell>
      </div>
    </SiteProvider>
  );
}
