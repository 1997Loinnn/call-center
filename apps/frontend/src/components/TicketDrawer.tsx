import { WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Popconfirm, Skeleton, Space, Tag, Timeline, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api/client';
import type { TicketDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CHANNEL_LABELS, EVENT_LABELS, P, STATUS_META, TYPE_LABELS } from '../constants';
import { formatDateTime, isOverdue } from '../format';
import { useAsync } from '../hooks/useAsync';
import ActionModal, { type ActionKind } from './ActionModal';
import StatusTag from './StatusTag';

/** Murojaat kartasi: ma'lumotlar, holatlar tarixi (F-CRM-09) va holatga mos amallar. */
export default function TicketDrawer({ id, onClose, onChanged }: {
  id: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, can } = useAuth();
  const { message } = App.useApp();
  const [action, setAction] = useState<ActionKind | null>(null);
  const { data: t, loading, error, reload } = useAsync(
    () => (id ? api.get<TicketDetail>(`/tickets/${id}`).then((r) => r.data) : Promise.resolve(undefined)),
    [id],
  );

  const done = () => {
    setAction(null);
    void reload();
    onChanged();
  };

  const approve = async () => {
    try {
      await api.post(`/tickets/${id}/approve`);
      message.success('Murojaat yopildi');
      done();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const actions: ReactNode[] = [];
  if (t) {
    const isAssignee = t.assigneeId === user?.id;
    if ((t.status === 'NEW' || t.status === 'RETURNED') && can(P.TicketsRoute)) {
      actions.push(<Button key="route" type="primary" onClick={() => setAction('route')}>Yo'naltirish</Button>);
    }
    if (t.status === 'ROUTED' && can(P.TicketsAssign)) {
      actions.push(<Button key="assign" type="primary" onClick={() => setAction('assign')}>Ijrochiga berish</Button>);
      actions.push(<Button key="return" onClick={() => setAction('return')}>Qaytarish</Button>);
    }
    if (t.status === 'IN_PROGRESS' && can(P.TicketsAnswer) && (isAssignee || can(P.TicketsAssign))) {
      actions.push(<Button key="answer" type="primary" onClick={() => setAction('answer')}>Javob yozish</Button>);
    }
    if (t.status === 'ANSWERED' && can(P.TicketsApprove)) {
      actions.push(
        <Popconfirm key="approve" title="Javob tasdiqlansinmi va murojaat yopilsinmi?" okText="Ha" cancelText="Yo'q" onConfirm={approve}>
          <Button type="primary">Tasdiqlash</Button>
        </Popconfirm>,
      );
      actions.push(<Button key="reject" danger onClick={() => setAction('reject')}>Rad etish</Button>);
    }
    if (t.status === 'CLOSED' && can(P.TicketsReopen) && t.assigneeId) {
      actions.push(<Button key="reopen" onClick={() => setAction('reopen')}>Qayta ochish</Button>);
    }
    actions.push(<Button key="comment" onClick={() => setAction('comment')}>Izoh</Button>);
  }

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      width={760}
      title={t ? <Space>{t.number}<StatusTag status={t.status} /></Space> : 'Murojaat'}
      extra={<Space wrap>{actions}</Space>}
    >
      {error && <Alert type="error" message={error} showIcon />}
      {loading && !t ? (
        <Skeleton active />
      ) : t ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Mavzu" span={2}>{t.subject}</Descriptions.Item>
            <Descriptions.Item label="Turi">
              {TYPE_LABELS[t.type]}
              {t.isConfidential && <Tag color="red" style={{ marginLeft: 8 }}>Maxfiy</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Kanal">{CHANNEL_LABELS[t.channel]}</Descriptions.Item>
            <Descriptions.Item label="Toifa">{t.category?.nameUz ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Hudud">
              {[t.region?.nameUz, t.district?.nameUz].filter(Boolean).join(', ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Fuqaro">
              {t.isAnonymous && !t.citizen ? 'Anonim' : t.citizen ? `${t.citizen.fullName ?? ''} ${t.citizen.phone}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Kadastr / ariza raqami">
              {[t.cadastreNumber, t.applicationNumber].filter(Boolean).join(' / ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Mas'ul bo'linma">{t.assignedOrgUnit?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Ijrochi">{t.assignee?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Qabul qildi">{t.createdBy?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Ijro muddati">
              {isOverdue(t.dueAt, t.status) ? (
                <Typography.Text type="danger"><WarningOutlined /> {formatDateTime(t.dueAt)} (o'tgan)</Typography.Text>
              ) : (
                formatDateTime(t.dueAt)
              )}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>Mazmuni</Typography.Title>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{t.description}</Typography.Paragraph>
          </div>

          {t.answer && (
            <Alert
              type={t.status === 'CLOSED' ? 'success' : 'info'}
              message={`Javob${t.answeredAt ? ` · ${formatDateTime(t.answeredAt)}` : ''}`}
              description={<span style={{ whiteSpace: 'pre-wrap' }}>{t.answer}</span>}
            />
          )}

          <div>
            <Typography.Title level={5}>Tarix</Typography.Title>
            <Timeline
              items={t.events.map((e) => ({
                color: e.toStatus ? STATUS_META[e.toStatus].color : 'gray',
                children: (
                  <>
                    <Typography.Text strong>{EVENT_LABELS[e.type] ?? e.type}</Typography.Text>
                    {e.orgUnit && <> → {e.orgUnit.name}</>}
                    <div>
                      <Typography.Text type="secondary">
                        {formatDateTime(e.createdAt)}{e.actor ? ` · ${e.actor.fullName}` : ''}
                      </Typography.Text>
                    </div>
                    {e.comment && <div style={{ whiteSpace: 'pre-wrap' }}>{e.comment}</div>}
                  </>
                ),
              }))}
            />
          </div>
        </Space>
      ) : null}

      <ActionModal kind={action} ticket={t} onCancel={() => setAction(null)} onDone={done} />
    </Drawer>
  );
}
