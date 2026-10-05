import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Form, InputNumber, Modal, Popconfirm, Select, Switch, Table, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { AutomationSetting, Category, OrgTreeNode, Region, RoutingRuleRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { toTreeSelect } from '../../components/orgTree';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { useAsync } from '../../hooks/useAsync';

interface RuleForm {
  categoryId?: number;
  regionId?: number;
  districtId?: number;
  targetOrgUnitId: number;
  priority: number;
  isActive: boolean;
}

interface MatchQuery {
  categoryId?: number;
  regionId?: number;
  districtId?: number;
}

const ANY = <span className="cell-sub">Istalgan</span>;

/** Yo'naltirish qoidalari (F-CRM-03): toifa va hudud bo'yicha mas'ul bo'linma, jadvalni tekshirish va avtomatik amallar. */
export default function RoutingTab() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [editing, setEditing] = useState<RoutingRuleRow | 'new' | null>(null);
  const [form] = Form.useForm<RuleForm>();
  const [probe, setProbe] = useState<MatchQuery>({});

  const rules = useAsync(() => api.get<RoutingRuleRow[]>('/crm/routing-rules').then((r) => r.data), []);
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
  const treeData = useMemo(() => toTreeSelect(orgTree), [orgTree]);
  const roots = categories.filter((c) => c.parentId === null);
  const match = useAsync(
    () => api.get<RoutingRuleRow | null>('/crm/routing-rules/match', { params: probe }).then((r) => r.data),
    [probe, rules.data],
  );

  const formRegion = Form.useWatch('regionId', form);
  const districtsOf = (regionId?: number) => regions.find((r) => r.id === regionId)?.districts ?? [];

  const open = (rule: RoutingRuleRow | 'new') => {
    setEditing(rule);
    form.setFieldsValue(
      rule === 'new'
        ? { categoryId: undefined, regionId: undefined, districtId: undefined, priority: 100, isActive: true }
        : {
            categoryId: rule.categoryId ?? undefined,
            regionId: rule.regionId ?? undefined,
            districtId: rule.districtId ?? undefined,
            targetOrgUnitId: rule.targetOrgUnitId,
            priority: rule.priority,
            isActive: rule.isActive,
          },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    const body = { ...values, categoryId: values.categoryId ?? null, regionId: values.regionId ?? null, districtId: values.districtId ?? null };
    try {
      if (editing === 'new') await api.post('/crm/routing-rules', body);
      else if (editing) await api.put(`/crm/routing-rules/${editing.id}`, body);
      message.success('Qoida saqlandi');
      setEditing(null);
      void rules.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = async (rule: RoutingRuleRow) => {
    try {
      await api.delete(`/crm/routing-rules/${rule.id}`);
      message.success("Qoida o'chirildi");
      void rules.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const columns: ColumnsType<RoutingRuleRow> = [
    { title: 'Ustuvorlik', dataIndex: 'priority', width: 110, render: (v: number) => <span className="mono">{v}</span> },
    { title: 'Toifa', render: (_, r) => r.category?.nameUz ?? ANY },
    { title: 'Hudud', render: (_, r) => (r.district ? `${r.region?.nameUz ?? ''} · ${r.district.nameUz}` : (r.region?.nameUz ?? ANY)) },
    {
      title: "Mas'ul bo'linma",
      render: (_, r) => (
        <span className="cell-stack">
          <span>{r.targetOrgUnit.name}</span>
          {!r.targetOrgUnit.isActive && <span className="cell-sub cell-danger">bo'linma faol emas</span>}
        </span>
      ),
    },
    { title: 'Holat', width: 110, render: (_, r) => (r.isActive ? <ToneTag tone="green">Faol</ToneTag> : <ToneTag tone="grey">O'chirilgan</ToneTag>) },
    {
      title: <span className="visually-hidden">Amallar</span>,
      width: 96,
      render: (_, r) => (
        <span className="user-actions">
          <Button size="small" type="text" icon={<EditOutlined />} aria-label="Qoidani tahrirlash" onClick={() => open(r)} />
          <Popconfirm title="Qoida o'chirilsinmi?" okText="Ha" cancelText="Yo'q" onConfirm={() => void remove(r)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Qoidani o'chirish" />
          </Popconfirm>
        </span>
      ),
    },
  ];

  const matched = match.data;

  return (
    <div className="routing-layout">
      <div className="routing-main">
        {(rules.error || reference.error) && <Alert type="error" showIcon message={rules.error ?? reference.error} style={{ marginBottom: 16 }} />}
        <Card
          size="small"
          title="Yo'naltirish jadvali"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
              Qoida qo'shish
            </Button>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            rowKey="id"
            size="middle"
            loading={rules.loading}
            columns={columns}
            dataSource={rules.data ?? []}
            pagination={false}
            scroll={{ x: 760 }}
            rowClassName={(r) => (r.isActive ? '' : 'cat-row-off')}
          />
        </Card>
        <p className="page-sub" style={{ marginTop: 8 }}>
          Murojaat yaratilganda mos qoidalardan ustuvorlik raqami eng kichigi tanlanadi; teng bo'lsa, aniqrog'i (tuman → hudud → toifa).
          Mavzu tanlangan murojaat uning toifasi bo'yicha yo'naltiriladi. Mos qoida bo'lmasa, murojaatni supervisor qo'lda yo'naltiradi.
        </p>
      </div>

      <div className="routing-side">
        <Card size="small" title="Jadvalni tekshirish">
          <div className="probe-form">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Toifa yoki mavzu"
              aria-label="Toifa yoki mavzu"
              value={probe.categoryId}
              onChange={(categoryId?: number) => setProbe((p) => ({ ...p, categoryId }))}
              options={roots.map((c) => ({
                label: c.nameUz,
                options: [
                  { value: c.id, label: c.nameUz },
                  ...categories.filter((t) => t.parentId === c.id).map((t) => ({ value: t.id, label: `${t.sortOrder}. ${t.nameUz}` })),
                ],
              }))}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Hudud"
              aria-label="Hudud"
              value={probe.regionId}
              onChange={(regionId?: number) => setProbe((p) => ({ ...p, regionId, districtId: undefined }))}
              options={regions.map((r) => ({ value: r.id, label: r.nameUz }))}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Tuman"
              aria-label="Tuman"
              disabled={!probe.regionId}
              value={probe.districtId}
              onChange={(districtId?: number) => setProbe((p) => ({ ...p, districtId }))}
              options={districtsOf(probe.regionId).map((d) => ({ value: d.id, label: d.nameUz }))}
            />
          </div>
          <div className="probe-result" aria-live="polite">
            {matched ? (
              <>
                <span className="td-label">Murojaat yuboriladi</span>
                <span className="probe-target">{matched.targetOrgUnit.name}</span>
                <span className="cell-sub">
                  Qoida: ustuvorlik {matched.priority} · {matched.category?.nameUz ?? 'istalgan toifa'} ·{' '}
                  {matched.district?.nameUz ?? matched.region?.nameUz ?? 'istalgan hudud'}
                </span>
              </>
            ) : (
              <span className="cell-sub">Mos qoida yo'q — murojaatni supervisor qo'lda yo'naltiradi.</span>
            )}
          </div>
        </Card>
        {can(P.SettingsManage) && <AutomationCard />}
      </div>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Yangi qoida' : 'Qoidani tahrirlash'}
        okText="Saqlash"
        cancelText="Bekor qilish"
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="categoryId" label="Toifa" extra="Bo'sh — istalgan toifa">
            <Select allowClear placeholder="Istalgan" options={roots.map((c) => ({ value: c.id, label: c.nameUz }))} />
          </Form.Item>
          <Form.Item name="regionId" label="Hudud" extra="Bo'sh — istalgan hudud">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Istalgan"
              onChange={() => form.setFieldValue('districtId', undefined)}
              options={regions.map((r) => ({ value: r.id, label: r.nameUz }))}
            />
          </Form.Item>
          <Form.Item name="districtId" label="Tuman">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Istalgan"
              disabled={!formRegion}
              options={districtsOf(formRegion).map((d) => ({ value: d.id, label: d.nameUz }))}
            />
          </Form.Item>
          <Form.Item name="targetOrgUnitId" label="Mas'ul bo'linma" rules={[{ required: true, message: "Bo'linmani tanlang" }]}>
            <TreeSelect showSearch treeNodeFilterProp="title" treeData={treeData} placeholder="Bo'linmani tanlang" />
          </Form.Item>
          <Form.Item name="priority" label="Ustuvorlik" extra="Kichik raqam — yuqori ustuvorlik" rules={[{ required: true }]}>
            <InputNumber min={1} max={100000} />
          </Form.Item>
          <Form.Item name="isActive" label="Faol" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const AUTOMATION_ITEMS: { key: keyof Omit<AutomationSetting, 'duplicateDetection'>; label: string }[] = [
  { key: 'dueSoonReminder', label: "Muddat yaqinlashganda ijrochi va bo'linma rahbariga eslatma (necha kun oldin — Tizim → Sozlamalar)" },
  { key: 'overdueEscalation', label: "Muddat o'tsa yuqori bo'linma, supervisor va bo'linma rahbariga eskalatsiya" },
  { key: 'smsOnCreate', label: 'Murojaat qabul qilinganda fuqaroga SMS (raqami bilan)' },
  { key: 'returnToSupervisor', label: 'Qaytarilgan murojaat supervisor navbatiga tushadi' },
];

/** Murojaatlar bo'yicha avtomatik amallar (settings.automation). */
function AutomationCard() {
  const { message } = App.useApp();
  const setting = useAsync(() => api.get<AutomationSetting>('/crm/automation').then((r) => r.data), []);
  const [draft, setDraft] = useState<AutomationSetting>();
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(setting.data), [setting.data]);
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify(setting.data);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      setting.setData((await api.put<AutomationSetting>('/crm/automation', draft)).data);
      message.success('Avtomatik amallar saqlandi');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card size="small" title="Avtomatik amallar" loading={setting.loading && !draft}>
      {draft && (
        <div className="auto-list">
          {AUTOMATION_ITEMS.map((item) => (
            <label key={item.key} className="setting-row">
              <span>{item.label}</span>
              <Switch size="small" checked={draft[item.key]} onChange={(on) => setDraft({ ...draft, [item.key]: on })} />
            </label>
          ))}
          <div className="setting-row">
            <span>Takroriy murojaatlarni aniqlash</span>
            <Switch
              size="small"
              aria-label="Takroriy murojaatlarni aniqlash"
              checked={draft.duplicateDetection.enabled}
              onChange={(enabled) => setDraft({ ...draft, duplicateDetection: { ...draft.duplicateDetection, enabled } })}
            />
          </div>
          <div className="auto-dup">
            <InputNumber
              size="small"
              min={1}
              max={720}
              disabled={!draft.duplicateDetection.enabled}
              value={draft.duplicateDetection.windowHours}
              aria-label="Oraliq, soat"
              onChange={(v) => v && setDraft({ ...draft, duplicateDetection: { ...draft.duplicateDetection, windowHours: v } })}
            />
            <span>soat ichida bir raqamdan bir mavzuda — asl murojaatga bog'lanadi;</span>
            <InputNumber
              size="small"
              min={2}
              max={100}
              disabled={!draft.duplicateDetection.enabled}
              value={draft.duplicateDetection.minTickets}
              aria-label="Murojaatlar soni"
              onChange={(v) => v && setDraft({ ...draft, duplicateDetection: { ...draft.duplicateDetection, minTickets: v } })}
            />
            <span>tadan oshsa supervisorga xabar</span>
          </div>
          <p className="panel-note">Eslatma va eskalatsiya har 5 daqiqada tekshiriladi (xodimlarga tizim ichida va emailda). SMS — SMS shlyuzi orqali: holati Tizim → Sozlamalar → Integratsiyalar.</p>
          <Button type="primary" block disabled={!changed} loading={saving} onClick={() => void save()}>
            Saqlash
          </Button>
        </div>
      )}
    </Card>
  );
}
