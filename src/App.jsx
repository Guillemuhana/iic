import { lazy, Suspense } from 'react';
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// En la demo publicada no hay rutas de servidor: la navegación vive en memoria.
const Router = import.meta.env.VITE_DEMO === '1' ? MemoryRouter : BrowserRouter;
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, Spinner } from './components/ui';
import Login from './pages/Login';
import CajaHome from './pages/caja/CajaHome';
import ScanFlow from './pages/caja/ScanFlow';
import AdminLayout from './pages/admin/AdminLayout';

const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Appointments = lazy(() => import('./pages/admin/Appointments'));
const Tickets = lazy(() => import('./pages/admin/Tickets'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Users = lazy(() => import('./pages/admin/Users'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));

function Loading() {
  return <div className="grid h-full min-h-[50vh] place-items-center"><Spinner className="size-7" /></div>;
}

function Protected({ roles, children }) {
  const { profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!profile) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/panel' : '/caja'} replace />;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/caja" element={<Protected><CajaHome /></Protected>} />
              <Route path="/caja/escanear" element={<Protected><ScanFlow /></Protected>} />
              <Route path="/panel" element={<Protected roles={['admin']}><AdminLayout /></Protected>}>
                <Route index element={<Dashboard />} />
                <Route path="turnos" element={<Appointments />} />
                <Route path="comprobantes" element={<Tickets />} />
                <Route path="envios" element={<Reports />} />
                <Route path="usuarios" element={<Navigate to="/panel/configuracion/usuarios" replace />} />
                <Route path="configuracion/usuarios" element={<Users />} />
                <Route path="configuracion" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}
