import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/store.js';
import Login from './pages/Login.jsx';
import HubLayout from './pages/HubLayout.jsx';
import Hub from './pages/Hub.jsx';
import Catalogue from './pages/Catalogue.jsx';
import HubUsers from './pages/HubUsers.jsx';
import PublicSubmit from './pages/PublicSubmit.jsx';
import PublicTrack from './pages/PublicTrack.jsx';
import SiteApp from './renderer/SiteApp.jsx';
import BuilderPage from './builder/BuilderPage.jsx';
import { Toaster } from './components/ui.jsx';

function Private() {
  const token = useAuth((s) => s.token);
  const loc = useLocation();
  return token ? <Outlet /> : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}
function AdminOnly() {
  const user = useAuth((s) => s.user);
  return user?.hubRole === 'admin' ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/s/:slug/submit" element={<PublicSubmit />} />
        <Route path="/s/:slug/track" element={<PublicTrack />} />
        <Route element={<Private />}>
          <Route element={<HubLayout />}>
            <Route index element={<Hub />} />
            <Route path="catalogue" element={<Catalogue />} />
            <Route element={<AdminOnly />}><Route path="users" element={<HubUsers />} /></Route>
          </Route>
          <Route path="/s/:slug/*" element={<SiteApp />} />
          <Route path="/builder/:slug" element={<BuilderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
