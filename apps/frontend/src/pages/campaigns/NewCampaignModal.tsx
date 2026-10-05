import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CampaignStatus, CampaignType, Category } from '../../api/types';
import { CAMPAIGN_TYPE_LABELS } from '../../constants';
import { useAsync } from '../../hooks/useAsync';
import ContactsSource, { initialSource, sourcePayload, type SourceValue } from './ContactsSource';

interface CampaignForm {
  name: string;
  type: CampaignType;
  description?: string;
  script?: string;
  maxAttempts: number;
  period?: [Dayjs, Dayjs];
  status: CampaignStatus;
}

/** Yangi chiquvchi kampaniya: turi, skript, urinishlar soni, muddat va kontaktlar manbai. */
export default function NewCampaignModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CampaignForm>();
  const [source, setSource] = useState<SourceValue>(initialSource());
  const [saving, setSaving] = useState(false);
  const categories = useAsync(() => (open ? api.get<Category[]>('/reference/categories').then((r) => r.data) : Promise.resolve([])), [open]);

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.post<{ campaign: { id: number }; added: number; skipped: number }>('/campaigns', {
        name: v.name,
        type: v.type,
        description: v.description,
        script: v.script,
        maxAttempts: v.maxAttempts,
        startsAt: v.period?.[0]?.startOf('day').toISOString(),
        endsAt: v.period?.[1]?.endOf('day').toISOString(),
        status: v.status,
        ...sourcePayload(source),
      });
      message.success(`Kampaniya yaratildi: ${res.data.added} ta kontakt${res.data.skipped ? `, ${res.data.skipped} tasi o'tkazib yuborildi` : ''}`);
      form.resetFields();
      setSource(initialSource());
      onCreated(res.data.campaign.id);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Yangi kampaniya" okText="Yaratish" cancelText="Bekor qilish" confirmLoading={saving} onOk={() => void save()} onCancel={onClose} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" preserve={false} initialValues={{ type: 'SURVEY', maxAttempts: 3, status: 'DRAFT' }}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true, message: 'Nomini kiriting' }]}>
          <Input maxLength={200} autoFocus />
        </Form.Item>
        <div className="form-row">
          <Form.Item name="type" label="Turi" style={{ flex: 1 }}>
            <Select options={Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="maxAttempts" label="Urinishlar soni" style={{ width: 150 }}>
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Holati" style={{ flex: 1 }}>
            <Select
              options={[
                { value: 'DRAFT', label: 'Qoralama' },
                { value: 'SCHEDULED', label: 'Rejalashtirilgan' },
                { value: 'ACTIVE', label: 'Darhol boshlash' },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="period" label="Muddat">
          <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Tavsif (operatorga sabab sifatida ko'rinadi)">
          <Input maxLength={2000} />
        </Form.Item>
        <Form.Item name="script" label="Suhbat skripti">
          <Input.TextArea rows={3} maxLength={5000} placeholder="Assalomu alaykum! Kadastr agentligi 1097 ishonch telefonidan qo'ng'iroq qilyapmiz…" />
        </Form.Item>
        <Form.Item label="Kontaktlar">
          <ContactsSource value={source} onChange={setSource} categories={categories.data ?? []} allowNone />
        </Form.Item>
      </Form>
    </Modal>
  );
}
