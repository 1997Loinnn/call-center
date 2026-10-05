import { LockOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Empty, Form, Input, InputNumber, Modal, Select, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CategoryAdmin, TicketType } from '../../api/types';
import { TYPE_ORDER, TYPE_SHORT } from '../../constants';
import { formatNumber } from '../../format';
import { useAsync } from '../../hooks/useAsync';

interface NewCategory {
  nameUz: string;
  slaDays: number;
  isConfidential: boolean;
}

const TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: TYPE_SHORT[t] }));

/** Toifalar va mavzular: chapda toifalar, o'ngda tanlangan toifaning mavzulari (operator kartalari). */
export default function CategoriesTab() {
  const { message } = App.useApp();
  const list = useAsync(() => api.get<CategoryAdmin[]>('/crm/categories').then((r) => r.data), []);
  const [selectedId, setSelectedId] = useState<number>();
  const [sla, setSla] = useState<number | null>(null);
  const [topicName, setTopicName] = useState('');
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<NewCategory>();

  const all = list.data ?? [];
  const roots = useMemo(() => all.filter((c) => c.parentId === null), [all]);
  const topicsOf = (id: number) => all.filter((c) => c.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const selected = roots.find((c) => c.id === selectedId) ?? roots[0];
  const topics = selected ? topicsOf(selected.id) : [];

  useEffect(() => setSla(selected?.slaDays ?? null), [selected?.id, selected?.slaDays]);

  /** O'zgarish darhol saqlanadi; toifa muddati va maxfiyligi mavzularga ham o'tgani uchun ro'yxat qayta yuklanadi. */
  const patch = async (item: CategoryAdmin, body: Partial<CategoryAdmin>, success = 'Saqlandi') => {
    try {
      const { data } = await api.patch<CategoryAdmin>(`/crm/categories/${item.id}`, body);
      if (item.parentId === null && ('slaDays' in body || 'isConfidential' in body)) {
        await list.reload();
      } else {
        list.setData((rows) => rows?.map((r) => (r.id === item.id ? { ...r, ...data } : r)));
      }
      message.success(success);
    } catch (err) {
      message.error(errorMessage(err));
      void list.reload();
    }
  };

  const addTopic = async () => {
    if (!selected || !topicName.trim()) return;
    setAdding(true);
    try {
      const { data } = await api.post<CategoryAdmin>('/crm/categories', { nameUz: topicName.trim(), parentId: selected.id });
      list.setData((rows) => [...(rows ?? []), data]);
      setTopicName('');
      message.success(`Mavzu ${data.sortOrder} qo'shildi`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const createCategory = async () => {
    const values = await form.validateFields();
    try {
      const { data } = await api.post<CategoryAdmin>('/crm/categories', values);
      list.setData((rows) => [...(rows ?? []), data]);
      setSelectedId(data.id);
      setCreating(false);
      form.resetFields();
      message.success('Toifa yaratildi');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const saveSla = () => {
    if (selected && sla && sla !== selected.slaDays) void patch(selected, { slaDays: sla }, `Ijro muddati: ${sla} kun`);
  };

  const columns: ColumnsType<CategoryAdmin> = [
    { title: '№', dataIndex: 'sortOrder', width: 64, render: (n: number) => <span className="mono">{n}</span> },
    {
      title: 'Mavzu',
      render: (_, t) => (
        <Typography.Text
          className={t.isActive ? undefined : 'cat-muted'}
          editable={{
            tooltip: 'Nomini tahrirlash',
            onChange: (nameUz) => nameUz.trim() && nameUz.trim() !== t.nameUz && void patch(t, { nameUz: nameUz.trim() }),
          }}
        >
          {t.nameUz}
        </Typography.Text>
      ),
    },
    {
      title: 'Murojaat turlari',
      width: 300,
      render: (_, t) => (
        <Select<TicketType[]>
          mode="multiple"
          size="small"
          variant="borderless"
          className="cat-types"
          aria-label={`${t.nameUz}: murojaat turlari`}
          placeholder="Barcha turlar"
          value={t.ticketTypes}
          options={TYPE_OPTIONS}
          onChange={(ticketTypes) => void patch(t, { ticketTypes })}
          tagRender={({ label, closable, onClose }) => (
            <Tag className="cat-type-tag" closable={closable} onClose={onClose}>
              {label}
            </Tag>
          )}
        />
      ),
    },
    {
      title: 'Faol',
      dataIndex: 'isActive',
      width: 70,
      align: 'center',
      render: (active: boolean, t) => (
        <Checkbox
          checked={active}
          aria-label={`${t.nameUz}: faol`}
          onChange={(e) => void patch(t, { isActive: e.target.checked }, e.target.checked ? 'Mavzu faollashtirildi' : "Mavzu o'chirildi — eski murojaatlarda saqlanib qoladi")}
        />
      ),
    },
  ];

  if (list.loading && !list.data) return <Skeleton active />;

  return (
    <>
      {list.error && <Alert type="error" message={list.error} showIcon style={{ marginBottom: 16 }} />}
      <div className="crm-grid">
        <Card
          size="small"
          title="Toifalar"
          className="cat-list"
          extra={
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Toifa
            </Button>
          }
        >
          {roots.map((c) => {
            const count = topicsOf(c.id).filter((t) => t.isActive).length;
            return (
              <button
                key={c.id}
                type="button"
                className={`cat-item${c.id === selected?.id ? ' is-selected' : ''}${c.isActive ? '' : ' is-inactive'}`}
                aria-pressed={c.id === selected?.id}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="cat-item-text">
                  <span className="cat-item-name">{c.nameUz}</span>
                  <span className="cat-item-sub">
                    {count} ta mavzu · {c.slaDays} kun
                  </span>
                </span>
                {c.isConfidential && <span className="cat-secret">maxfiy</span>}
                {!c.isActive && <Tag className="cat-off">nofaol</Tag>}
              </button>
            );
          })}
        </Card>

        {selected ? (
          <Card size="small" className="cat-detail">
            <div className="cat-head">
              <Typography.Title
                level={5}
                className="cat-title"
                editable={{
                  tooltip: 'Toifa nomini tahrirlash',
                  onChange: (nameUz) => nameUz.trim() && nameUz.trim() !== selected.nameUz && void patch(selected, { nameUz: nameUz.trim() }),
                }}
              >
                {selected.nameUz}
              </Typography.Title>
              <div className="cat-controls">
                <label className="cat-sla">
                  <span>Ijro muddati</span>
                  <InputNumber
                    min={1}
                    max={365}
                    value={sla}
                    className="mono"
                    style={{ width: 72 }}
                    aria-label="Ijro muddati, kun"
                    onChange={setSla}
                    onBlur={saveSla}
                    onPressEnter={saveSla}
                  />
                  <span>kun</span>
                </label>
                <Checkbox
                  checked={selected.isConfidential}
                  onChange={(e) => void patch(selected, { isConfidential: e.target.checked }, e.target.checked ? 'Toifa maxfiy qilindi' : 'Maxfiylik olib tashlandi')}
                >
                  <LockOutlined /> Maxfiy
                </Checkbox>
                <Checkbox
                  checked={selected.isActive}
                  onChange={(e) => void patch(selected, { isActive: e.target.checked }, e.target.checked ? 'Toifa faollashtirildi' : "Toifa o'chirildi: mavzulari operator kartalarida chiqmaydi")}
                >
                  Faol
                </Checkbox>
              </div>
            </div>
            {selected.isConfidential && (
              <Alert
                type="info"
                showIcon
                className="cat-note-alert"
                message="Maxfiy toifa: murojaatlar faqat «Maxfiy murojaatlar» huquqi borlarga ko'rinadi va yaratilgan zahoti yo'naltiriladi."
              />
            )}
            <Table
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={topics}
              pagination={false}
              rowClassName={(t) => (t.isActive ? '' : 'cat-row-off')}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bu toifada hali mavzu yo'q" /> }}
            />
            <div className="cat-add">
              <Input
                placeholder="Yangi mavzu matni"
                aria-label="Yangi mavzu matni"
                maxLength={200}
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                onPressEnter={() => void addTopic()}
              />
              <Button type="primary" disabled={!topicName.trim()} loading={adding} onClick={() => void addTopic()}>
                Mavzu qo'shish
              </Button>
            </div>
            <p className="page-sub cat-note">
              Mavzu raqami operator panelidagi kartada ko'rinadi va hisobotlarda ishlatiladi. Murojaat turlari bo'sh bo'lsa, mavzu barcha
              turlarda chiqadi. O'chirilgan mavzu eski murojaatlarda saqlanib qoladi
              {topics.length > 0 && ` · bu toifada jami ${formatNumber(topics.reduce((sum, t) => sum + t.ticketCount, 0))} ta murojaat`}.
            </p>
          </Card>
        ) : (
          <Card size="small">
            <Empty description="Toifa yo'q" />
          </Card>
        )}
      </div>

      <Modal
        open={creating}
        title="Yangi toifa"
        okText="Yaratish"
        cancelText="Bekor qilish"
        onOk={() => void createCategory()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false} initialValues={{ slaDays: 15, isConfidential: false }}>
          <Form.Item name="nameUz" label="Nomi" rules={[{ required: true, whitespace: true, message: 'Nomini kiriting' }]}>
            <Input maxLength={200} autoFocus />
          </Form.Item>
          <Form.Item name="slaDays" label="Ijro muddati, kun" rules={[{ required: true }]}>
            <InputNumber min={1} max={365} />
          </Form.Item>
          <Form.Item name="isConfidential" valuePropName="checked">
            <Checkbox>Maxfiy toifa (masalan, korrupsiya xabarlari)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
