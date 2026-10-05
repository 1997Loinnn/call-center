import { App, Form, Input, Modal, Segmented } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { OmniChannel } from '../../api/types';
import { CHANNEL_META } from './omni-labels';

interface Values {
  channel: OmniChannel;
  name: string;
  phone?: string;
  text: string;
}

/** Ishlab chiqish muhiti: Telegram yoki email ulanmasdan fuqaro xabarini taqlid qilish. */
export default function SimulateModal({ onClose, onSent }: { onClose: () => void; onSent: (conversationId: number | null) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  const send = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.post<{ conversationId: number | null }>('/omni/dev/simulate', { ...values, phone: values.phone?.trim() || undefined });
      onSent(res.data.conversationId);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Sinov xabari (fuqaro nomidan)" okText="Yuborish" cancelText="Bekor qilish" confirmLoading={saving} onOk={() => void send()} onCancel={onClose} destroyOnHidden>
      <p className="panel-note">Faqat ishlab chiqish muhitida: kanal ulanmagan bo'lsa ham, fuqaro xabari kelgandek suhbat yaratiladi.</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ channel: 'TELEGRAM' }}>
        <Form.Item name="channel" label="Kanal">
          <Segmented options={(Object.keys(CHANNEL_META) as OmniChannel[]).map((c) => ({ value: c, label: CHANNEL_META[c].label }))} />
        </Form.Item>
        <div className="form-row">
          <Form.Item name="name" label="Fuqaro ismi" rules={[{ required: true, whitespace: true }]} style={{ flex: 1 }}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="phone" label="Telefon (ixtiyoriy)" style={{ flex: 1 }}>
            <Input className="mono" maxLength={20} placeholder="+998 90 123 45 67" />
          </Form.Item>
        </div>
        <Form.Item name="text" label="Xabar" rules={[{ required: true, whitespace: true }]}>
          <Input.TextArea rows={3} maxLength={2000} placeholder="Masalan: Kadastr pasportini qanday olsam bo'ladi?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
