import { DeleteOutlined, LockOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Select, Skeleton, Switch, Table, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { QueueAgent, QueueDetail } from '../../api/types';
import ToneTag from '../../components/ToneTag';
import { formatClock } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import type { IvrTabProps } from './IvrPage';
import { LANGUAGE_LABELS, PENALTY_LABELS, STRATEGY_LABELS } from './ivr-labels';

type QueueForm = Omit<QueueDetail, 'id' | 'members' | 'ivr' | 'live'>;

const DEFAULTS: QueueForm = {
  pbxNumber: '',
  name: '',
  description: null,
  language: 'uz',
  isActive: true,
  strategy: 'longest_idle',
  maxWaitSeconds: 120,
  callbackEnabled: true,
  announcePosition: true,
  announceEverySeconds: 45,
  musicOnHold: 'default',
  wrapUpSeconds: 15,
  isRestricted: false,
};

/** Navbatlar (F-TEL-03..05): taqsimlash qoidasi, kutish va callback chegarasi, operatorlar (til va yo'nalish ko'nikmasi). */
export default function QueuesTab({ canEdit, reload }: IvrTabProps) {
  const queues = useAsync(() => api.get<QueueDetail[]>('/ivr/queues').then((r) => r.data), []);
  const [editing, setEditing] = useState<QueueDetail | 'new' | null>(null);

  const rows = queues.data ?? [];
  if (queues.error) return <Alert type="error" showIcon message={queues.error} />;

  const onSaved = async () => {
    await queues.reload();
    await reload();
  };

  return (
    <>
      <Card
        size="small"
        title="Navbatlar"
        extra={
          canEdit && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Navbat
            </Button>
          )
        }
      >
        <Table<QueueDetail>
          rowKey="id"
          size="small"
          loading={queues.loading}
          pagination={false}
          dataSource={rows}
          scroll={{ x: 900 }}
          onRow={(q) => ({ onClick: () => setEditing(q), className: 'clickable-row' })}
          columns={[
            { title: 'Raqam', dataIndex: 'pbxNumber', width: 80, render: (v: string) => <span className="mono cell-strong">{v}</span> },
            {
              title: 'Navbat',
              render: (_, q) => (
                <span className="cell-stack">
                  <span className="cell-strong">
                    {q.isRestricted && (
                      <Tooltip title="Cheklangan: faqat biriktirilgan operatorlar">
                        <LockOutlined aria-label="Cheklangan" />{' '}
                      </Tooltip>
                    )}
                    {q.name}
                  </span>
                  <span className="cell-sub">{q.ivr.length > 0 ? `IVR: ${q.ivr.join(', ')}` : (q.description ?? 'IVR menyusida ishlatilmaydi')}</span>
                </span>
              ),
            },
            { title: 'Til', dataIndex: 'language', width: 80, render: (v: string | null) => (v ? (LANGUAGE_LABELS[v] ?? v) : '—') },
            { title: 'Taqsimlash', dataIndex: 'strategy', width: 200, render: (v: string) => <span className="cell-sub">{STRATEGY_LABELS[v] ?? v}</span> },
            {
              title: 'Operatorlar',
              width: 130,
              render: (_, q) => {
                const active = q.members.filter((m) => m.isActive && m.sipExtension);
                const main = active.filter((m) => m.penalty === 0).length;
                return active.length === 0 ? (
                  <ToneTag tone="red">Operator yo'q</ToneTag>
                ) : (
                  <span className="cell-stack">
                    <span className="mono">
                      <TeamOutlined /> {active.length}
                    </span>
                    <span className="cell-sub">{main} asosiy</span>
                  </span>
                );
              },
            },
            {
              title: 'Kutish',
              width: 150,
              render: (_, q) => (
                <span className="cell-stack">
                  <span className="cell-sub">Callback: {q.callbackEnabled ? `${q.maxWaitSeconds} s dan keyin` : "yo'q"}</span>
                  <span className="cell-sub">O'rnini aytish: {q.announcePosition ? `har ${q.announceEverySeconds} s` : "yo'q"}</span>
                </span>
              ),
            },
            {
              title: 'Hozir',
              width: 110,
              render: (_, q) =>
                q.live === null ? (
                  <span className="cell-sub">—</span>
                ) : q.live.waiting === 0 ? (
                  <span className="cell-sub">Bo'sh</span>
                ) : (
                  <span className="cell-stack">
                    <span className="mono cell-strong">{q.live.waiting} kutmoqda</span>
                    <span className="cell-sub mono">eng uzoq {formatClock(q.live.longestWait)}</span>
                  </span>
                ),
            },
            { title: 'Holat', width: 100, render: (_, q) => (q.isActive ? <ToneTag tone="green">Faol</ToneTag> : <ToneTag tone="grey">O'chiq</ToneTag>) },
          ]}
        />
        <p className="panel-note">
          Qo'ng'iroq navbatdagi eng uzoq bo'sh turgan operatorga beriladi; avval «Asosiy» operatorlar, ular band bo'lsa — zaxiradagilar. Rus tilidagi navbatga rus tilini biladigan operatorlarni biriktiring.
        </p>
      </Card>
      {editing && <QueueDrawer queue={editing === 'new' ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </>
  );
}

function QueueDrawer({ queue, canEdit, onClose, onSaved }: { queue: QueueDetail | null; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<QueueForm>();
  const [members, setMembers] = useState<{ userId: number; penalty: number }[]>(queue?.members.map((m) => ({ userId: m.userId, penalty: m.penalty })) ?? []);
  const [membersDirty, setMembersDirty] = useState(false);
  const [saving, setSaving] = useState<'queue' | 'members' | null>(null);
  const agents = useAsync(() => api.get<QueueAgent[]>('/ivr/agents').then((r) => r.data), []);
  const callback = Form.useWatch('callbackEnabled', form);
  const announce = Form.useWatch('announcePosition', form);

  useEffect(() => {
    form.setFieldsValue(queue ? { ...DEFAULTS, ...queue } : DEFAULTS);
  }, [queue, form]);

  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);
  const language = Form.useWatch('language', form) as string | null;

  const saveQueue = async () => {
    const values = await form.validateFields();
    setSaving('queue');
    try {
      const body = { ...values, description: values.description?.trim() || null };
      if (queue) await api.put(`/ivr/queues/${queue.id}`, body);
      else await api.post('/ivr/queues', body);
      message.success('Navbat saqlandi');
      await onSaved();
      if (!queue) onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const saveMembers = async () => {
    if (!queue) return;
    setSaving('members');
    try {
      await api.put(`/ivr/queues/${queue.id}/members`, { members });
      setMembersDirty(false);
      message.success("Operatorlar ro'yxati saqlandi");
      await onSaved();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const setPenalty = (userId: number, penalty: number) => {
    setMembers((list) => list.map((m) => (m.userId === userId ? { ...m, penalty } : m)));
    setMembersDirty(true);
  };

  const candidates = (agents.data ?? [])
    .filter((a) => !members.some((m) => m.userId === a.id))
    // Til ko'nikmasi mos keladiganlar yuqorida
    .sort((a, b) => Number(!!language && b.languages.includes(language)) - Number(!!language && a.languages.includes(language)));

  return (
    <Drawer
      open
      width={640}
      onClose={onClose}
      title={queue ? `${queue.pbxNumber} · ${queue.name}` : 'Yangi navbat'}
      extra={
        canEdit && (
          <Button type="primary" loading={saving === 'queue'} onClick={() => void saveQueue()}>
            Saqlash
          </Button>
        )
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} disabled={!canEdit}>
        <div className="form-row">
          <Form.Item name="pbxNumber" label="Raqam (UCM6510)" rules={[{ required: true, pattern: /^\d{3,6}$/, message: '3–6 xonali son' }]} style={{ flex: 1 }}>
            <Input className="mono" maxLength={6} />
          </Form.Item>
          <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true }]} style={{ flex: 2 }}>
            <Input maxLength={120} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Tavsif">
          <Input maxLength={500} />
        </Form.Item>
        <div className="form-row">
          <Form.Item name="language" label="Til ko'nikmasi" style={{ flex: 1 }}>
            <Select allowClear options={Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="strategy" label="Taqsimlash" style={{ flex: 2 }}>
            <Select options={Object.entries(STRATEGY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </div>
        <div className="form-row">
          <Form.Item name="callbackEnabled" label="Qayta qo'ng'iroq taklifi" valuePropName="checked" style={{ flex: 1 }}>
            <Switch />
          </Form.Item>
          <Form.Item name="maxWaitSeconds" label="Shundan keyin, s" style={{ flex: 1 }}>
            <InputNumber min={15} max={1800} disabled={!callback || !canEdit} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="form-row">
          <Form.Item name="announcePosition" label="Navbatdagi o'rnini aytish" valuePropName="checked" style={{ flex: 1 }}>
            <Switch />
          </Form.Item>
          <Form.Item name="announceEverySeconds" label="Har necha soniyada" style={{ flex: 1 }}>
            <InputNumber min={15} max={300} disabled={!announce || !canEdit} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="form-row">
          <Form.Item name="musicOnHold" label="Kutish musiqasi (UCM klassi)" rules={[{ required: true, pattern: /^[a-z0-9_-]{1,64}$/, message: 'Lotin harflari va raqamlar' }]} style={{ flex: 1 }}>
            <Input className="mono" />
          </Form.Item>
          <Form.Item name="wrapUpSeconds" label="Qo'ng'iroqdan keyingi ish, s" style={{ flex: 1 }}>
            <InputNumber min={0} max={300} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="form-row">
          <Form.Item name="isRestricted" label="Cheklangan navbat" valuePropName="checked" extra="Masalan, korrupsiya xabarlari: faqat vakolatli operatorlar" style={{ flex: 1 }}>
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="Faol" valuePropName="checked" style={{ flex: 1 }}>
            <Switch />
          </Form.Item>
        </div>
      </Form>

      {queue && (
        <Card
          size="small"
          title={`Operatorlar (${members.length})`}
          extra={
            canEdit && (
              <Button size="small" type="primary" disabled={!membersDirty} loading={saving === 'members'} onClick={() => void saveMembers()}>
                Saqlash
              </Button>
            )
          }
        >
          {agents.loading && !agents.data ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : (
            <>
              {canEdit && (
                <Select
                  showSearch
                  value={null}
                  placeholder="Operator qo'shish…"
                  optionFilterProp="label"
                  style={{ width: '100%', marginBottom: 12 }}
                  suffixIcon={<PlusOutlined />}
                  options={candidates.map((a) => ({
                    value: a.id,
                    label: `${a.fullName}${a.sipExtension ? ` · SIP ${a.sipExtension}` : ' · SIP yo\'q'} · ${a.languages.map((l) => LANGUAGE_LABELS[l] ?? l).join('/')}`,
                  }))}
                  onChange={(id: number) => {
                    setMembers((list) => [...list, { userId: id, penalty: 0 }]);
                    setMembersDirty(true);
                  }}
                />
              )}
              <Table
                rowKey="userId"
                size="small"
                pagination={false}
                dataSource={[...members].sort((a, b) => a.penalty - b.penalty)}
                locale={{ emptyText: "Operator biriktirilmagan: navbatga tushgan qo'ng'iroqqa hech kim javob bermaydi" }}
                columns={[
                  {
                    title: 'Operator',
                    render: (_, m) => {
                      const agent = byId.get(m.userId) ?? queue.members.find((x) => x.userId === m.userId);
                      const sip = agent?.sipExtension;
                      return (
                        <span className="cell-stack">
                          <span className="cell-strong">{agent?.fullName ?? `#${m.userId}`}</span>
                          <span className="cell-sub">
                            {sip ? <span className="mono">SIP {sip}</span> : <span className="cell-sub-danger">SIP raqam yo'q — PBX'ga o'tmaydi</span>}
                            {agent?.languages?.length ? ` · ${agent.languages.map((l) => LANGUAGE_LABELS[l] ?? l).join('/')}` : ''}
                          </span>
                        </span>
                      );
                    },
                  },
                  {
                    title: 'Ustuvorlik',
                    width: 140,
                    render: (_, m) => (
                      <Select
                        size="small"
                        value={m.penalty}
                        disabled={!canEdit}
                        style={{ width: 120 }}
                        options={PENALTY_LABELS.map((label, value) => ({ value, label }))}
                        onChange={(v: number) => setPenalty(m.userId, v)}
                      />
                    ),
                  },
                  {
                    title: <span className="visually-hidden">Amallar</span>,
                    width: 44,
                    render: (_, m) =>
                      canEdit && (
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label="Navbatdan chiqarish"
                          onClick={() => {
                            setMembers((list) => list.filter((x) => x.userId !== m.userId));
                            setMembersDirty(true);
                          }}
                        />
                      ),
                  },
                ]}
              />
            </>
          )}
        </Card>
      )}
    </Drawer>
  );
}
