import { CheckOutlined, CloseOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Popconfirm, Segmented, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CallbackRow, CallbackStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { formatDateTime, formatPhone } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { useSocketEvent } from '../../realtime/socket';
import type { Tone } from '../../theme';

const STATUS: Record<CallbackStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Kutmoqda', tone: 'amber' },
  DONE: { label: "Bog'lanildi", tone: 'green' },
  FAILED: { label: "Bog'lanib bo'lmadi", tone: 'red' },
  CANCELLED: { label: 'Bekor qilindi', tone: 'grey' },
};

/** Qancha vaqtdan beri kutmoqda: "12 daq", "2 soat 5 daq" */
function waited(iso: string): string {
  const minutes = Math.max(0, dayjs().diff(dayjs(iso), 'minute'));
  if (minutes < 60) return `${minutes} daq`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} soat ${minutes % 60} daq` : `${Math.floor(hours / 24)} kun`;
}

/**
 * Qayta qo'ng'iroq so'rovlari (F-TEL-05): navbatda uzoq kutgan fuqarolar. Eng eskisi birinchi — operator terib,
 * natijasini belgilaydi. Yangi so'rov real vaqtda paydo bo'ladi.
 */
export default function CallbacksPanel({ onChanged }: { onChanged: () => void }) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canCall = can(P.TelephonyUse);
  const [status, setStatus] = useState<CallbackStatus | 'all'>('PENDING');
  const list = useAsync(() => api.get<CallbackRow[]>('/callbacks', { params: { status } }).then((r) => r.data), [status]);
  const [busy, setBusy] = useState<number | null>(null);

  useSocketEvent('callbacks.changed', () => void list.reload());

  const act = async (row: CallbackRow, request: () => Promise<unknown>, success: string) => {
    setBusy(row.id);
    try {
      await request();
      message.success(success);
      await list.reload();
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      size="small"
      title="Qayta qo'ng'iroq so'rovlari"
      extra={
        <Segmented<CallbackStatus | 'all'>
          size="small"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'Kutmoqda' },
            { value: 'DONE', label: "Bog'lanildi" },
            { value: 'all', label: 'Hammasi' },
          ]}
        />
      }
    >
      {list.error && <Alert type="error" showIcon message={list.error} />}
      <Table<CallbackRow>
        rowKey="id"
        size="small"
        loading={list.loading}
        dataSource={list.data ?? []}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: status === 'PENDING' ? "Kutayotgan so'rov yo'q" : "So'rov yo'q" }}
        columns={[
          { title: 'Raqam', dataIndex: 'phone', width: 180, render: (v: string) => <span className="mono cell-strong">{formatPhone(v)}</span> },
          { title: 'Navbat', width: 200, render: (_, r) => (r.queue ? `${r.queue.pbxNumber} · ${r.queue.name}` : '—') },
          {
            title: 'So\'ralgan',
            width: 170,
            render: (_, r) => (
              <span className="cell-stack">
                <span className="mono">{formatDateTime(r.requestedAt)}</span>
                {r.status === 'PENDING' && <span className={`cell-sub${dayjs().diff(dayjs(r.requestedAt), 'minute') > 30 ? ' cell-sub-danger' : ''}`}>{waited(r.requestedAt)} kutmoqda</span>}
              </span>
            ),
          },
          { title: 'Urinish', dataIndex: 'attempts', width: 80, render: (v: number) => <span className="mono">{v}</span> },
          {
            title: 'Holat',
            width: 200,
            render: (_, r) => (
              <span className="cell-stack">
                <ToneTag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</ToneTag>
                {r.handledBy && <span className="cell-sub">{r.handledBy.fullName}</span>}
              </span>
            ),
          },
          {
            title: <span className="visually-hidden">Amallar</span>,
            width: 250,
            render: (_, r) =>
              r.status === 'PENDING' &&
              canCall && (
                <span className="header-actions">
                  <Tooltip title="Ichki raqamingizdan qo'ng'iroq (softfon jiringlaydi)">
                    <Button size="small" type="primary" icon={<PhoneOutlined />} loading={busy === r.id} onClick={() => void act(r, () => api.post(`/callbacks/${r.id}/call`), "Qo'ng'iroq boshlandi")}>
                      Qo'ng'iroq
                    </Button>
                  </Tooltip>
                  <Button size="small" icon={<CheckOutlined />} disabled={r.attempts === 0} onClick={() => void act(r, () => api.post(`/callbacks/${r.id}/finish`, { status: 'DONE' }), "Bog'lanildi")}>
                    Bog'lanildi
                  </Button>
                  <Popconfirm
                    title="Natija"
                    description="Bog'lanib bo'lmadimi yoki so'rov bekor qilinsinmi?"
                    okText="Bog'lanib bo'lmadi"
                    cancelText="Bekor qilish"
                    onConfirm={() => void act(r, () => api.post(`/callbacks/${r.id}/finish`, { status: 'FAILED' }), 'Belgilandi')}
                    onCancel={() => void act(r, () => api.post(`/callbacks/${r.id}/finish`, { status: 'CANCELLED' }), 'Bekor qilindi')}
                  >
                    <Button size="small" type="text" icon={<CloseOutlined />} aria-label="Yopish" />
                  </Popconfirm>
                </span>
              ),
          },
        ]}
      />
      <p className="panel-note">
        Fuqaro navbatda belgilangan vaqtdan ko'p kutsa (Navbatlar va IVR → navbat sozlamasi) qayta qo'ng'iroqni tanlaydi; so'rov qabul qilingani haqida unga SMS boradi.
      </p>
    </Card>
  );
}
