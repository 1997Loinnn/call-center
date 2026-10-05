import { Result, Segmented, Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../constants';
import './crm.css';

const CategoriesTab = lazy(() => import('./CategoriesTab'));
const RoutingTab = lazy(() => import('./RoutingTab'));
const ExportTemplatesTab = lazy(() => import('./ExportTemplatesTab'));

const TABS = [
  { key: 'categories', label: 'Toifalar va mavzular', permission: [P.SettingsManage] },
  { key: 'routing', label: "Yo'naltirish qoidalari", permission: [P.OrgManage] },
  { key: 'export', label: 'Eksport shablonlari', permission: [P.ReportsView, P.SettingsManage] },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** CRM sozlamalari (prototip: Sozlamalar artboardi): toifalar va mavzular, yo'naltirish qoidalari, eksport shablonlari. */
export default function CrmSettingsPage() {
  const { tab } = useParams();
  const { canAny } = useAuth();
  const navigate = useNavigate();
  const allowed = TABS.filter((t) => canAny([...t.permission]));

  if (!TABS.some((t) => t.key === tab)) return <Result status="404" title="Sahifa topilmadi" />;
  if (!allowed.some((t) => t.key === tab)) {
    return allowed.length > 0 ? <Navigate to={`/crm/${allowed[0].key}`} replace /> : <Result status="403" title="Ruxsat yo'q" />;
  }

  return (
    <>
      <div className="page-header crm-header">
        <div>
          <h1>CRM sozlamalari</h1>
          <span className="page-sub">Murojaat toifalari, mavzular, yo'naltirish qoidalari va eksport shablonlari · har bir o'zgarish audit jurnaliga yoziladi</span>
        </div>
        {allowed.length > 1 && (
          <Segmented<TabKey>
            value={tab as TabKey}
            onChange={(key) => navigate(`/crm/${key}`)}
            options={allowed.map((t) => ({ value: t.key, label: t.label }))}
          />
        )}
      </div>
      <Suspense fallback={<Spin style={{ display: 'block', margin: '48px auto' }} />}>
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'routing' && <RoutingTab />}
        {tab === 'export' && <ExportTemplatesTab />}
      </Suspense>
    </>
  );
}
