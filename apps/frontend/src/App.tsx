import { Result, Spin } from 'antd';
import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { P } from './constants';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';

// Sahifalar alohida yuklanadi: operator faqat o'ziga kerak bo'lgan kodni oladi
const AuditPage = lazy(() => import('./pages/AuditPage'));
const CallsPage = lazy(() => import('./pages/CallsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const OperatorPage = lazy(() => import('./pages/OperatorPage'));
const OrgUnitsPage = lazy(() => import('./pages/OrgUnitsPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));

const fullScreenSpin = (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 240 }}>
    <Spin size="large" />
  </div>
);

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return fullScreenSpin;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Guard({ permission, children }: { permission: string; children: ReactElement }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return <Result status="403" title="Ruxsat yo'q" subTitle="Bu bo'lim sizning rolingiz uchun yopiq." />;
  }
  return <Suspense fallback={fullScreenSpin}>{children}</Suspense>;
}

/** Bosh sahifa rolga qarab tanlanadi. */
function HomeRedirect() {
  const { can } = useAuth();
  const target = can(P.ReportsView)
    ? '/dashboard'
    : can(P.TicketsCreate)
      ? '/operator'
      : can(P.TicketsRead)
        ? '/tickets'
        : can(P.UsersManage)
          ? '/users'
          : can(P.AuditRead)
            ? '/audit'
            : '/org-units';
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard" element={<Guard permission={P.ReportsView}><DashboardPage /></Guard>} />
        <Route path="operator" element={<Guard permission={P.TicketsCreate}><OperatorPage /></Guard>} />
        <Route path="tickets" element={<Guard permission={P.TicketsRead}><TicketsPage /></Guard>} />
        <Route path="tickets/:id" element={<Guard permission={P.TicketsRead}><TicketsPage /></Guard>} />
        <Route path="calls" element={<Guard permission={P.CallsRead}><CallsPage /></Guard>} />
        <Route path="org-units" element={<Guard permission={P.OrgRead}><OrgUnitsPage /></Guard>} />
        <Route path="users" element={<Guard permission={P.UsersManage}><UsersPage /></Guard>} />
        <Route path="roles" element={<Guard permission={P.UsersManage}><RolesPage /></Guard>} />
        <Route path="audit" element={<Guard permission={P.AuditRead}><AuditPage /></Guard>} />
        <Route path="soon/:module" element={<Suspense fallback={fullScreenSpin}><PlaceholderPage /></Suspense>} />
        <Route path="*" element={<Result status="404" title="Sahifa topilmadi" />} />
      </Route>
    </Routes>
  );
}
