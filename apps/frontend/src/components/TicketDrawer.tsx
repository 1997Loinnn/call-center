import { LockOutlined, PaperClipOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Drawer, Empty, Input, Popconfirm, Skeleton, Space, Steps, Tabs, Timeline, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api/client';
import type { TicketDetail, TicketStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CALL_RESULT_META, CHANNEL_LABELS, EVENT_LABELS, P, STATUS_META, TYPE_LABELS } from '../constants';
import { formatDateTime, formatDuration, formatPhone, isOverdue } from '../format';
import { useAsync } from '../hooks/useAsync';
import { TONE } from '../theme';
import ActionModal, { type ActionKind } from './ActionModal';
import StatusTag from './StatusTag';
import ToneTag from './ToneTag';
import './ticket-drawer.css';

const FLOW: TicketStatus[] = ['NEW', 'ROUTED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'];

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Murojaat tafsiloti (F-CRM-09): Umumiy, Jarayon, Javob, Fayllar, Tarix; amallar holat va rolga qarab. */
export default function TicketDrawer({ id, onClose, onChanged }: {
  id: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, can } = useAuth();
  const { message } = App.useApp();
  const [tab, setTab] = useState('general');
  const [action, setAction] = useState<ActionKind | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: t, loading, error, reload } = useAsync(
    () => (id ? api.get<TicketDetail>(`/tickets/${id}`).then((r) => r.data) : Promise.resolve(undefined)),
    [id],
  );

  useEffect(() => {
    setTab('general');
    setAnswer('');
  }, [id]);

  const done = () => {
    setAction(null);
    void reload();
    onChanged();
  };

  const post = async (path: string, body?: object, success = 'Saqlandi') => {
    setBusy(true);
    try {
      await api.post(`/tickets/${id}/${path}`, body);
      message.success(success);
      setAnswer('');
      done();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const callCitizen = async (number: string) => {
    try {
      await api.post('/telephony/originate', { number });
      message.success("Qo'ng'iroq boshlanmoqda");
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const isAssignee = !!t && t.assigneeId === user?.id;
  const canAnswer = !!t && t.status === 'IN_PROGRESS' && can(P.TicketsAnswer) && (isAssignee || can(P.TicketsAssign));
  const canApprove = !!t && t.status === 'ANSWERED' && can(P.TicketsApprove);

  const actions: ReactNode[] = [];
  if (t) {
    if ((t.status === 'NEW' || t.status === 'RETURNED') && can(P.TicketsRoute)) {
      actions.push(<Button key="route" type="primary" onClick={() => setAction('route')}>Yo'naltirish</Button>);
    }
    if (t.status === 'ROUTED' && can(P.TicketsAssign)) {
      actions.push(<Button key="assign" type="primary" onClick={() => setAction('assign')}>Ijrochiga berish</Button>);
      actions.push(<Button key="return" onClick={() => setAction('return')}>Qaytarish (noto'g'ri yo'naltirilgan)</Button>);
    }
    if (canAnswer) {
      actions.push(<Button key="answer" type="primary" onClick={() => setTab('answer')}>Javob yozish</Button>);
    }
    if (canApprove) {
      actions.push(<Button key="review" type="primary" onClick={() => setTab('answer')}>Javobni ko'rib chiqish</Button>);
    }
    if (t.status === 'CLOSED' && can(P.TicketsReopen) && t.assigneeId) {
      actions.push(<Button key="reopen" onClick={() => setAction('reopen')}>Qayta ochish</Button>);
    }
  }
  const hasWork = actions.length > 0;

  const overdue = !!t && isOverdue(t.dueAt, t.status);
  const lastEvent = (status: TicketStatus) => t?.events.filter((e) => e.toStatus === status).at(-1);
  const returned = t?.status === 'RETURNED' ? lastEvent('RETURNED') : undefined;
  const flowIndex = t ? (t.status === 'RETURNED' ? 1 : FLOW.indexOf(t.status)) : 0;

  const general = t && (
    <div className="td-body">
      <section className="td-section">
        <h3>Murojaat</h3>
        <dl className="td-grid">
          <Fact label="Turi">{TYPE_LABELS[t.type]}</Fact>
          <Fact label="Kanal">{CHANNEL_LABELS[t.channel]}</Fact>
          <Fact label="Qabul qilingan">{formatDateTime(t.createdAt)}</Fact>
          <Fact label="Yangilangan">{formatDateTime(t.updatedAt)}</Fact>
          <Fact label="Ijro muddati">
            <span className={overdue ? 'td-danger' : undefined}>
              {formatDateTime(t.dueAt)}
              {overdue ? " — o'tgan" : ''}
            </span>
          </Fact>
          <Fact label="Hudud">{[t.region?.nameUz, t.district?.nameUz].filter(Boolean).join(', ') || '—'}</Fact>
          {t.cadastreNumber && <Fact label="Kadastr raqami"><span className="mono">{t.cadastreNumber}</span></Fact>}
          {t.applicationNumber && <Fact label="Ariza raqami"><span className="mono">{t.applicationNumber}</span></Fact>}
        </dl>
        <div className="td-block">
          <span className="td-label">Tavsif</span>
          <p className="td-text">{t.description}</p>
        </div>
        {t.category && (
          <div className="td-block">
            <span className="td-label">Mavzu</span>
            <div className="td-topic">
              {t.category.parent && <span className="td-topic-no mono">{t.category.sortOrder}</span>}
              <span className="td-topic-text">
                <span className="td-label">{t.category.parent?.nameUz ?? 'Toifa'}</span>
                <span>{t.category.nameUz}</span>
              </span>
            </div>
          </div>
        )}
      </section>
      <section className="td-section">
        <h3>Mas'ullar</h3>
        <dl className="td-grid">
          <Fact label="Asosiy mas'ul (bo'linma)">{t.assignedOrgUnit?.name ?? <span className="td-muted">Tayinlanmagan</span>}</Fact>
          <Fact label="Ijrochi xodim">{t.assignee?.fullName ?? <span className="td-muted">Tayinlanmagan</span>}</Fact>
          <Fact label="Qabul qilgan operator">{t.createdBy?.fullName ?? '—'}</Fact>
        </dl>
      </section>
      <section className="td-section">
        <h3>Fuqaro ma'lumotlari</h3>
        {t.citizen ? (
          <dl className="td-grid">
            <Fact label="F.I.Sh.">{t.citizen.fullName ?? <span className="td-muted">Ko'rsatilmagan</span>}</Fact>
            <Fact label="Telefon"><span className="mono">{formatPhone(t.citizen.phone)}</span></Fact>
            {t.citizen.address && <Fact label="Manzil">{t.citizen.address}</Fact>}
          </dl>
        ) : (
          <p className="td-muted">{t.isAnonymous ? "Anonim murojaat: fuqaro ma'lumotlari yashirilgan." : "Fuqaro ma'lumotlari kiritilmagan."}</p>
        )}
      </section>
    </div>
  );

  const process = t && (
    <div className="td-body">
      {returned && (
        <Alert
          type="warning"
          showIcon
          message="Murojaat qaytarilgan"
          description={`${returned.comment ?? 'Sabab ko\'rsatilmagan'} — ${returned.actor?.fullName ?? ''}, ${formatDateTime(returned.createdAt)}`}
        />
      )}
      <Steps
        direction="vertical"
        size="small"
        current={flowIndex}
        status={t.status === 'RETURNED' ? 'error' : t.status === 'CLOSED' ? 'finish' : 'process'}
        items={FLOW.map((s, i) => {
          const e = lastEvent(s);
          const reached = i <= flowIndex;
          return {
            title: i === 1 && t.status === 'RETURNED' ? 'Qaytarildi' : STATUS_META[s].label,
            description: reached && e ? `${formatDateTime(e.createdAt)}${e.actor ? ` · ${e.actor.fullName}` : ''}${e.orgUnit ? ` → ${e.orgUnit.name}` : ''}` : undefined,
          };
        })}
      />
      <div className="td-actions">
        <span className="td-label">Amallar</span>
        {hasWork ? <Space wrap>{actions}</Space> : <span className="td-muted">Bu bosqichda sizning rolingiz uchun amal yo'q.</span>}
        <Button type="dashed" onClick={() => setAction('comment')}>
          Izoh qo'shish
        </Button>
      </div>
    </div>
  );

  const answerTab = t && (
    <div className="td-body">
      {t.answer ? (
        <div className="td-answer">
          <div className="td-answer-head">
            <span className="td-label">Javob{t.answeredAt ? ` · ${formatDateTime(t.answeredAt)}` : ''}</span>
            <StatusTag status={t.status} />
          </div>
          <p className="td-text">{t.answer}</p>
        </div>
      ) : (
        !canAnswer && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Hali javob yozilmagan" />
      )}
      {canAnswer && (
        <div className="td-block">
          <label htmlFor="td-answer" className="td-label">
            Fuqaroga javob matni
          </label>
          <Input.TextArea
            id="td-answer"
            rows={6}
            maxLength={5000}
            showCount
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={`Hurmatli fuqaro, ${t.number} raqamli murojaatingiz ko'rib chiqildi…`}
          />
          <Button
            type="primary"
            loading={busy}
            disabled={!answer.trim()}
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
            onClick={() => void post('answer', { answer: answer.trim() }, 'Javob yuborildi — supervisor tasdig\'ini kutadi')}
          >
            Javobni yuborish
          </Button>
        </div>
      )}
      {canApprove && (
        <Space wrap>
          <Popconfirm title="Javob tasdiqlansinmi va murojaat yopilsinmi?" okText="Ha" cancelText="Yo'q" onConfirm={() => void post('approve', undefined, 'Murojaat yopildi')}>
            <Button type="primary" loading={busy}>
              Tasdiqlash va yopish
            </Button>
          </Popconfirm>
          <Button danger onClick={() => setAction('reject')}>
            Rad etish
          </Button>
        </Space>
      )}
    </div>
  );

  const files = t && (
    <div className="td-body">
      <section className="td-section">
        <h3>Biriktirilgan fayllar</h3>
        {t.attachments.length === 0 ? (
          <span className="td-muted">Fayl biriktirilmagan.</span>
        ) : (
          <ul className="td-list">
            {t.attachments.map((a) => (
              <li key={a.id}>
                <PaperClipOutlined />
                <span className="td-list-main">{a.fileName}</span>
                <span className="td-muted">
                  {fileSize(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span className="td-muted td-note">Fayl yuklash va yuklab olish fayl arxivi (MinIO) ulangach ishlaydi.</span>
      </section>
      <section className="td-section">
        <h3>Bog'langan qo'ng'iroqlar</h3>
        {t.calls.length === 0 ? (
          <span className="td-muted">Qo'ng'iroq bog'lanmagan.</span>
        ) : (
          <ul className="td-list">
            {t.calls.map((c) => (
              <li key={c.id}>
                <PhoneOutlined />
                <span className="td-list-main">{formatDateTime(c.startedAt)}</span>
                <span className="mono td-muted">{formatDuration(c.talkSeconds)}</span>
                {c.result && <ToneTag tone={CALL_RESULT_META[c.result].tone}>{CALL_RESULT_META[c.result].label}</ToneTag>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const history = t && (
    <div className="td-body">
      <Timeline
        items={t.events.map((e) => ({
          color: e.toStatus ? TONE[STATUS_META[e.toStatus].tone].dot : TONE.grey.dot,
          children: (
            <>
              <Typography.Text strong>{EVENT_LABELS[e.type] ?? e.type}</Typography.Text>
              {e.orgUnit && <> → {e.orgUnit.name}</>}
              <div>
                <Typography.Text type="secondary">
                  {formatDateTime(e.createdAt)}
                  {e.actor ? ` · ${e.actor.fullName}` : ''}
                </Typography.Text>
              </div>
              {e.comment && <div className="td-text">{e.comment}</div>}
            </>
          ),
        }))}
      />
    </div>
  );

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      width={680}
      className="ticket-drawer"
      title={
        t ? (
          <div className="td-title">
            <span className="mono">{t.number}</span>
            <StatusTag status={t.status} />
            {overdue && <ToneTag tone="red">Muddati o'tgan</ToneTag>}
            {t.isConfidential && (
              <ToneTag tone="grey">
                <LockOutlined /> Maxfiy
              </ToneTag>
            )}
          </div>
        ) : (
          'Murojaat'
        )
      }
    >
      {error && <Alert type="error" message={error} showIcon />}
      {loading && !t ? (
        <Skeleton active />
      ) : t ? (
        <>
          <div className="td-person">
            <span className="td-person-name">{t.citizen?.fullName ?? (t.isAnonymous ? 'Anonim' : "Fuqaro ko'rsatilmagan")}</span>
            {t.citizen &&
              (can(P.TelephonyUse) ? (
                <Button size="small" className="td-call" icon={<PhoneOutlined />} onClick={() => void callCitizen(t.citizen!.phone)} aria-label={`${formatPhone(t.citizen.phone)} raqamiga qo'ng'iroq qilish`}>
                  <span className="mono">{formatPhone(t.citizen.phone)}</span>
                </Button>
              ) : (
                <span className="mono td-muted">{formatPhone(t.citizen.phone)}</span>
              ))}
          </div>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'general', label: 'Umumiy', children: general },
              {
                key: 'process',
                label: (
                  <Badge dot={hasWork} offset={[6, 0]}>
                    Jarayon
                  </Badge>
                ),
                children: process,
              },
              { key: 'answer', label: 'Javob', children: answerTab },
              { key: 'files', label: `Fayllar (${t.attachments.length + t.calls.length})`, children: files },
              { key: 'history', label: `Tarix (${t.events.length})`, children: history },
            ]}
          />
        </>
      ) : null}

      <ActionModal kind={action} ticket={t} onCancel={() => setAction(null)} onDone={done} />
    </Drawer>
  );
}
