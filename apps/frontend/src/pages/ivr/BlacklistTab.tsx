import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, DatePicker, Form, Input, Popconfirm, Table } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { BlacklistRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { formatDate, formatDateTime, formatPhone } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import type { IvrTabProps } from './IvrPage';

interface AddForm {
  phone: string;
  reason: string;
  expiresAt?: Dayjs;
}

/**
 * Qora ro'yxat (F-TEL-09): bezori va spam raqamlar. Supervisor yuritadi; ro'yxat «PBX'ga yuklash» bilan
 * UCM6510 ga o'tadi va bu raqamlardan qo'ng'iroq qabul qilinmaydi.
 */
export default function BlacklistTab({ data, reload }: IvrTabProps) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canManage = can(P.BlacklistManage);
  const list = useAsync(() => api.get<BlacklistRow[]>('/telephony/blacklist').then((r) => r.data), []);
  const [form] = Form.useForm<AddForm>();
  const [saving, setSaving] = useState(false);

  const add = async (values: AddForm) => {
    setSaving(true);
    try {
      await api.post('/telephony/blacklist', { phone: values.phone, reason: values.reason, expiresAt: values.expiresAt?.endOf('day').toISOString() });
      form.resetFields();
      message.success("Raqam qora ro'yxatga qo'shildi — PBX'ga yuklashni unutmang");
      await list.reload();
      void reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: BlacklistRow) => {
    try {
      await api.delete(`/telephony/blacklist/${row.id}`);
      await list.reload();
      void reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const now = dayjs();
  return (
    <div className="ivr-blacklist">
      {canManage && (
        <Card size="small" title="Raqam qo'shish">
          <Form form={form} layout="inline" onFinish={(v) => void add(v)} requiredMark={false} className="ivr-blacklist-form">
            <Form.Item name="phone" rules={[{ required: true, pattern: /^[+\d\s()-]{5,20}$/, message: 'Telefon raqami' }]}>
              <Input className="mono" placeholder="+998 90 123 45 67" style={{ width: 190 }} />
            </Form.Item>
            <Form.Item name="reason" rules={[{ required: true, whitespace: true, message: 'Sababini yozing' }]}>
              <Input placeholder="Sabab: haqorat, spam, ataylab band qilish…" maxLength={300} style={{ width: 340 }} />
            </Form.Item>
            <Form.Item name="expiresAt">
              <DatePicker placeholder="Muddatsiz" format="DD.MM.YYYY" disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>
              Qo'shish
            </Button>
          </Form>
        </Card>
      )}
      {list.error && <Alert type="error" showIcon message={list.error} />}
      <Card size="small" title={`Qora ro'yxat (${list.data?.length ?? 0})`}>
        <Table<BlacklistRow>
          rowKey="id"
          size="small"
          loading={list.loading}
          dataSource={list.data ?? []}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: "Qora ro'yxat bo'sh" }}
          columns={[
            { title: 'Raqam', dataIndex: 'phone', width: 180, render: (v: string) => <span className="mono">{formatPhone(v)}</span> },
            { title: 'Sabab', dataIndex: 'reason' },
            {
              title: 'Muddat',
              width: 150,
              render: (_, r) =>
                !r.expiresAt ? (
                  <ToneTag tone="red">Doimiy</ToneTag>
                ) : dayjs(r.expiresAt).isBefore(now) ? (
                  <ToneTag tone="grey">Tugagan</ToneTag>
                ) : (
                  <span className="mono">{formatDate(r.expiresAt)} gacha</span>
                ),
            },
            {
              title: "Qo'shgan",
              width: 220,
              render: (_, r) => (
                <span className="cell-stack">
                  <span>{r.createdBy.fullName}</span>
                  <span className="cell-sub mono">{formatDateTime(r.createdAt)}</span>
                </span>
              ),
            },
            {
              title: <span className="visually-hidden">Amallar</span>,
              width: 50,
              render: (_, r) =>
                canManage && (
                  <Popconfirm title={`${formatPhone(r.phone)} ro'yxatdan olinsinmi?`} okText="Ha" cancelText="Yo'q" onConfirm={() => void remove(r)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Ro'yxatdan olish" />
                  </Popconfirm>
                ),
            },
          ]}
        />
        <p className="panel-note">
          {data.driver === 'mock' ? "Test rejimi: «Test qo'ng'iroq» bu raqamlardan rad etiladi. " : ''}
          UCM6510 da kuchga kirishi uchun sahifa tepasidagi «PBX'ga yuklash» ni bosing (o'zgarishlar konfiguratsiya versiyasiga kiradi).
        </p>
      </Card>
    </div>
  );
}
