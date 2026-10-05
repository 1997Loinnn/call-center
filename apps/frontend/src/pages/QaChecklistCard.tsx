import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAsync } from '../hooks/useAsync';

interface Item {
  item: string;
  max: number;
}

/** Tizim → Sozlamalar: sifat nazorati baholash varaqasi (F-QA-02). Natija 100 ballik shkalaga keltiriladi. */
export default function QaChecklistCard() {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ items: Item[] }>();
  const [saving, setSaving] = useState(false);
  const data = useAsync(() => api.get<Item[]>('/qa/checklist').then((r) => r.data), []);
  const items = Form.useWatch('items', form) as Item[] | undefined;

  useEffect(() => {
    if (data.data) form.setFieldsValue({ items: data.data });
  }, [data.data, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      data.setData((await api.put<Item[]>('/qa/checklist', values)).data);
      message.success('Baholash varaqasi saqlandi');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const total = (items ?? []).reduce((s, i) => s + (Number(i?.max) || 0), 0);
  return (
    <Card
      size="small"
      title="Baholash varaqasi (sifat nazorati)"
      className="sys-wide"
      extra={
        <Button size="small" type="primary" loading={saving} onClick={() => void save()}>
          Saqlash
        </Button>
      }
    >
      {!data.data ? (
        <Skeleton active />
      ) : (
        <Form form={form} requiredMark={false}>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div className="qa-editor">
                {fields.map((field) => (
                  <div key={field.key} className="qa-editor-row">
                    <Form.Item name={[field.name, 'item']} rules={[{ required: true, whitespace: true, message: 'Band nomi' }]} style={{ flex: 1, margin: 0 }}>
                      <Input maxLength={120} placeholder="Band, masalan: Fuqaroni diqqat bilan tinglash" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'max']} rules={[{ required: true }]} style={{ margin: 0 }}>
                      <InputNumber min={1} max={100} addonAfter="ball" style={{ width: 130 }} />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Bandni olib tashlash" disabled={fields.length <= 1} onClick={() => remove(field.name)} />
                  </div>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add({ item: '', max: 10 })} disabled={fields.length >= 30} style={{ alignSelf: 'flex-start' }}>
                  Band qo'shish
                </Button>
              </div>
            )}
          </Form.List>
          <p className="panel-note">
            Jami: {total} ball — baho 100 ballik shkalaga keltiriladi va Analitika → Operatorlar jadvalidagi «Baho» ustuniga tushadi. O'zgarish yangi baholarga qo'llanadi.
          </p>
        </Form>
      )}
    </Card>
  );
}
