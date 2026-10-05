import { Result, Spin } from 'antd';
import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { P } from './constants';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';

// Sahifalar alohida yuklanadi: operator faqat o'ziga kerak bo'lgan kodni oladi
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const BillingPage = lazy(() => import('./pages/billing/BillingPage'));
const CallsPage = lazy(() => import('./pages/CallsPage'));
const CampaignsPage = lazy(() => import('./pages/campaigns/CampaignsPage'));
const CrmSettingsPage = lazy(() => import('./pages/crm/CrmSettingsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const IvrPage = lazy(() => import('./pages/ivr/IvrPage'));
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage'));
const LivePage = lazy(() => import('./pages/LivePage'));
const WallPage = lazy(() => import('./pages/wall/WallPage'));
const ManualPage = lazy(() => import('./pages/manual/ManualPage'));
const OmniPage = lazy(() => import('./pages/omni/OmniPage'));
const OperatorPage = lazy(() => import('./pages/OperatorPage'));
const OrgUnitsPage = lazy(() => import('./pages/OrgUnitsPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
// Fuqaro uchun ochiq veb-chat (kadastr.uz saytiga vidjet sifatida joylanadi)
const WebChatPage = lazy(() => import('./pages/webchat/WebChatPage'));

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

function Guard({ permission, children }: { permission: string | string[]; children: ReactElement }) {
  const { canAny } = useAuth();
  if (!canAny(permission)) {
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
      <Route path="/webchat" element={<Suspense fallback={fullScreenSpin}><WebChatPage /></Suspense>} />
      {/* Katta ekran (videodevor): menyu va yuqori panelsiz, to'liq ekranga mo'ljallangan */}
      <Route
        path="/wall"
        element={
          <RequireAuth>
            <Guard permission={P.MonitoringView}>
              <WallPage />
            </Guard>
          </RequireAuth>
        }
      />
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
        <Route path="campaigns" element={<Guard permission={[P.TelephonyUse, P.CampaignsManage]}><CampaignsPage /></Guard>} />
        <Route path="calls" element={<Guard permission={P.CallsRead}><CallsPage /></Guard>} />
        <Route path="knowledge" element={<Guard permission={[P.TicketsCreate, P.TicketsRead, P.KnowledgeManage]}><KnowledgePage /></Guard>} />
        <Route path="ivr/:tab?" element={<Guard permission={[P.SettingsManage, P.MonitoringView]}><IvrPage /></Guard>} />
        <Route path="billing" element={<Guard permission={[P.ReportsView, P.SettingsManage]}><BillingPage /></Guard>} />
        <Route path="omnichannel" element={<Guard permission={[P.TicketsCreate, P.SettingsManage]}><OmniPage /></Guard>} />
        <Route
          path="crm/:tab"
          element={<Guard permission={[P.SettingsManage, P.OrgManage, P.ReportsView]}><CrmSettingsPage /></Guard>}
        />
        <Route path="org-units" element={<Guard permission={P.OrgRead}><OrgUnitsPage /></Guard>} />
        <Route path="users" element={<Guard permission={P.UsersManage}><UsersPage /></Guard>} />
        <Route path="roles" element={<Guard permission={P.UsersManage}><RolesPage /></Guard>} />
        <Route path="live" element={<Guard permission={P.MonitoringView}><LivePage /></Guard>} />
        <Route path="alerts" element={<Guard permission={P.MonitoringView}><AlertsPage /></Guard>} />
        <Route path="analytics" element={<Guard permission={P.ReportsView}><AnalyticsPage /></Guard>} />
        <Route path="settings" element={<Guard permission={P.SettingsManage}><SystemSettingsPage /></Guard>} />
        <Route path="audit" element={<Guard permission={P.AuditRead}><AuditPage /></Guard>} />
        <Route path="manual" element={<Suspense fallback={fullScreenSpin}><ManualPage /></Suspense>} />
        <Route path="*" element={<Result status="404" title="Sahifa topilmadi" />} />
      </Route>
    </Routes>
  );
}
