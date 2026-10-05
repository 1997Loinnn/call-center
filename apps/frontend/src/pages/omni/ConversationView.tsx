import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  LinkOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Drawer, Dropdown, Form, Input, Select, Skeleton, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Category, ConversationDetail, OmniMessage, OrgTreeNode, Region, TicketListItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import StatusTag from '../../components/StatusTag';
import TicketForm, { type TicketFormValues } from '../../components/TicketForm';
import ToneTag from '../../components/ToneTag';
import { CHANNEL_LABELS, P } from '../../constants';
import { formatDate, formatDateTime, formatPhone } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { CHANNEL_META, CONVERSATION_STATUS, contactTitle, QUICK_REPLIES } from './omni-labels';

const dayLabel = (iso: string) => {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), 'day')) return 'Bugun';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Kecha';
  return d.format('DD.MM.YYYY');
};

/** Bitta suhbat: yozishma, javob yozish, biriktirish va o'ng tomonda fuqaro, murojaat va tarix. */
export default function ConversationView({ id, version, onChanged, onClose }: { id: number; version: number; onChanged: () => void; onClose: () => void }) {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const supervisor = can(P.MonitoringView);
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [linkNo, setLinkNo] = useState('');
  const [phone, setPhone] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const operators = useAsync(() => (supervisor ? api.get<{ id: number; fullName: string }[]>('/omni/operators').then((r) => r.data) : Promise.resolve([])), [supervisor]);

  const load = useCallback(async () => {
    try {
      setData((await api.get<ConversationDetail>(`/omni/conversations/${id}`)).data);
      setError(undefined);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  const act = async (request: () => Promise<{ data: ConversationDetail }>, success?: string) => {
    try {
      setData((await request()).data);
      if (success) message.success(success);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await api.post<OmniMessage>(`/omni/conversations/${id}/messages`, { body });
      setDraft('');
      if (res.data.status === 'failed') message.error(res.data.error ?? 'Xabar yuborilmadi');
      else if (res.data.status === 'queued') message.warning(res.data.error ?? 'Xabar navbatda: kanal ulangach yuboriladi');
      await load();
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const retry = async (messageId: number) => {
    try {
      const res = await api.post<OmniMessage>(`/omni/messages/${messageId}/retry`);
      if (res.data.status !== 'sent') message.warning(res.data.error ?? 'Yana yuborilmadi');
      await load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  if (error) return <Alert type="error" showIcon message={error} action={<Button onClick={onClose}>Yopish</Button>} />;
  if (!data) return <Skeleton active className="omni-thread-skeleton" />;

  const meta = CHANNEL_META[data.channel];
  const mine = data.assignee?.id === user?.id;
  const takenByOther = !!data.assignee && !mine;
  const canReply = !takenByOther || supervisor;
  const transcript = data.messages
    .filter((m) => m.direction === 'IN')
    .map((m) => m.body)
    .join('\n');

  return (
    <>
      <section className="omni-thread" aria-label="Yozishma">
        <header className="omni-thread-head">
          <span className={`omni-avatar ${meta.className}`}>{meta.icon}</span>
          <span className="cell-stack omni-thread-title">
            <span className="cell-strong">{contactTitle(data)}</span>
            <span className="cell-sub">
              {meta.label}
              {data.contactHandle ? ` · ${data.contactHandle}` : ''}
              {data.contactPhone ? ` · ${formatPhone(data.contactPhone)}` : ''}
              {data.subject ? ` · ${data.subject}` : ''}
            </span>
          </span>
          <ToneTag tone={CONVERSATION_STATUS[data.status].tone}>{CONVERSATION_STATUS[data.status].label}</ToneTag>
          <span className="header-actions">
            {supervisor ? (
              <Select
                size="small"
                style={{ width: 190 }}
                placeholder="Biriktirilmagan"
                allowClear
                value={data.assignee?.id}
                loading={operators.loading}
                showSearch
                optionFilterProp="label"
                options={(operators.data ?? []).map((o) => ({ value: o.id, label: o.fullName }))}
                onChange={(userId?: number) => void act(() => api.post(`/omni/conversations/${id}/assign`, { userId: userId ?? null }), 'Biriktirildi')}
                aria-label="Mas'ul operator"
              />
            ) : !data.assignee ? (
              <Button size="small" icon={<UserOutlined />} onClick={() => void act(() => api.post(`/omni/conversations/${id}/assign`, { userId: user!.id }), 'Suhbat sizga biriktirildi')}>
                O'zimga olish
              </Button>
            ) : mine ? (
              <Button size="small" onClick={() => void act(() => api.post(`/omni/conversations/${id}/assign`, { userId: null }))}>
                Bo'shatish
              </Button>
            ) : (
              <span className="cell-sub">Mas'ul: {data.assignee.fullName}</span>
            )}
            {data.status === 'CLOSED' ? (
              <Button size="small" icon={<ReloadOutlined />} disabled={!canReply} onClick={() => void act(() => api.post(`/omni/conversations/${id}/reopen`), 'Qayta ochildi')}>
                Qayta ochish
              </Button>
            ) : (
              <Button size="small" icon={<CheckOutlined />} disabled={!canReply} onClick={() => void act(() => api.post(`/omni/conversations/${id}/close`), 'Suhbat yopildi')}>
                Yopish
              </Button>
            )}
            <Button size="small" type="text" icon={<CloseOutlined />} aria-label="Suhbatni yopish" onClick={onClose} className="omni-close" />
          </span>
        </header>

        <div className="omni-messages">
          {data.messages.map((m, i) => {
            const prev = data.messages[i - 1];
            const newDay = !prev || !dayjs(prev.sentAt).isSame(m.sentAt, 'day');
            return (
              <div key={m.id}>
                {newDay && <div className="omni-day">{dayLabel(m.sentAt)}</div>}
                <div className={`omni-msg ${m.direction === 'IN' ? 'is-in' : 'is-out'}${m.isAuto ? ' is-auto' : ''}`}>
                  <div className="omni-bubble">
                    {m.direction === 'OUT' && (
                      <span className="omni-msg-author">
                        {m.isAuto ? (
                          <>
                            <RobotOutlined /> Avtomatik javob
                          </>
                        ) : (
                          (m.author?.fullName ?? 'Operator')
                        )}
                      </span>
                    )}
                    <span className="omni-msg-body">{m.body}</span>
                    {m.attachments?.length ? (
                      <span className="omni-attachments">
                        {m.attachments.map((a, k) => (
                          <span key={k} className="omni-attachment">
                            <PaperClipOutlined /> {a.fileName ?? a.type ?? 'fayl'}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="omni-msg-meta">
                      {dayjs(m.sentAt).format('HH:mm')}
                      {m.direction === 'OUT' && m.status === 'sent' && <CheckOutlined aria-label="Yuborildi" />}
                      {m.status === 'queued' && (
                        <Tooltip title={m.error ?? 'Navbatda'}>
                          <ClockCircleOutlined aria-label="Navbatda" className="omni-msg-queued" />
                        </Tooltip>
                      )}
                      {m.status === 'failed' && (
                        <Tooltip title={m.error ?? 'Yuborilmadi'}>
                          <button type="button" className="omni-msg-failed" onClick={() => void retry(m.id)}>
                            <ExclamationCircleOutlined /> Qayta yuborish
                          </button>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <footer className="omni-composer">
          {takenByOther && !supervisor ? (
            <span className="panel-note">Suhbat {data.assignee?.fullName} ga biriktirilgan.</span>
          ) : (
            <>
              <Input.TextArea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                maxLength={4000}
                placeholder={data.channel === 'EMAIL' ? 'Javob xati… (Ctrl+Enter — yuborish)' : 'Javob yozing… (Ctrl+Enter — yuborish)'}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
                aria-label="Javob matni"
              />
              <div className="omni-composer-actions">
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: QUICK_REPLIES.map((text, k) => ({ key: String(k), label: <span className="omni-quick">{text}</span> })),
                    onClick: ({ key }) => setDraft((d) => (d ? `${d}\n${QUICK_REPLIES[Number(key)]}` : QUICK_REPLIES[Number(key)])),
                  }}
                >
                  <Button size="small" icon={<ThunderboltOutlined />}>
                    Tez javoblar
                  </Button>
                </Dropdown>
                <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!draft.trim()} onClick={() => void send()}>
                  Yuborish
                </Button>
              </div>
            </>
          )}
        </footer>
      </section>

      <aside className="omni-side" aria-label="Fuqaro va murojaat">
        <div className="omni-side-block">
          <span className="panel-section-title">Fuqaro</span>
          {data.citizen ? (
            <span className="cell-stack">
              <span className="cell-strong">{data.citizen.fullName ?? 'F.I.Sh. kiritilmagan'}</span>
              <span className="mono cell-sub">{formatPhone(data.citizen.phone)}</span>
              <span className="cell-sub">
                {data.history.calls} ta qo'ng'iroq · {data.history.tickets.length} ta murojaat
              </span>
            </span>
          ) : (
            <>
              <span className="panel-note">Fuqaro kartasiga bog'lanmagan{data.contactPhone ? ` · raqam: ${formatPhone(data.contactPhone)}` : ''}.</span>
              {can(P.CitizensRead) && (
                <div className="omni-inline-form">
                  <Input
                    size="small"
                    className="mono"
                    placeholder="+998 90 123 45 67"
                    value={phone || data.contactPhone || ''}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-label="Fuqaro telefoni"
                  />
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    disabled={!(phone || data.contactPhone)}
                    onClick={() => void act(() => api.post(`/omni/conversations/${id}/citizen`, { phone: phone || data.contactPhone }), "Fuqaro kartasiga bog'landi")}
                  >
                    Bog'lash
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="omni-side-block">
          <span className="panel-section-title">Murojaat</span>
          {data.ticket ? (
            <Link to={`/tickets/${data.ticket.id}`} className="history-item">
              <span className="mono history-no">{data.ticket.number}</span>
              <StatusTag status={data.ticket.status} />
            </Link>
          ) : (
            <>
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => setTicketOpen(true)} disabled={!canReply}>
                Murojaat yaratish
              </Button>
              <div className="omni-inline-form">
                <Input size="small" className="mono" placeholder="1097-2026-000123" value={linkNo} onChange={(e) => setLinkNo(e.target.value)} aria-label="Mavjud murojaat raqami" />
                <Button
                  size="small"
                  disabled={!linkNo.trim()}
                  onClick={() =>
                    void act(() => api.post(`/omni/conversations/${id}/link-ticket`, { number: linkNo.trim() }), "Murojaatga bog'landi").then(() => setLinkNo(''))
                  }
                >
                  Bog'lash
                </Button>
              </div>
            </>
          )}
        </div>

        {data.history.tickets.length > 0 && (
          <div className="omni-side-block">
            <span className="panel-section-title">Fuqaroning murojaatlari</span>
            {data.history.tickets.map((t) => (
              <Link key={t.id} to={`/tickets/${t.id}`} className="history-item">
                <span className="history-text">
                  <span className="mono history-no">
                    {t.number} · {formatDate(t.createdAt)}
                  </span>
                  <span className="history-subject">
                    {CHANNEL_LABELS[t.channel]} · {t.subject}
                  </span>
                </span>
                <StatusTag status={t.status} />
              </Link>
            ))}
          </div>
        )}
        {data.history.conversations.length > 0 && (
          <div className="omni-side-block">
            <span className="panel-section-title">Boshqa yozishmalar</span>
            {data.history.conversations.map((c) => (
              <Link key={c.id} to={`/omnichannel?c=${c.id}`} className="history-item">
                <span className="history-text">
                  <span className="history-no">
                    {CHANNEL_META[c.channel].icon} {CHANNEL_META[c.channel].label} · {formatDateTime(c.lastMessageAt)}
                  </span>
                  {c.subject && <span className="history-subject">{c.subject}</span>}
                </span>
                <ToneTag tone={CONVERSATION_STATUS[c.status].tone}>{CONVERSATION_STATUS[c.status].label}</ToneTag>
              </Link>
            ))}
          </div>
        )}
        <span className="panel-note omni-side-note">
          <FileOutlined /> Suhbat {formatDateTime(data.createdAt)} da boshlangan
        </span>
      </aside>

      {ticketOpen && (
        <TicketDrawer
          conversationId={id}
          initial={{
            description: transcript.slice(0, 5000),
            citizenPhone: data.citizen?.phone ?? data.contactPhone ?? undefined,
            citizenName: data.citizen?.fullName ?? data.contactName ?? undefined,
          }}
          onClose={() => setTicketOpen(false)}
          onCreated={(ticket) => {
            setTicketOpen(false);
            message.success(`${ticket.number} murojaati yaratildi, fuqaroga raqami yuborildi`);
            void load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function TicketDrawer({ conversationId, initial, onClose, onCreated }: {
  conversationId: number;
  initial: Partial<TicketFormValues>;
  onClose: () => void;
  onCreated: (ticket: TicketListItem) => void;
}) {
  const [form] = Form.useForm<TicketFormValues>();
  const reference = useAsync(
    () =>
      Promise.all([
        api.get<Category[]>('/reference/categories').then((r) => r.data),
        api.get<Region[]>('/reference/regions').then((r) => r.data),
        api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data),
      ]),
    [],
  );
  const [categories = [], regions = [], orgTree = []] = reference.data ?? [];

  // Forma ma'lumotnomalar yuklangach chiziladi: shundan keyin suhbat matni va kontakt qo'yiladi
  useEffect(() => {
    if (reference.data) form.setFieldsValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, reference.data]);

  return (
    <Drawer open width={860} title="Yozishmadan murojaat" onClose={onClose} className="omni-ticket-drawer">
      {reference.error && <Alert type="error" showIcon message={reference.error} />}
      {!reference.data ? (
        <Skeleton active />
      ) : (
        <TicketForm
          form={form}
          submitUrl={`/omni/conversations/${conversationId}/ticket`}
          categories={categories}
          regions={regions}
          orgTree={orgTree}
          created={null}
          onCreated={onCreated}
        />
      )}
    </Drawer>
  );
}
