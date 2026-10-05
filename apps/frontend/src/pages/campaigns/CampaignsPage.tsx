import { PlusOutlined } from '@ant-design/icons';
import { Alert, Badge, Button, Card, Empty, Progress, Segmented, Skeleton, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CampaignRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { CAMPAIGN_STATUS_META, P } from '../../constants';
import { formatNumber } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { useSocketEvent } from '../../realtime/socket';
import CallbacksPanel from './CallbacksPanel';
import CampaignWorkspace from './CampaignWorkspace';
import NewCampaignModal from './NewCampaignModal';
import './campaigns.css';

const FINISHED = ['COMPLETED', 'CANCELLED'];

/** Chiquvchi qo'ng'iroqlar (prototip: Kampaniyalar artboardi): kampaniyalar va "ko'rib chiqib terish" navbati. */
export default function CampaignsPage() {
  const { can } = useAuth();
  const canManage = can(P.CampaignsManage);
  const [selectedId, setSelectedId] = useState<number>();
  const [showFinished, setShowFinished] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = useAsync(() => api.get<CampaignRow[]>('/campaigns').then((r) => r.data), []);
  const [view, setView] = useState<'campaigns' | 'callbacks'>('campaigns');
  const callbacks = useAsync(() => api.get<{ pending: number }>('/callbacks/counts').then((r) => r.data.pending), []);
  useSocketEvent('callbacks.changed', () => void callbacks.reload());

  const all = list.data ?? [];
  const visible = all.filter((c) => showFinished || !FINISHED.includes(c.status));
  const selected = all.find((c) => c.id === selectedId) ?? visible.find((c) => c.status === 'ACTIVE') ?? visible[0];

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selectedId, selected]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Chiquvchi qo'ng'iroqlar</h1>
          <span className="page-sub">Kampaniyalar va terish navbati · qo'ng'iroqlar UCM6510 orqali, natijalar hisobotlarga tushadi</span>
        </div>
        <div className="header-actions">
          <Segmented<'campaigns' | 'callbacks'>
            value={view}
            onChange={setView}
            options={[
              { value: 'campaigns', label: 'Kampaniyalar' },
              {
                value: 'callbacks',
                label: (
                  <span>
                    Qayta qo'ng'iroqlar <Badge count={callbacks.data ?? 0} size="small" color="#b45309" />
                  </span>
                ),
              },
            ]}
          />
          {canManage && view === 'campaigns' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Yangi kampaniya
            </Button>
          )}
        </div>
      </div>

      {view === 'callbacks' && <CallbacksPanel onChanged={() => void callbacks.reload()} />}

      {view === 'campaigns' && list.error && <Alert type="error" showIcon message={list.error} style={{ marginBottom: 16 }} />}
      {view === 'campaigns' && (
      <div className="campaigns-grid">
        <div className="campaign-list">
          <div className="campaign-list-head">
            <span className="campaign-list-title">Kampaniyalar</span>
            <span className="cell-sub">{visible.length} ta</span>
          </div>
          {list.loading && !list.data ? (
            <Skeleton active />
          ) : visible.length === 0 ? (
            <Card size="small">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Kampaniya yo'q" />
            </Card>
          ) : (
            visible.map((c) => {
              const meta = CAMPAIGN_STATUS_META[c.status];
              const percent = c.stats.total > 0 ? Math.round((c.stats.processed / c.stats.total) * 100) : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`campaign-card${c.id === selected?.id ? ' is-selected' : ''}`}
                  aria-pressed={c.id === selected?.id}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="campaign-card-head">
                    <span className="campaign-card-name">{c.name}</span>
                    <ToneTag tone={meta.tone}>{meta.label}</ToneTag>
                  </span>
                  <Progress percent={percent} showInfo={false} size="small" strokeColor="#0b6b6b" aria-label={`${percent}% kontakt bilan ishlangan`} />
                  <span className="campaign-card-foot">
                    <span>
                      {formatNumber(c.stats.processed)} / {formatNumber(c.stats.total)} kontakt
                    </span>
                    <span>Bog'lanish: {c.stats.reachPercent === null ? '—' : `${c.stats.reachPercent}%`}</span>
                  </span>
                </button>
              );
            })
          )}
          <label className="campaign-finished">
            <Switch size="small" checked={showFinished} onChange={setShowFinished} /> Yakunlanganlarni ko'rsatish
          </label>
        </div>

        {selected ? (
          <CampaignWorkspace key={selected.id} campaignId={selected.id} onChanged={() => void list.reload()} />
        ) : (
          !list.loading && (
            <Card size="small">
              <Empty description={canManage ? 'Kampaniya yarating' : "Faol kampaniya yo'q"} />
            </Card>
          )
        )}
      </div>
      )}

      {canManage && (
        <NewCampaignModal
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            void list.reload();
          }}
        />
      )}
    </>
  );
}
