import { CloseOutlined, DeleteOutlined, DownloadOutlined, LockOutlined, PaperClipOutlined, PhoneOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Drawer, Dropdown, Empty, Input, Popconfirm, Popover, Skeleton, Space, Steps, Tabs, Timeline, TreeSelect, Typography, Upload } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile, errorMessage } from '../api/client';
import type { OrgTreeNode, SmsStatus, TicketDetail, TicketStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AI_FLAG_LABELS, CALL_RESULT_META, CHANNEL_LABELS, EVENT_LABELS, P, STATUS_META, TYPE_LABELS } from '../constants';
import { formatDateTime, formatDuration, formatPhone, isOverdue } from '../format';
import { useAsync } from '../hooks/useAsync';
import { TONE, type Tone } from '../theme';
import ActionModal, { type ActionKind } from './ActionModal';
import { toTreeSelect } from './orgTree';
import StatusTag from './StatusTag';
import TicketTasks, { type TicketTask } from './TicketTasks';
import ToneTag from './ToneTag';
import './ticket-drawer.css';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp3,.ogg';

const SMS_STATUS: Record<SmsStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Navbatda', tone: 'amber' },
  SENT: { label: 'Yuborildi', tone: 'blue' },
  DELIVERED: { label: 'Yetkazildi', tone: 'green' },
  FAILED: { label: 'Yetkazilmadi', tone: 'red' },
};

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

/** Murojaat tafsiloti (F-CRM-09): Umumiy, Jarayon, Vazifalar, Javob, Fayllar, Tarix; amallar holat va rolga qarab. */
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
  const canShare = can(P.TicketsRoute) || can(P.TicketsAssign);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUnit, setShareUnit] = useState<number>();
  const orgTree = useAsync(
    () => (id && canShare && can(P.OrgRead) ? api.get<OrgTreeNode[]>('/org-units/tree').then((r) => toTreeSelect(r.data)) : Promise.resolve([])),
    [id, canShare],
  );
  const tasks = useAsync(() => (id ? api.get<TicketTask[]>(`/tickets/${id}/tasks`).then((r) => r.data) : Promise.resolve(undefined)), [id]);

  useEffect(() => {
    setTab('general');
    setAnswer('');
  }, [id]);

  const done = () => {
    setAction(null);
    void reload();
    onChanged();
  };

  const [uploading, setUploading] = useState(0);
  const uploadFile = async (file: File) => {
    setUploading((n) => n + 1);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post(`/tickets/${id}/attachments`, body);
      message.success(`${file.name} biriktirildi`);
      void reload();
    } catch (err) {
      message.error(`${file.name}: ${errorMessage(err)}`);
    } finally {
      setUploading((n) => n - 1);
    }
  };
  const removeFile = async (attachmentId: number) => {
    try {
      await api.delete(`/tickets/${id}/attachments/${attachmentId}`);
      void reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
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

  // Murojaat kartasi (PDF) va fuqaroga javob xati (DOCX); har bir yuklash audit jurnaliga yoziladi
  const exportDoc = async (format: 'pdf' | 'docx') => {
    if (!t) return;
    try {
      await downloadFile(`/tickets/${t.id}/export`, { format }, `${format === 'docx' ? 'javob-xati' : 'murojaat'}-${t.number}.${format}`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  /** Ishtirokchi (hamkor) bo'linma: murojaatni ko'radi, izoh va vazifa qo'shadi; javobni asosiy mas'ul tayyorlaydi */
  const addParticipant = async () => {
    if (!t || !shareUnit) return;
    try {
      await api.post(`/tickets/${t.id}/participants`, { orgUnitId: shareUnit });
      message.success("Ishtirokchi qo'shildi — bo'linma rahbariga xabar yuborildi");
      setShareOpen(false);
      setShareUnit(undefined);
      void reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeParticipant = async (orgUnitId: number) => {
    if (!t) return;
    try {
      await api.delete(`/tickets/${t.id}/participants/${orgUnitId}`);
      void reload();
    } catch (err) {
      message.error(errorMessage(err));
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
        {(t.duplicateOf || t.duplicates.length > 0) && (
          <div className="td-block td-duplicates">
            <span className="td-label">Takroriy murojaat</span>
            {t.duplicateOf ? (
              <span>
                Fuqaro shu mavzuda avval murojaat qilgan — asl murojaat:{' '}
                <Link to={`/tickets/${t.duplicateOf.id}`} className="mono">
                  {t.duplicateOf.number}
                </Link>{' '}
                <StatusTag status={t.duplicateOf.status} />
              </span>
            ) : (
              <span>
                Shu mavzuda yana {t.duplicates.length} marta murojaat qilingan:{' '}
                {t.duplicates.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <Link to={`/tickets/${d.id}`} className="mono">
                      {d.number}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
        {t.category && (
          <div className="td-block">
            <span className="td-label">{t.extraTopics.length > 0 ? 'Mavzular' : 'Mavzu'}</span>
            {[{ category: t.category, primary: true }, ...t.extraTopics.map((x) => ({ category: x.category, primary: false }))].map(({ category, primary }) => (
              <div key={category.id} className="td-topic">
                {category.parent && <span className="td-topic-no mono">{category.sortOrder}</span>}
                <span className="td-topic-text">
                  <span className="td-label">
                    {category.parent?.nameUz ?? 'Toifa'}
                    {primary && t.extraTopics.length > 0 ? ' · asosiy' : ''}
                  </span>
                  <span>{category.nameUz}</span>
                </span>
              </div>
            ))}
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
        <div className="td-block">
          <span className="td-label">Ishtirokchilar</span>
          <div className="td-chips">
            {t.participants.length === 0 && !canShare && <span className="td-muted">Yo'q</span>}
            {t.participants.map((p) => (
              <span key={p.orgUnit.id} className="td-chip" title={p.addedBy ? `Qo'shdi: ${p.addedBy.fullName}, ${formatDateTime(p.createdAt)}` : undefined}>
                {p.orgUnit.name}
                {canShare && (
                  <Popconfirm title={`${p.orgUnit.name} ishtirokchilardan olib tashlansinmi?`} okText="Ha" cancelText="Yo'q" onConfirm={() => void removeParticipant(p.orgUnit.id)}>
                    <button type="button" className="td-chip-x" aria-label={`${p.orgUnit.name}: olib tashlash`}>
                      <CloseOutlined />
                    </button>
                  </Popconfirm>
                )}
              </span>
            ))}
            {canShare && (
              <Popover
                trigger="click"
                open={shareOpen}
                onOpenChange={setShareOpen}
                content={
                  <div className="td-share">
                    <TreeSelect
                      showSearch
                      treeNodeFilterProp="title"
                      placeholder="Bo'linmani tanlang"
                      style={{ width: 300 }}
                      value={shareUnit}
                      onChange={setShareUnit}
                      treeData={orgTree.data ?? []}
                    />
                    <Button type="primary" disabled={!shareUnit} onClick={() => void addParticipant()}>
                      Qo'shish
                    </Button>
                  </div>
                }
              >
                <Button size="small" type="dashed" icon={<PlusOutlined />}>
                  Qo'shish
                </Button>
              </Popover>
            )}
          </div>
        </div>
      </section>
      <section className="td-section">
        <h3>Fuqaro ma'lumotlari</h3>
        {t.citizen ? (
          <dl className="td-grid">
            <Fact label="F.I.Sh.">{t.citizen.fullName ?? <span className="td-muted">Ko'rsatilmagan</span>}</Fact>
            <Fact label="Telefon"><span className="mono">{formatPhone(t.citizen.phone)}</span></Fact>
            {t.citizen.extraPhones.length > 0 && (
              <Fact label="Qo'shimcha raqamlar">
                <span className="mono">{t.citizen.extraPhones.map(formatPhone).join(', ')}</span>
              </Fact>
            )}
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
        <div className="td-files-head">
          <h3>Biriktirilgan fayllar</h3>
          {t.status !== 'CLOSED' && (
            <Upload
              accept={FILE_ACCEPT}
              showUploadList={false}
              multiple
              beforeUpload={(file) => {
                void uploadFile(file);
                return false;
              }}
            >
              <Button size="small" icon={<UploadOutlined />} loading={uploading > 0}>
                Fayl qo'shish
              </Button>
            </Upload>
          )}
        </div>
        {t.attachments.length === 0 ? (
          <span className="td-muted">Fayl biriktirilmagan.</span>
        ) : (
          <ul className="td-list">
            {t.attachments.map((a) => (
              <li key={a.id}>
                <PaperClipOutlined />
                <a className="td-list-main" href={`/api/tickets/${t.id}/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  {a.fileName}
                </a>
                <span className="td-muted">
                  {fileSize(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                  {a.uploadedBy ? ` · ${a.uploadedBy.fullName}` : ''}
                </span>
                <a href={`/api/tickets/${t.id}/attachments/${a.id}?download=1`} aria-label={`${a.fileName}: yuklab olish`}>
                  <DownloadOutlined />
                </a>
                {(a.uploadedBy?.id === user?.id || can(P.TicketsAssign)) && (
                  <Popconfirm title={`${a.fileName} o'chirilsinmi?`} okText="O'chirish" cancelText="Yo'q" onConfirm={() => void removeFile(a.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`${a.fileName}: o'chirish`} />
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
        )}
        <span className="td-muted td-note">PDF, rasm (JPG, PNG), Word, Excel va boshqa hujjatlar · 20 MB gacha · har bir yuklash va ochish audit jurnaliga yoziladi.</span>
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
      {t.smsMessages.length > 0 && (
        <section className="td-section">
          <h3>Fuqaroga SMS</h3>
          {t.smsMessages.map((m) => (
            <div key={m.id} className="td-sms">
              <span className="td-sms-meta">
                <span className="mono">{formatDateTime(m.createdAt)}</span> · <span className="mono">{formatPhone(m.phone)}</span>
                <ToneTag tone={SMS_STATUS[m.status].tone}>{SMS_STATUS[m.status].label}</ToneTag>
              </span>
              <span className="td-text">{m.text}</span>
              {m.error && m.status !== 'DELIVERED' && <span className="td-muted">{m.error}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      width={680}
      className="ticket-drawer"
      extra={
        t && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'pdf', label: 'Murojaat kartasi (PDF)' },
                { key: 'docx', label: 'Javob xati (DOCX)', disabled: !t.answer, title: t.answer ? undefined : 'Javob hali yozilmagan' },
              ],
              onClick: ({ key }) => void exportDoc(key as 'pdf' | 'docx'),
            }}
          >
            <Button icon={<DownloadOutlined />}>Eksport</Button>
          </Dropdown>
        )
      }
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
            {t.aiFlags?.map((f) => (
              <ToneTag key={f} tone={f === 'escalation' ? 'amber' : 'red'}>
                {AI_FLAG_LABELS[f] ?? f}
              </ToneTag>
            ))}
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
              {
                key: 'tasks',
                label: `Vazifalar${tasks.data?.length ? ` (${tasks.data.filter((x) => !x.completedAt).length}/${tasks.data.length})` : ''}`,
                children: <TicketTasks ticketId={t.id} tasks={tasks.data} onChanged={() => void tasks.reload()} />,
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
