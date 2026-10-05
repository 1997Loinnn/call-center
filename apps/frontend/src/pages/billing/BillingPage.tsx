import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Segmented,
  Select,
  Statistic,
  Switch,
  Table,
  Tooltip,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { BillingSummary, CostLimitRow, LimitTargets, TariffDirection, TariffRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { formatDate, formatNumber } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import type { Tone } from '../../theme';
import './billing.css';

type TabKey = 'spend' | 'limits' | 'tariffs';

const DIRECTIONS: { value: TariffDirection; label: string }[] = [
  { value: 'MOBILE', label: 'Mobil' },
  { value: 'LOCAL', label: 'Shahar' },
  { value: 'LONG_DISTANCE', label: 'Shaharlararo' },
  { value: 'INTERNATIONAL', label: 'Xalqaro' },
  { value: 'INBOUND', label: 'Kiruvchi 1097' },
];
const DIRECTION_LABEL = Object.fromEntries(DIRECTIONS.map((d) => [d.value, d.label])) as Record<TariffDirection, string>;

const LEVEL: Record<0 | 1 | 2, { tone: Tone; label: string }> = {
  0: { tone: 'green', label: "Me'yorda" },
  1: { tone: 'amber', label: 'Chegaraga yaqin' },
  2: { tone: 'red', label: 'Limit tugadi' },
};

const som = (v: number) => `${formatNumber(Math.round(v))} so'm`;

/**
 * Telefoniya → Tariflar va xarajatlar (F-BIL-01..05): chiquvchi qo'ng'iroqlar oylik xarajati yo'nalish, bo'linma
 * va operator kesimida, oylik limitlar va tariflar jadvali. Tahrirlash — sozlamalar huquqi bilan.
 */
export default function BillingPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can(P.SettingsManage);
  const [tab, setTab] = useState<TabKey>('spend');
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [recalculating, setRecalculating] = useState(false);
  const monthKey = month.format('YYYY-MM');

  const summary = useAsync(() => api.get<BillingSummary>('/billing/summary', { params: { month: monthKey } }).then((r) => r.data), [monthKey]);
  const limits = useAsync(() => api.get<CostLimitRow[]>('/billing/limits', { params: { month: monthKey } }).then((r) => r.data), [monthKey]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const res = await api.post<{ calls: number; charged: number; total: number }>('/billing/recalculate', { month: monthKey });
      message.success(`${formatNumber(res.data.calls)} ta chiquvchi qo'ng'iroq qayta narxlandi · jami ${som(res.data.total)}`);
      await Promise.all([summary.reload(), limits.reload()]);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tariflar va xarajatlar</h1>
          <span className="page-sub">Chiquvchi qo'ng'iroqlar operator ichki raqamidan, tarif jadvali bo'yicha yakunlangan zahoti narxlanadi · kiruvchi 1097 bepul</span>
        </div>
        <div className="billing-actions">
          <DatePicker
            picker="month"
            value={month}
            allowClear={false}
            format="MMMM YYYY"
            disabledDate={(d) => d.isAfter(dayjs(), 'month')}
            onChange={(v) => v && setMonth(v.startOf('month'))}
            aria-label="Oy"
          />
          {canEdit && (
            <Popconfirm
              title="Oyni qayta hisoblash"
              description="Shu oyning barcha chiquvchi qo'ng'iroqlari joriy tariflar bilan qayta narxlanadi."
              okText="Hisoblash"
              cancelText="Bekor"
              onConfirm={() => void recalculate()}
            >
              <Button icon={<ReloadOutlined />} loading={recalculating}>
                Qayta hisoblash
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>

      <Segmented<TabKey>
        className="billing-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spend', label: 'Xarajatlar' },
          {
            value: 'limits',
            label: (
              <span>
                Limitlar
                {(limits.data ?? []).some((l) => l.level > 0) && <WarningOutlined className="billing-tab-warn" aria-label="ogohlantirish bor" />}
              </span>
            ),
          },
          { value: 'tariffs', label: 'Tariflar' },
        ]}
      />

      {tab === 'spend' && <SpendTab summary={summary.data} loading={summary.loading} error={summary.error} onTariffs={() => setTab('tariffs')} />}
      {tab === 'limits' && <LimitsTab rows={limits.data} loading={limits.loading} error={limits.error} canEdit={canEdit} reload={limits.reload} month={month} />}
      {tab === 'tariffs' && <TariffsTab canEdit={canEdit} />}
    </>
  );
}

// ───────────── Xarajatlar ─────────────

function ShareBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <span className="share-bar" aria-hidden>
      <span style={{ width: `${width}%` }} />
    </span>
  );
}

function SpendTab({ summary, loading, error, onTariffs }: { summary: BillingSummary | undefined; loading: boolean; error: string | null | undefined; onTariffs: () => void }) {
  const d = summary;
  const minutes = d?.directions.reduce((s, r) => s + r.minutes, 0) ?? 0;
  const maxDirection = Math.max(0, ...(d?.directions.map((r) => r.amount) ?? []));
  const maxUnit = Math.max(0, ...(d?.units.map((r) => r.amount) ?? []));

  return (
    <>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {!!d?.uncharged && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${formatNumber(d.uncharged)} ta javob berilgan chiquvchi qo'ng'iroq uchun mos tarif topilmadi`}
          description="Bunday qo'ng'iroqlar xarajatga kirmaydi. Tariflar jadvaliga prefiks qo'shib, oyni qayta hisoblang."
          action={<Button size="small" onClick={onTariffs}>Tariflar</Button>}
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card size="small"><Statistic title="Jami xarajat" value={d ? som(d.total) : '—'} valueStyle={{ fontWeight: 600 }} /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small"><Statistic title="Narxlangan qo'ng'iroqlar" value={d?.calls ?? 0} valueStyle={{ fontWeight: 600 }} /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small"><Statistic title="Tariflangan daqiqalar" value={minutes} valueStyle={{ fontWeight: 600 }} /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic title="O'rtacha qo'ng'iroq narxi" value={d && d.calls > 0 ? som(d.total / d.calls) : '—'} valueStyle={{ fontWeight: 600 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card size="small" title="Yo'nalishlar bo'yicha">
            <Table
              size="small"
              rowKey="direction"
              pagination={false}
              loading={loading && !d}
              dataSource={d?.directions ?? []}
              columns={[
                { title: "Yo'nalish", dataIndex: 'label' },
                { title: "Qo'ng'iroq", dataIndex: 'calls', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
                { title: 'Daqiqa', dataIndex: 'minutes', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
                { title: 'Summa', dataIndex: 'amount', align: 'right', className: 'num', render: (v: number) => (v > 0 ? som(v) : '—') },
                { title: 'Ulush', key: 'share', width: 140, render: (_, r) => <ShareBar value={r.amount} max={maxDirection} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="Bo'linmalar bo'yicha">
            <Table
              size="small"
              rowKey={(r) => r.orgUnitId ?? 0}
              pagination={false}
              loading={loading && !d}
              dataSource={d?.units ?? []}
              locale={{ emptyText: "Bu oyda chiquvchi qo'ng'iroqlar yo'q" }}
              columns={[
                { title: "Bo'linma", dataIndex: 'name' },
                { title: "Qo'ng'iroq", dataIndex: 'calls', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
                { title: 'Daqiqa', dataIndex: 'minutes', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
                { title: 'Summa', dataIndex: 'amount', align: 'right', className: 'num', render: (v: number) => som(v) },
                { title: 'Ulush', key: 'share', width: 140, render: (_, r) => <ShareBar value={r.amount} max={maxUnit} /> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Operatorlar bo'yicha" extra={<span className="card-sub">eng ko'p xarajat qilgan 20 nafar</span>} style={{ marginTop: 16 }}>
        <Table
          size="small"
          rowKey={(r) => r.userId ?? 0}
          pagination={false}
          loading={loading && !d}
          dataSource={d?.operators ?? []}
          scroll={{ x: 560 }}
          locale={{ emptyText: "Bu oyda chiquvchi qo'ng'iroqlar yo'q" }}
          columns={[
            { title: 'Operator', dataIndex: 'fullName' },
            { title: 'SIP', dataIndex: 'sipExtension', className: 'mono', render: (v: string | null) => v ?? '—' },
            { title: "Qo'ng'iroq", dataIndex: 'calls', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
            { title: 'Daqiqa', dataIndex: 'minutes', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
            { title: 'Summa', dataIndex: 'amount', align: 'right', className: 'num', render: (v: number) => som(v) },
          ]}
        />
      </Card>
    </>
  );
}

// ───────────── Limitlar ─────────────

interface LimitForm {
  kind: 'unit' | 'user';
  orgUnitId?: number;
  userId?: number;
  monthlyAmount: number;
  warnPercent: number;
  isActive: boolean;
}

function LimitsTab({ rows, loading, error, canEdit, reload, month }: {
  rows: CostLimitRow[] | undefined;
  loading: boolean;
  error: string | null | undefined;
  canEdit: boolean;
  reload: () => Promise<unknown>;
  month: Dayjs;
}) {
  const { message } = App.useApp();
  const [editing, setEditing] = useState<CostLimitRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<LimitForm>();
  const kind = Form.useWatch('kind', form);
  const targets = useAsync(() => (canEdit && editing ? api.get<LimitTargets>('/billing/limits/targets').then((r) => r.data) : Promise.resolve(undefined)), [canEdit, !!editing]);

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue(
      editing === 'new'
        ? { kind: 'unit', orgUnitId: undefined, userId: undefined, monthlyAmount: 1_000_000, warnPercent: 80, isActive: true }
        : {
            kind: editing.user ? 'user' : 'unit',
            orgUnitId: editing.orgUnit?.id,
            userId: editing.user?.id,
            monthlyAmount: editing.monthlyAmount,
            warnPercent: editing.warnPercent,
            isActive: editing.isActive,
          },
    );
  }, [editing, form]);

  const save = async () => {
    const v = await form.validateFields();
    const body = {
      orgUnitId: v.kind === 'unit' ? v.orgUnitId : null,
      userId: v.kind === 'user' ? v.userId : null,
      monthlyAmount: v.monthlyAmount,
      warnPercent: v.warnPercent,
      isActive: v.isActive,
    };
    setSaving(true);
    try {
      if (editing === 'new') await api.post('/billing/limits', body);
      else if (editing) await api.put(`/billing/limits/${editing.id}`, body);
      setEditing(null);
      message.success('Limit saqlandi');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CostLimitRow) => {
    try {
      await api.delete(`/billing/limits/${row.id}`);
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const current = month.isSame(dayjs(), 'month');

  return (
    <Card
      size="small"
      title={
        <>
          Oylik xarajat limitlari
          <span className="card-sub">{month.format('MMMM YYYY')} · bo'linma limiti quyi bo'linmalarni ham qamraydi</span>
        </>
      }
      extra={
        canEdit && (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Limit
          </Button>
        )
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        loading={loading && !rows}
        dataSource={rows ?? []}
        scroll={{ x: 760 }}
        locale={{ emptyText: 'Limit belgilanmagan' }}
        columns={[
          {
            title: 'Kim uchun',
            key: 'target',
            render: (_, r) =>
              r.orgUnit ? (
                <span className="cell-stack">
                  <span>{r.orgUnit.name}</span>
                  <span className="cell-sub">bo'linma</span>
                </span>
              ) : (
                <span className="cell-stack">
                  <span>{r.user?.fullName}</span>
                  <span className="cell-sub">operator{r.user?.sipExtension ? ` · SIP ${r.user.sipExtension}` : ''}</span>
                </span>
              ),
          },
          { title: 'Oylik limit', dataIndex: 'monthlyAmount', align: 'right', className: 'num', render: (v: number) => som(v) },
          { title: 'Sarflandi', dataIndex: 'spent', align: 'right', className: 'num', render: (v: number) => som(v) },
          {
            title: 'Foiz',
            key: 'progress',
            width: 200,
            render: (_, r) => (
              <Tooltip title={`Ogohlantirish ${r.warnPercent}% da`}>
                <Progress
                  size="small"
                  percent={Math.min(100, r.percent ?? (r.spent > 0 ? 100 : 0))}
                  format={() => (r.percent === null ? '—' : `${r.percent}%`)}
                  status={r.level === 2 ? 'exception' : 'normal'}
                  strokeColor={r.level === 1 ? '#B45309' : r.level === 2 ? undefined : '#0B6B6B'}
                />
              </Tooltip>
            ),
          },
          {
            title: 'Holat',
            key: 'level',
            render: (_, r) => (r.isActive ? <ToneTag tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</ToneTag> : <ToneTag tone="grey">O'chirilgan</ToneTag>),
          },
          ...(canEdit
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 88,
                  render: (_: unknown, r: CostLimitRow) => (
                    <span className="billing-row-actions">
                      <Button type="text" size="small" icon={<EditOutlined />} aria-label="Tahrirlash" onClick={() => setEditing(r)} />
                      <Popconfirm title="Limit o'chirilsinmi?" okText="O'chirish" cancelText="Bekor" onConfirm={() => void remove(r)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="O'chirish" />
                      </Popconfirm>
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <p className="page-sub billing-note">
        {current ? 'Sarflangan summa ogohlantirish foiziga yetganda va limit tugaganda administrator, supervisorlar va bo\'linma rahbariga bir martadan xabar boradi (limit tugasa — Telegram guruhiga ham). ' : "O'tgan oy uchun xabar yuborilmaydi. "}
        Limit tugagani chiquvchi qo'ng'iroqni bloklamaydi — qaror rahbariyatda.
      </p>

      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Yangi limit' : 'Limitni tahrirlash'}
        okText="Saqlash"
        cancelText="Bekor"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="kind" label="Kim uchun">
            <Segmented
              options={[
                { value: 'unit', label: "Bo'linma" },
                { value: 'user', label: 'Operator' },
              ]}
            />
          </Form.Item>
          {kind === 'user' ? (
            <Form.Item name="userId" label="Operator" rules={[{ required: true, message: 'Operatorni tanlang' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={targets.loading}
                placeholder="Ism yoki SIP raqami"
                options={(targets.data?.operators ?? []).map((u) => ({ value: u.id, label: `${u.fullName}${u.sipExtension ? ` · ${u.sipExtension}` : ''}` }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="orgUnitId" label="Bo'linma" rules={[{ required: true, message: "Bo'linmani tanlang" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={targets.loading}
                placeholder="Bo'linma nomi"
                options={(targets.data?.units ?? []).map((u) => ({ value: u.id, label: `${'· '.repeat(Math.min(u.depth, 3))}${u.name}` }))}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="monthlyAmount" label="Oylik limit, so'm" rules={[{ required: true, message: 'Summani kiriting' }]}>
                <InputNumber<number> min={0} max={1_000_000_000} step={100_000} style={{ width: '100%' }} formatter={(v) => (v === undefined ? '' : formatNumber(Number(v)))} parser={(v) => Number((v ?? '').replace(/\D/g, ''))} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="warnPercent" label="Ogohlantirish, %" rules={[{ required: true, message: 'Foizni kiriting' }]}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isActive" label="Faol" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

// ───────────── Tariflar ─────────────

interface TariffForm {
  direction: TariffDirection;
  prefix: string;
  pricePerMinute: number;
  billingStepSec: number;
  validFrom: Dayjs;
  validTo: Dayjs | null;
}

function tariffState(t: TariffRow): { tone: Tone; label: string } {
  const now = dayjs();
  if (dayjs(t.validFrom).isAfter(now)) return { tone: 'blue', label: 'Kelajakda' };
  if (t.validTo && !dayjs(t.validTo).isAfter(now)) return { tone: 'grey', label: 'Muddati tugagan' };
  return { tone: 'green', label: 'Amalda' };
}

function TariffsTab({ canEdit }: { canEdit: boolean }) {
  const { message } = App.useApp();
  const list = useAsync(() => api.get<TariffRow[]>('/billing/tariffs').then((r) => r.data), []);
  const [editing, setEditing] = useState<TariffRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<TariffDirection | 'ALL'>('ALL');
  const [form] = Form.useForm<TariffForm>();

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue(
      editing === 'new'
        ? { direction: 'MOBILE', prefix: '998', pricePerMinute: 0, billingStepSec: 60, validFrom: dayjs().startOf('day'), validTo: null }
        : { ...editing, validFrom: dayjs(editing.validFrom), validTo: editing.validTo ? dayjs(editing.validTo) : null },
    );
  }, [editing, form]);

  const save = async () => {
    const v = await form.validateFields();
    const body = { ...v, validFrom: v.validFrom.startOf('day').toISOString(), validTo: v.validTo ? v.validTo.startOf('day').toISOString() : null };
    setSaving(true);
    try {
      if (editing === 'new') await api.post('/billing/tariffs', body);
      else if (editing) await api.put(`/billing/tariffs/${editing.id}`, body);
      setEditing(null);
      message.success('Tarif saqlandi. Joriy oy summalarini yangilash uchun «Qayta hisoblash»ni bosing.');
      await list.reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: TariffRow) => {
    try {
      const res = await api.delete<{ closed: boolean }>(`/billing/tariffs/${row.id}`);
      message.success(res.data.closed ? "Tarif hisob-kitobda ishlatilgan — o'chirilmadi, amal qilish muddati yopildi" : "Tarif o'chirildi");
      await list.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const rows = (list.data ?? []).filter((t) => direction === 'ALL' || t.direction === direction);

  return (
    <Card
      size="small"
      title={
        <>
          Tariflar jadvali
          <span className="card-sub">Bir nechta prefiks mos kelsa eng uzuni olinadi · suhbat tariflash qadamiga yuqoriga yaxlitlanadi</span>
        </>
      }
      extra={
        <span className="billing-actions">
          <Select<TariffDirection | 'ALL'>
            size="small"
            value={direction}
            onChange={setDirection}
            style={{ width: 160 }}
            aria-label="Yo'nalish"
            options={[{ value: 'ALL', label: "Barcha yo'nalishlar" }, ...DIRECTIONS]}
          />
          {canEdit && (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Tarif
            </Button>
          )}
        </span>
      }
    >
      {list.error && <Alert type="error" showIcon message={list.error} style={{ marginBottom: 12 }} />}
      <Table
        size="small"
        rowKey="id"
        loading={list.loading && !list.data}
        dataSource={rows}
        pagination={rows.length > 30 ? { pageSize: 30, showSizeChanger: false } : false}
        scroll={{ x: 820 }}
        columns={[
          { title: "Yo'nalish", dataIndex: 'direction', render: (v: TariffDirection) => DIRECTION_LABEL[v] },
          { title: 'Prefiks', dataIndex: 'prefix', className: 'mono', render: (v: string) => `+${v}…` },
          { title: 'Daqiqa narxi', dataIndex: 'pricePerMinute', align: 'right', className: 'num', render: (v: number) => som(v) },
          { title: 'Qadam', dataIndex: 'billingStepSec', align: 'right', className: 'num', render: (v: number) => `${v} s` },
          {
            title: 'Amal qiladi',
            key: 'valid',
            render: (_, t) => `${formatDate(t.validFrom)} — ${t.validTo ? formatDate(t.validTo) : 'muddatsiz'}`,
          },
          { title: 'Holat', key: 'state', render: (_, t) => <ToneTag tone={tariffState(t).tone}>{tariffState(t).label}</ToneTag> },
          { title: "Qo'ng'iroqlar", dataIndex: 'charges', align: 'right', className: 'num', render: (v: number) => formatNumber(v) },
          ...(canEdit
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 88,
                  render: (_: unknown, t: TariffRow) => (
                    <span className="billing-row-actions">
                      <Button type="text" size="small" icon={<EditOutlined />} aria-label="Tahrirlash" onClick={() => setEditing(t)} />
                      <Popconfirm
                        title={t.charges > 0 ? 'Tarif muddati yopilsinmi?' : "Tarif o'chirilsinmi?"}
                        description={t.charges > 0 ? "Bu tarif bilan narxlangan qo'ng'iroqlar bor — tarix saqlanadi, tarif bugundan amal qilmaydi." : undefined}
                        okText={t.charges > 0 ? 'Yopish' : "O'chirish"}
                        cancelText="Bekor"
                        onConfirm={() => void remove(t)}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="O'chirish" />
                      </Popconfirm>
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <p className="page-sub billing-note">
        Narx o'zgarganda eski tarifning «amal qilish oxiri»ni qo'yib, yangi sanadan yangi tarif qo'shing — o'tgan qo'ng'iroqlar eski narxda qoladi.
        Ichki (operator↔operator) va qisqa raqamlar narxlanmaydi.
      </p>

      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Yangi tarif' : 'Tarifni tahrirlash'}
        okText="Saqlash"
        cancelText="Bekor"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="direction" label="Yo'nalish" rules={[{ required: true }]}>
                <Select options={DIRECTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="prefix"
                label="Prefiks (xalqaro, + belgisisiz)"
                rules={[{ required: true, message: 'Prefiksni kiriting' }, { pattern: /^\d{1,16}$/, message: 'Faqat raqamlar, masalan 99890' }]}
              >
                <Input className="mono" placeholder="99890" maxLength={16} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pricePerMinute" label="Daqiqa narxi, so'm" rules={[{ required: true, message: 'Narxni kiriting' }]}>
                <InputNumber min={0} max={1_000_000} step={5} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="billingStepSec" label="Tariflash qadami, soniya" rules={[{ required: true }]}>
                <Select
                  options={[1, 6, 30, 60].map((s) => ({ value: s, label: s === 60 ? '60 s (daqiqali)' : s === 1 ? '1 s (soniyali)' : `${s} s` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="validFrom" label="Amal qilish boshi" rules={[{ required: true, message: 'Sanani tanlang' }]}>
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="validTo"
                label="Amal qilish oxiri"
                dependencies={['validFrom']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, value: Dayjs | null) =>
                      !value || value.isAfter(getFieldValue('validFrom'), 'day') ? Promise.resolve() : Promise.reject(new Error('Boshlanish sanasidan keyin bo\'lishi kerak')),
                  }),
                ]}
              >
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} placeholder="Muddatsiz" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
