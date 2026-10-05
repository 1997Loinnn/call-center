import { DeleteOutlined, DownloadOutlined, EditOutlined, MailOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tag, TimePicker, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, downloadFile, errorMessage } from '../../api/client';
import type { ExportFormat, ExportTemplateRow, ExportTemplatesResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { FORMAT_CLASS, P } from '../../constants';
import { formatDateTime } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { buildSchedule, describeSchedule, parseSchedule, WEEKDAYS, type Frequency } from './schedule';

interface TemplateForm {
  name: string;
  source: string;
  format: ExportFormat;
  columns: string[];
  frequency: Frequency;
  time: Dayjs;
  weekday: number;
  monthDay: number;
  recipientRoles: string[];
  isActive: boolean;
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'manual', label: "Qo'lda" },
  { value: 'daily', label: 'Har kuni' },
  { value: 'weekly', label: 'Har hafta' },
  { value: 'monthly', label: 'Har oy' },
];

/** Eksport shablonlari (F-REP-05): hisobotchi yuklab oladi, administrator tahrirlaydi. */
export default function ExportTemplatesTab() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can(P.SettingsManage);
  const canDownload = can(P.ReportsView);
  const data = useAsync(() => api.get<ExportTemplatesResponse>('/crm/export-templates').then((r) => r.data), []);
  const [editing, setEditing] = useState<ExportTemplateRow | 'new' | null>(null);
  const [downloading, setDownloading] = useState<ExportTemplateRow | null>(null);
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [form] = Form.useForm<TemplateForm>();

  const sources = data.data?.sources ?? {};
  const roleName = new Map((data.data?.roles ?? []).map((r) => [r.code, r.name]));
  const formSource = Form.useWatch('source', form);
  const formFrequency = Form.useWatch('frequency', form);
  const sourceInfo = formSource ? sources[formSource] : undefined;

  const open = (template: ExportTemplateRow | 'new') => {
    setEditing(template);
    const schedule = parseSchedule(template === 'new' ? null : template.schedule);
    form.setFieldsValue({
      name: template === 'new' ? '' : template.name,
      source: template === 'new' ? 'daily_summary' : template.source,
      format: template === 'new' ? 'XLSX' : template.format,
      columns: template === 'new' ? sources.daily_summary?.columns ?? [] : template.columns,
      frequency: schedule.frequency,
      time: dayjs(schedule.time, 'HH:mm'),
      weekday: schedule.weekday,
      monthDay: schedule.monthDay,
      recipientRoles: template === 'new' ? [] : template.recipientRoles,
      isActive: template === 'new' ? true : template.isActive,
    });
  };

  const save = async () => {
    const v = await form.validateFields();
    const body = {
      name: v.name,
      source: v.source,
      format: v.format,
      columns: v.columns,
      schedule: buildSchedule({ frequency: v.frequency, time: v.time.format('HH:mm'), weekday: v.weekday, monthDay: v.monthDay }),
      recipientRoles: v.frequency === 'manual' ? [] : v.recipientRoles,
      isActive: v.isActive,
    };
    try {
      if (editing === 'new') await api.post('/crm/export-templates', body);
      else if (editing) await api.put(`/crm/export-templates/${editing.id}`, body);
      message.success('Shablon saqlandi');
      setEditing(null);
      void data.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = async (template: ExportTemplateRow) => {
    try {
      await api.delete(`/crm/export-templates/${template.id}`);
      message.success("Shablon o'chirildi");
      void data.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const sendNow = async (template: ExportTemplateRow) => {
    setSending(template.id);
    try {
      const res = await api.post<{ status: 'ok' | 'partial' | 'error'; note: string }>(`/reports/templates/${template.id}/send`);
      if (res.data.status === 'error') message.error(res.data.note);
      else if (res.data.status === 'partial') message.warning(res.data.note);
      else message.success(res.data.note);
      void data.reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSending(null);
    }
  };

  const download = async (template: ExportTemplateRow, range?: [Dayjs, Dayjs]) => {
    setBusy(true);
    try {
      const params = range ? { from: range[0].startOf('day').toISOString(), to: range[1].endOf('day').toISOString() } : {};
      await downloadFile(`/reports/templates/${template.id}/download`, params, `${template.code}.${template.format.toLowerCase()}`);
      setDownloading(null);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<ExportTemplateRow> = [
    {
      title: 'Shablon',
      render: (_, t) => (
        <span className="cell-stack">
          <span className="cell-strong">{t.name}</span>
          <span className="cell-sub">{sources[t.source]?.label ?? t.source}</span>
        </span>
      ),
    },
    { title: 'Format', dataIndex: 'format', width: 90, render: (f: ExportFormat) => <span className={`fmt-badge ${FORMAT_CLASS[f]}`}>{f}</span> },
    {
      title: 'Ustunlar',
      width: 110,
      render: (_, t) => (
        <Tooltip title={t.columns.join(', ')}>
          <span className="cell-sub">{t.columns.length} ta ustun</span>
        </Tooltip>
      ),
    },
    {
      title: 'Jadval',
      width: 220,
      render: (_, t) => (
        <span className="cell-stack">
          <span>{describeSchedule(t.schedule)}</span>
          {t.lastRunAt && (
            <Tooltip title={t.lastRunNote}>
              <span className="cell-sub">
                <ToneTag tone={t.lastRunStatus === 'ok' ? 'green' : t.lastRunStatus === 'partial' ? 'amber' : 'red'}>
                  {t.lastRunStatus === 'ok' ? 'Yuborildi' : t.lastRunStatus === 'partial' ? 'Qisman' : 'Yuborilmadi'}
                </ToneTag>{' '}
                {formatDateTime(t.lastRunAt)}
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: 'Qabul qiluvchilar',
      render: (_, t) =>
        t.recipientRoles.length === 0 ? <span className="cell-sub">—</span> : t.recipientRoles.map((code) => <Tag key={code}>{roleName.get(code) ?? code}</Tag>),
    },
    { title: 'Holat', width: 110, render: (_, t) => (t.isActive ? <ToneTag tone="green">Faol</ToneTag> : <ToneTag tone="grey">O'chirilgan</ToneTag>) },
    {
      title: <span className="visually-hidden">Amallar</span>,
      width: canEdit ? 190 : 70,
      render: (_, t) => {
        const info = sources[t.source];
        const reason = !canDownload ? "Hisobotlarni ko'rish huquqi kerak" : !info?.formats.length || t.source === 'ticket_answer' ? 'Murojaat kartasidan yuklanadi' : undefined;
        return (
          <span className="user-actions">
            <Tooltip title={reason ?? 'Yuklab olish'}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                disabled={!!reason}
                aria-label={`${t.name}: yuklab olish`}
                onClick={() => (info?.periodic ? setDownloading(t) : void download(t))}
              />
            </Tooltip>
            {canEdit && (
              <>
                <Tooltip title={t.recipientRoles.length ? 'Qabul qiluvchilarga hozir emailga yuborish' : 'Qabul qiluvchi rollar tanlanmagan'}>
                  <Popconfirm
                    title="Hisobot hozir yuborilsinmi?"
                    description="Har bir qabul qiluvchiga o'z ko'rish doirasidagi fayl emailga boradi."
                    okText="Yuborish"
                    cancelText="Bekor"
                    disabled={!t.recipientRoles.length || !t.isActive}
                    onConfirm={() => void sendNow(t)}
                  >
                    <Button
                      size="small"
                      type="text"
                      icon={<MailOutlined />}
                      loading={sending === t.id}
                      disabled={!t.recipientRoles.length || !t.isActive || t.source === 'ticket_answer'}
                      aria-label={`${t.name}: hozir yuborish`}
                    />
                  </Popconfirm>
                </Tooltip>
                <Button size="small" type="text" icon={<EditOutlined />} aria-label={`${t.name}: tahrirlash`} onClick={() => open(t)} />
                <Popconfirm title="Shablon o'chirilsinmi?" okText="Ha" cancelText="Yo'q" onConfirm={() => void remove(t)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`${t.name}: o'chirish`} />
                </Popconfirm>
              </>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {data.error && <Alert type="error" message={data.error} showIcon style={{ marginBottom: 16 }} />}
      <Card
        size="small"
        title="Eksport shablonlari"
        extra={
          canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
              Yangi shablon
            </Button>
          )
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="id"
          size="middle"
          loading={data.loading}
          columns={columns}
          dataSource={data.data?.templates ?? []}
          pagination={false}
          scroll={{ x: 900 }}
          rowClassName={(t) => (t.isActive ? '' : 'cat-row-off')}
        />
      </Card>
      <p className="page-sub" style={{ marginTop: 8 }}>
        Hisobot tanlangan davr va sizning ko'rish doirangiz bo'yicha tuziladi. Jadval bo'yicha har bir qabul qiluvchiga o'z ko'rish doirasidagi fayl
        emailga (SMTP) ilova qilib yuboriladi: kunlik — bugungi (ertalabki jadvalda kechagi) ma'lumot, haftalik — oxirgi 7 kun, oylik — o'tgan oy.
        Email manzili ko'rsatilmagan xodimlarga yuborilmaydi.
      </p>

      <Modal
        open={downloading !== null}
        title={downloading ? `${downloading.name} · yuklab olish` : ''}
        okText="Yuklab olish"
        cancelText="Bekor qilish"
        confirmLoading={busy}
        onOk={() => downloading && void download(downloading, period)}
        onCancel={() => setDownloading(null)}
      >
        <label className="field-label" htmlFor="export-period">
          Davr
        </label>
        <DatePicker.RangePicker
          id="export-period"
          format="DD.MM.YYYY"
          allowClear={false}
          value={period}
          disabledDate={(d) => d.isAfter(dayjs().endOf('day'))}
          presets={[
            { label: 'Bugun', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
            { label: '7 kun', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
            { label: '30 kun', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] },
            { label: 'Joriy oy', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
          ]}
          onChange={(range) => range?.[0] && range[1] && setPeriod([range[0], range[1]])}
        />
      </Modal>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Yangi shablon' : 'Shablonni tahrirlash'}
        okText="Saqlash"
        cancelText="Bekor qilish"
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        width={620}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true, message: 'Nomini kiriting' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="source" label="Manba" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Select
                options={Object.entries(sources).map(([value, s]) => ({ value, label: s.label }))}
                onChange={(source: string) => {
                  const info = sources[source];
                  form.setFieldsValue({ columns: info?.columns ?? [], format: info?.formats.includes(form.getFieldValue('format')) ? form.getFieldValue('format') : info?.formats[0] });
                }}
              />
            </Form.Item>
            <Form.Item name="format" label="Format" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={(sourceInfo?.formats ?? []).map((f) => ({ value: f, label: f }))} />
            </Form.Item>
          </div>
          <Form.Item name="columns" label="Ustunlar" extra="Tanlangan tartibda chiqadi" rules={[{ required: true, message: 'Kamida bitta ustun' }]}>
            <Select mode="multiple" options={(sourceInfo?.columns ?? []).map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="frequency" label="Jadval" style={{ flex: 1 }}>
              <Select options={FREQUENCIES} />
            </Form.Item>
            {formFrequency === 'weekly' && (
              <Form.Item name="weekday" label="Hafta kuni" style={{ flex: 1 }}>
                <Select options={WEEKDAYS.map((label, i) => ({ value: i + 1, label }))} />
              </Form.Item>
            )}
            {formFrequency === 'monthly' && (
              <Form.Item name="monthDay" label="Oy kuni" style={{ flex: 1 }}>
                <InputNumber min={1} max={28} style={{ width: '100%' }} />
              </Form.Item>
            )}
            {formFrequency !== 'manual' && (
              <Form.Item name="time" label="Vaqt" style={{ flex: 1 }}>
                <TimePicker format="HH:mm" minuteStep={5} allowClear={false} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </div>
          {formFrequency !== 'manual' && (
            <Form.Item name="recipientRoles" label="Kimga yuboriladi (rollar)">
              <Select mode="multiple" options={(data.data?.roles ?? []).map((r) => ({ value: r.code, label: r.name }))} />
            </Form.Item>
          )}
          <Form.Item name="isActive" label="Faol" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
