import { ExperimentOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, Input, Pagination, Segmented, Select, Skeleton, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { ConversationItem, OmniChannel, OmniChannels } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../constants';
import { useAsync } from '../../hooks/useAsync';
import { useSocketEvent } from '../../realtime/socket';
import ChannelsDrawer from './ChannelsDrawer';
import ConversationView from './ConversationView';
import { CHANNEL_META, contactTitle } from './omni-labels';
import SimulateModal from './SimulateModal';
import './omni.css';

type StatusFilter = 'active' | 'open' | 'pending' | 'closed' | 'all';
const PAGE_SIZE = 30;

const timeOf = (iso: string) => (dayjs(iso).isSame(dayjs(), 'day') ? dayjs(iso).format('HH:mm') : dayjs(iso).format('DD.MM'));

/**
 * Xabar almashish → Omnikanal (F-OMNI-01..04): Telegram, veb-chat va email yozishmalari bitta oynada.
 * Chapda suhbatlar, o'rtada yozishma, o'ngda fuqaro kartasi va murojaat.
 */
export default function OmniPage() {
  const { can } = useAuth();
  const operator = can(P.TicketsCreate);
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('c')) || null;
  const [status, setStatus] = useState<StatusFilter>('active');
  const [scope, setScope] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [channel, setChannel] = useState<OmniChannel | undefined>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showChannels, setShowChannels] = useState(!operator);
  const [simulating, setSimulating] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>();

  const channels = useAsync(() => api.get<OmniChannels>('/omni/channels').then((r) => r.data), []);
  const list = useAsync(
    () =>
      operator
        ? api
            .get<{ items: ConversationItem[]; total: number }>('/omni/conversations', { params: { status, scope, channel, search: query || undefined, page, pageSize: PAGE_SIZE } })
            .then((r) => r.data)
        : Promise.resolve({ items: [], total: 0 }),
    [operator, status, scope, channel, query, page],
  );

  useEffect(() => setPage(1), [status, scope, channel, query]);

  const select = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set('c', String(id));
      else next.delete('c');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // Yangi xabar yoki boshqa operatorning amali: ro'yxat (biroz kechiktirib) va ochiq suhbat yangilanadi
  useSocketEvent<{ conversationId: number }>('omni.changed', (event) => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void list.reload(), 600);
    if (event.conversationId === selectedId) setDetailVersion((v) => v + 1);
  });

  const items = list.data?.items ?? [];
  const ch = channels.data;

  return (
    <div className="omni-page">
      <div className="page-header omni-header">
        <div>
          <h1>Omnikanal</h1>
          <span className="page-sub">Telegram bot, saytdagi veb-chat va email murojaatlari bitta oynada · fuqaro tarixi va murojaatlar bilan bog'langan</span>
        </div>
        <div className="header-actions">
          {ch && (
            <span className="omni-channel-states">
              {(['TELEGRAM', 'WEBCHAT', 'EMAIL'] as OmniChannel[]).map((c) => {
                const state = c === 'TELEGRAM' ? ch.telegram.state : c === 'WEBCHAT' ? ch.webchat.state : ch.email.inbound === 'connected' || ch.email.outbound === 'connected' ? 'connected' : ch.email.outbound;
                return (
                  <Tooltip key={c} title={state === 'connected' ? 'Ulangan' : state === 'error' ? 'Ulanishda xato' : 'Ulanmagan'}>
                    <span className={`omni-channel-state is-${state}`}>
                      {CHANNEL_META[c].icon} {CHANNEL_META[c].label}
                    </span>
                  </Tooltip>
                );
              })}
            </span>
          )}
          {ch?.devSimulation && operator && (
            <Button icon={<ExperimentOutlined />} onClick={() => setSimulating(true)}>
              Sinov xabari
            </Button>
          )}
          <Button icon={<SettingOutlined />} onClick={() => setShowChannels(true)}>
            Kanallar
          </Button>
        </div>
      </div>

      {!operator ? (
        <Empty description="Yozishmalar bilan operator va supervisorlar ishlaydi. Kanallar va avtomatik javoblarni «Kanallar» tugmasi orqali sozlang." />
      ) : (
        <div className="omni-grid">
          <aside className="omni-list" aria-label="Suhbatlar">
            <div className="omni-filters">
              <Segmented<StatusFilter>
                size="small"
                block
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'active', label: 'Faol' },
                  { value: 'open', label: 'Javobsiz' },
                  { value: 'closed', label: 'Yopilgan' },
                  { value: 'all', label: 'Hammasi' },
                ]}
              />
              <div className="omni-filter-row">
                <Select
                  size="small"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'all', label: 'Barchasi' },
                    { value: 'mine', label: 'Meniki' },
                    { value: 'unassigned', label: 'Biriktirilmagan' },
                  ]}
                  style={{ flex: 1 }}
                />
                <Select
                  size="small"
                  allowClear
                  placeholder="Kanal"
                  value={channel}
                  onChange={setChannel}
                  options={(Object.keys(CHANNEL_META) as OmniChannel[]).map((c) => ({ value: c, label: CHANNEL_META[c].label }))}
                  style={{ flex: 1 }}
                />
              </div>
              <Input
                size="small"
                allowClear
                data-hotkey="search"
                prefix={<SearchOutlined />}
                placeholder="Ism, raqam, matn yoki murojaat №"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value) setQuery('');
                }}
                onPressEnter={() => setQuery(search.trim())}
              />
            </div>
            <div className="omni-items">
              {list.loading && !list.data ? (
                <Skeleton active paragraph={{ rows: 6 }} />
              ) : items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Suhbat yo'q" />
              ) : (
                items.map((c) => (
                  <button key={c.id} type="button" className={`omni-item${c.id === selectedId ? ' is-selected' : ''}${c.unreadCount > 0 ? ' is-unread' : ''}`} onClick={() => select(c.id)}>
                    <span className={`omni-avatar ${CHANNEL_META[c.channel].className}`} aria-label={CHANNEL_META[c.channel].label}>
                      {CHANNEL_META[c.channel].icon}
                    </span>
                    <span className="omni-item-body">
                      <span className="omni-item-top">
                        <span className="omni-item-name">{contactTitle(c)}</span>
                        <span className="omni-item-time mono">{timeOf(c.lastMessageAt)}</span>
                      </span>
                      <span className="omni-item-text">
                        {c.lastMessage?.direction === 'OUT' && <span className="omni-you">{c.lastMessage.isAuto ? 'Bot: ' : 'Siz: '}</span>}
                        {c.subject && c.channel === 'EMAIL' ? `${c.subject} — ` : ''}
                        {c.lastMessage?.body}
                      </span>
                      <span className="omni-item-meta">
                        {c.ticket && <span className="mono omni-ticket-no">{c.ticket.number}</span>}
                        <span>{c.assignee ? c.assignee.fullName : 'Biriktirilmagan'}</span>
                        {c.status === 'CLOSED' && <span>· yopilgan</span>}
                      </span>
                    </span>
                    {c.unreadCount > 0 && <Badge count={c.unreadCount} className="omni-unread" />}
                  </button>
                ))
              )}
            </div>
            {(list.data?.total ?? 0) > PAGE_SIZE && (
              <Pagination size="small" simple current={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} className="omni-pagination" />
            )}
          </aside>

          {selectedId ? (
            <ConversationView key={selectedId} id={selectedId} version={detailVersion} onChanged={() => void list.reload()} onClose={() => select(null)} />
          ) : (
            <div className="omni-empty">
              <Empty description="Chapdan suhbatni tanlang" />
            </div>
          )}
        </div>
      )}

      {showChannels && ch && <ChannelsDrawer channels={ch} onClose={() => setShowChannels(false)} />}
      {simulating && (
        <SimulateModal
          onClose={() => setSimulating(false)}
          onSent={(id) => {
            setSimulating(false);
            void list.reload();
            if (id) select(id);
          }}
        />
      )}
    </div>
  );
}
