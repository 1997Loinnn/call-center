import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Skeleton, Table, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import ToneTag from '../components/ToneTag';
import { formatDate } from '../format';
import { useAsync } from '../hooks/useAsync';
import type { Tone } from '../theme';
import QaChecklistCard from './QaChecklistCard';
import './system-settings.css';

interface SystemSettings {
  workingHours: { days: number[]; start: string; end: string; lunch: { start: string; end: string } };
  serviceLevel: { answerWithinSeconds: number; targetPercent: number; avgWaitTargetSeconds: number };
  recordingRetentionDays: number;
  slaReminderDays: number;
  smsTemplates: Record<SmsKey, string>;
  holidays: { id: number; date: string; name: string }[];
  security: { enforceTwoFactor: boolean; twoFactorRoles: string[] };
  staffNotify: { email: boolean };
  roles: { code: string; name: string }[];
  integrations: { key: string; name: string; status: 'connected' | 'test' | 'error' | 'off'; note: string }[];
}

type SmsKey = 'ticket_created' | 'ticket_closed' | 'callback' | 'document_ready';

interface FormValues {
  days: number[];
  work: [Dayjs, Dayjs];
  lunch: [Dayjs, Dayjs];
  answerWithinSeconds: number;
  targetPercent: number;
  avgWaitTargetSeconds: number;
  recordingRetentionDays: number;
  slaReminderDays: number;
  sms: Record<SmsKey, string>;
  enforceTwoFactor: boolean;
  twoFactorRoles: string[];
  staffEmail: boolean;
}

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const SMS: { key: SmsKey; label: string; vars: string }[] = [
  { key: 'ticket_created', label: 'Murojaat qabul qilindi', vars: '{raqam}' },
  { key: 'ticket_closed', label: 'Murojaat yopildi', vars: '{raqam}' },
  { key: 'callback', label: "Qayta qo'ng'iroq so'rovi", vars: '—' },
  { key: 'document_ready', label: 'Hujjat tayyor', vars: '{manzil}, {qabul_vaqti}' },
];
const STATUS: Record<SystemSettings['integrations'][number]['status'], { label: string; tone: Tone }> = {
  connected: { label: 'Ulangan', tone: 'green' },
  test: { label: 'Test rejimi', tone: 'amber' },
  error: { label: 'Xato', tone: 'red' },
  off: { label: 'Ulanmagan', tone: 'grey' },
};
const t = (v: string) => dayjs(v, 'HH:mm');

/** Tizim → Sozlamalar (F-ADM-01..04): ish vaqti, xizmat darajasi, saqlash muddatlari, SMS shablonlari, bayramlar. */
export default function SystemSettingsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [holidayDate, setHolidayDate] = useState<Dayjs | null>(null);
  const [holidayName, setHolidayName] = useState('');
  const data = useAsync(() => api.get<SystemSettings>('/settings/system').then((r) => r.data), []);
  const d = data.data;

  useEffect(() => {
    if (!d) return;
    form.setFieldsValue({
      days: d.workingHours.days,
      work: [t(d.workingHours.start), t(d.workingHours.end)],
      lunch: [t(d.workingHours.lunch.start), t(d.workingHours.lunch.end)],
      ...d.serviceLevel,
      recordingRetentionDays: d.recordingRetentionDays,
      slaReminderDays: d.slaReminderDays,
      sms: d.smsTemplates,
      enforceTwoFactor: d.security.enforceTwoFactor,
      twoFactorRoles: d.security.twoFactorRoles,
      staffEmail: d.staffNotify.email,
    });
  }, [d, form]);

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.put<SystemSettings>('/settings/system', {
        workingHours: {
          days: [...v.days].sort(),
          start: v.work[0].format('HH:mm'),
          end: v.work[1].format('HH:mm'),
          lunch: { start: v.lunch[0].format('HH:mm'), end: v.lunch[1].format('HH:mm') },
        },
        serviceLevel: { answerWithinSeconds: v.answerWithinSeconds, targetPercent: v.targetPercent, avgWaitTargetSeconds: v.avgWaitTargetSeconds },
        recordingRetentionDays: v.recordingRetentionDays,
        slaReminderDays: v.slaReminderDays,
        smsTemplates: v.sms,
        security: { enforceTwoFactor: v.enforceTwoFactor, twoFactorRoles: v.twoFactorRoles },
        staffNotify: { email: v.staffEmail },
      });
      data.setData(res.data);
      message.success('Sozlamalar saqlandi');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayDate || !holidayName.trim()) return;
    try {
      await api.post('/settings/holidays', { date: holidayDate.format('YYYY-MM-DD'), name: holidayName.trim() });
      setHolidayDate(null);
      setHolidayName('');
      void data.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeHoliday = async (id: number) => {
    try {
      await api.delete(`/settings/holidays/${id}`);
      void data.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  if (data.error) return <Alert type="error" showIcon message={data.error} />;
  if (!d) return <Skeleton active />;
  const upcoming = d.holidays.filter((h) => dayjs(h.date).isAfter(dayjs().subtract(1, 'year')));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Sozlamalar</h1>
          <span className="page-sub">Ish vaqti, xizmat darajasi maqsadlari, saqlash muddatlari va SMS shablonlari · o'zgarishlar audit jurnaliga yoziladi</span>
        </div>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          Saqlash
        </Button>
      </div>

      <Form form={form} layout="vertical" requiredMark={false}>
        <div className="sys-grid">
          <Card size="small" title="Ish vaqti">
            <Form.Item name="days" label="Ish kunlari" rules={[{ required: true, type: 'array', min: 1, message: 'Kamida bitta kun' }]}>
              <Checkbox.Group options={WEEKDAYS.map((label, i) => ({ label, value: i + 1 }))} />
            </Form.Item>
            <div className="form-row">
              <Form.Item name="work" label="Ish vaqti" rules={[{ required: true }]} style={{ flex: 1 }}>
                <TimePicker.RangePicker format="HH:mm" minuteStep={15} allowClear={false} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="lunch" label="Tushlik" rules={[{ required: true }]} style={{ flex: 1 }}>
                <TimePicker.RangePicker format="HH:mm" minuteStep={15} allowClear={false} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <p className="panel-note">Jonli holat va analitikadagi soatlik grafiklar shu oraliqda chiziladi. IVR ish vaqtidan tashqari avtojavobni shu jadval bo'yicha beradi — «Navbatlar va IVR → PBX'ga yuklash» bilan UCM6510 ga o'tadi.</p>
          </Card>

          <Card size="small" title="Xizmat darajasi maqsadlari">
            <div className="form-row">
              <Form.Item name="answerWithinSeconds" label="Javob vaqti, soniya" rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={5} max={600} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="targetPercent" label="Maqsad, %" rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="avgWaitTargetSeconds" label="O'rtacha kutish, soniya" rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={5} max={3600} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <p className="panel-note">Jonli holat, analitika va KPI kartalarida «maqsad» shu qiymatlardan olinadi (masalan, 20 soniyada javob — 80%).</p>
          </Card>

          <Card size="small" title="Saqlash va eslatmalar">
            <div className="form-row">
              <Form.Item name="recordingRetentionDays" label="Yozuvlarni saqlash, kun" rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={7} max={3650} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="slaReminderDays" label="Ijro muddati eslatmasi, kun oldin" rules={[{ required: true }]} style={{ flex: 1 }}>
                <InputNumber min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <p className="panel-note">Saqlash muddati yangi yozuvlarga qo'llanadi (TZ: 3 oy). Nizoli yozuvlar «legal hold» bilan o'chirilmaydi.</p>
          </Card>

          <Card size="small" title="Kirish xavfsizligi">
            <Form.Item name="enforceTwoFactor" valuePropName="checked" extra="TZ 4-bo'lim: rahbariyat, supervisor va administratorlar uchun majburiy. Yoqilgach, bu rollar keyingi kirishda autentifikator ilovasini ulaydi.">
              <Checkbox>Ikki bosqichli himoya (2FA) majburiy</Checkbox>
            </Form.Item>
            <Form.Item name="twoFactorRoles" label="Qaysi rollar uchun">
              <Select mode="multiple" options={d.roles.map((r) => ({ value: r.code, label: r.name }))} />
            </Form.Item>
            <Form.Item name="staffEmail" valuePropName="checked" extra="Yangi topshiriq, muddat yaqinlashdi, muddat o'tdi, kritik ogohlantirish — xodimning email manziliga (pochta serveri ulangan bo'lsa)">
              <Checkbox>Xodimlarga bildirishnomalarni emailga ham yuborish</Checkbox>
            </Form.Item>
          </Card>

          <Card size="small" title="Integratsiyalar holati">
            <ul className="sys-integrations">
              {d.integrations.map((i) => (
                <li key={i.key}>
                  <span className="cell-stack">
                    <span className="cell-strong">{i.name}</span>
                    <span className="cell-sub">{i.note}</span>
                  </span>
                  <ToneTag tone={STATUS[i.status].tone}>{STATUS[i.status].label}</ToneTag>
                </li>
              ))}
            </ul>
          </Card>

          <Card size="small" title="SMS shablonlari" className="sys-wide">
            <div className="sys-sms">
              {SMS.map((s) => (
                <Form.Item
                  key={s.key}
                  name={['sms', s.key]}
                  label={s.label}
                  extra={`O'zgaruvchilar: ${s.vars} · 160 belgidan oshsa 2 ta SMS bo'lib ketadi`}
                  rules={[{ required: true, whitespace: true, message: 'Matnni kiriting' }]}
                >
                  <Input.TextArea rows={3} maxLength={480} showCount />
                </Form.Item>
              ))}
            </div>
            <p className="panel-note">Murojaat qabul qilinganda va yopilganda fuqaroga shu matnlar bilan yuboriladi (holati — «Integratsiyalar holati»). Eskiz.uz da matnlar moderatsiyadan o'tgan shablonga mos bo'lishi kerak.</p>
          </Card>

          <Card size="small" title="Bayram kunlari" className="sys-wide">
            <div className="sys-holiday-add">
              <DatePicker format="DD.MM.YYYY" value={holidayDate} onChange={setHolidayDate} placeholder="Sana" />
              <Input placeholder="Bayram nomi" maxLength={120} value={holidayName} onChange={(e) => setHolidayName(e.target.value)} onPressEnter={() => void addHoliday()} />
              <Button icon={<PlusOutlined />} disabled={!holidayDate || !holidayName.trim()} onClick={() => void addHoliday()}>
                Qo'shish
              </Button>
            </div>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={upcoming}
              columns={[
                { title: 'Sana', dataIndex: 'date', width: 130, render: (v: string) => <span className="mono">{formatDate(v)}</span> },
                { title: 'Nomi', dataIndex: 'name' },
                {
                  title: <span className="visually-hidden">Amallar</span>,
                  width: 60,
                  render: (_, h) => (
                    <Popconfirm title={`${h.name} o'chirilsinmi?`} okText="Ha" cancelText="Yo'q" onConfirm={() => void removeHoliday(h.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`${h.name}: o'chirish`} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
            <p className="panel-note">Hayit kunlari har yili rasman e'lon qilinadi — shu yerda qo'shing.</p>
          </Card>
        </div>
      </Form>
      <div className="sys-grid" style={{ marginTop: 16 }}>
        <QaChecklistCard />
      </div>
    </>
  );
}
