import { CheckCircleOutlined, CloudUploadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button, Popconfirm, Result, Segmented, Skeleton, Spin, Tooltip } from 'antd';
import { lazy, Suspense, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { IvrOverview, IvrPublishState } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { formatDateTime } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import './ivr.css';

const MenusTab = lazy(() => import('./MenusTab'));
const QueuesTab = lazy(() => import('./QueuesTab'));
const PromptsTab = lazy(() => import('./PromptsTab'));
const BlacklistTab = lazy(() => import('./BlacklistTab'));

const TABS = [
  { key: 'menu', label: 'IVR menyusi' },
  { key: 'queues', label: 'Navbatlar' },
  { key: 'prompts', label: 'Ovozli xabarlar va ish vaqti' },
  { key: 'blacklist', label: "Qora ro'yxat" },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export interface IvrTabProps {
  data: IvrOverview;
  canEdit: boolean;
  reload: () => Promise<void>;
}

/**
 * Telefoniya → Navbatlar va IVR (F-TEL-02..06, F-ADM-03): ko'p darajali IVR menyusi, navbatlar va ularning operatorlari,
 * ovozli xabarlar, ish vaqtidan tashqari avtojavob. O'zgarishlar avval tizimda saqlanadi, keyin bitta tugma bilan PBX'ga yuklanadi.
 */
export default function IvrPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can(P.SettingsManage);
  const overview = useAsync(() => api.get<IvrOverview>('/ivr').then((r) => r.data), []);
  const [publishing, setPublishing] = useState(false);

  if (!tab) return <Navigate to="/ivr/menu" replace />;
  if (!TABS.some((t) => t.key === tab)) return <Result status="404" title="Sahifa topilmadi" />;

  const data = overview.data;
  const errors = data?.issues.filter((i) => i.level === 'error') ?? [];

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await api.post<IvrPublishState>('/ivr/publish');
      overview.setData((d) => (d ? { ...d, publish: res.data } : d));
      if (res.data.applied) message.success(`v${res.data.version} PBX'ga yuklandi`);
      else message.warning(res.data.note ?? "PBX konfiguratsiyani qabul qilmadi");
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <div className="page-header ivr-header">
        <div>
          <h1>Navbatlar va IVR</h1>
          <span className="page-sub">
            Ovozli menyu, navbatlar va ish vaqtidan tashqari avtojavob · o'zgarishlar audit jurnaliga yoziladi va «PBX'ga yuklash» bilan UCM6510 ga o'tadi
          </span>
        </div>
        {data && <PublishBox state={data.publish} driver={data.driver} canEdit={canEdit} errors={errors.length} busy={publishing} onPublish={() => void publish()} />}
      </div>
      <Segmented<TabKey>
        className="ivr-tabs"
        value={tab as TabKey}
        onChange={(key) => navigate(`/ivr/${key}`)}
        options={TABS.map((t) => ({ value: t.key, label: t.label }))}
      />
      {overview.error && <Alert type="error" showIcon message={overview.error} />}
      {!data ? (
        !overview.error && <Skeleton active />
      ) : (
        <Suspense fallback={<Spin style={{ display: 'block', margin: '48px auto' }} />}>
          {tab === 'menu' && <MenusTab data={data} canEdit={canEdit} reload={overview.reload} />}
          {tab === 'queues' && <QueuesTab data={data} canEdit={canEdit} reload={overview.reload} />}
          {tab === 'prompts' && <PromptsTab data={data} canEdit={canEdit} reload={overview.reload} />}
          {tab === 'blacklist' && <BlacklistTab data={data} canEdit={canEdit} reload={overview.reload} />}
        </Suspense>
      )}
    </>
  );
}

function PublishBox({ state, driver, canEdit, errors, busy, onPublish }: {
  state: IvrPublishState;
  driver: string;
  canEdit: boolean;
  errors: number;
  busy: boolean;
  onPublish: () => void;
}) {
  const published = state.version > 0;
  return (
    <div className="ivr-publish">
      <span className="cell-stack">
        <span className="ivr-publish-state">
          {!published ? (
            <ToneTag tone="amber">PBX'ga hali yuklanmagan</ToneTag>
          ) : state.dirty ? (
            <ToneTag tone="amber">Yuklanmagan o'zgarishlar bor</ToneTag>
          ) : state.applied ? (
            <ToneTag tone="green">PBX bilan bir xil · v{state.version}</ToneTag>
          ) : (
            <ToneTag tone="red">v{state.version} PBX'ga o'tmadi</ToneTag>
          )}
          {driver === 'mock' && <ToneTag tone="grey">Test PBX</ToneTag>}
        </span>
        {published && (
          <span className="cell-sub">
            v{state.version} · {formatDateTime(state.publishedAt)} · {state.publishedBy}
            {state.note && (
              <Tooltip title={state.note}>
                {state.applied ? <CheckCircleOutlined className="ivr-note-icon" /> : <ExclamationCircleOutlined className="ivr-note-icon is-warn" />}
              </Tooltip>
            )}
          </span>
        )}
      </span>
      {canEdit && (
        <Popconfirm
          title="Konfiguratsiya PBX'ga yuklansinmi?"
          description="Navbatlar, IVR menyusi va ish vaqti jadvali UCM6510 ga yuboriladi; kiruvchi qo'ng'iroqlar darhol yangi menyu bo'yicha ishlaydi."
          okText="Yuklash"
          cancelText="Bekor qilish"
          onConfirm={onPublish}
          disabled={errors > 0}
        >
          <Tooltip title={errors > 0 ? `Avval ${errors} ta xatoni tuzating (IVR menyusi tabida)` : undefined}>
            <Button type="primary" icon={<CloudUploadOutlined />} loading={busy} disabled={errors > 0}>
              PBX'ga yuklash
            </Button>
          </Tooltip>
        </Popconfirm>
      )}
    </div>
  );
}
