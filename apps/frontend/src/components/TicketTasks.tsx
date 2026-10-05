import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Empty, Input, Select, Skeleton } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { P } from '../constants';
import { formatDate, formatDateTime } from '../format';
import { useAsync } from '../hooks/useAsync';

export interface TicketTask {
  id: number;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: number; fullName: string } | null;
  createdBy: { id: number; fullName: string } | null;
}

/** Murojaat bo'yicha ichki vazifalar (prototip: tafsilot paneli → "Vazifalar" tabi). */
export default function TicketTasks({ ticketId, tasks, onChanged }: { ticketId: number; tasks: TicketTask[] | undefined; onChanged: () => void }) {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const canAdd = can(P.TicketsRoute) || can(P.TicketsAssign) || can(P.TicketsAnswer);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<number>();
  const [dueAt, setDueAt] = useState<Dayjs | null>(null);
  const [saving, setSaving] = useState(false);
  const assignees = useAsync(
    () => (canAdd ? api.get<{ id: number; fullName: string; orgUnit: { name: string } }[]>(`/tickets/${ticketId}/tasks/assignees`).then((r) => r.data) : Promise.resolve([])),
    [ticketId, canAdd],
  );

  const add = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/tickets/${ticketId}/tasks`, { title: title.trim(), assigneeId, dueAt: dueAt?.endOf('day').toISOString() });
      setTitle('');
      setAssigneeId(undefined);
      setDueAt(null);
      message.success("Vazifa qo'shildi");
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task: TicketTask, completed: boolean) => {
    try {
      await api.patch(`/tickets/${ticketId}/tasks/${task.id}`, { completed });
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  if (!tasks) return <Skeleton active />;
  const done = tasks.filter((t) => t.completedAt).length;

  return (
    <div className="td-body">
      <section className="td-section">
        <h3>
          Vazifalar {tasks.length > 0 && <span className="td-muted">· {done} / {tasks.length} bajarildi</span>}
        </h3>
        {tasks.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bu murojaat bo'yicha vazifa yo'q" />
        ) : (
          <ul className="td-list">
            {tasks.map((t) => {
              const overdue = !t.completedAt && t.dueAt && dayjs(t.dueAt).isBefore(dayjs());
              const mayToggle = t.assignee?.id === user?.id || t.createdBy?.id === user?.id || can(P.TicketsAssign) || can(P.TicketsRoute);
              return (
                <li key={t.id} className={t.completedAt ? 'td-task-done' : undefined}>
                  <Checkbox checked={!!t.completedAt} disabled={!mayToggle} aria-label={`${t.title}: bajarildi`} onChange={(e) => void toggle(t, e.target.checked)} />
                  <span className="td-list-main">
                    <span className="td-task-title">{t.title}</span>
                    <span className="td-muted td-task-meta">
                      {t.assignee ? t.assignee.fullName : 'Ijrochi belgilanmagan'}
                      {t.dueAt && <span className={overdue ? 'td-danger' : undefined}> · muddat {formatDate(t.dueAt)}</span>}
                      {t.completedAt ? ` · bajarildi ${formatDateTime(t.completedAt)}` : ''}
                      {t.createdBy ? ` · qo'ydi: ${t.createdBy.fullName}` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {canAdd && (
        <section className="td-section">
          <h3>Yangi vazifa</h3>
          <Input placeholder="Masalan: arxivdan kadastr ishi nusxasini olish" maxLength={300} value={title} aria-label="Vazifa matni" onChange={(e) => setTitle(e.target.value)} onPressEnter={() => void add()} />
          <div className="td-task-form">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Ijrochi"
              aria-label="Ijrochi"
              style={{ flex: 1, minWidth: 200 }}
              value={assigneeId}
              onChange={setAssigneeId}
              options={(assignees.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} · ${u.orgUnit.name}` }))}
            />
            <DatePicker placeholder="Muddat" format="DD.MM.YYYY" value={dueAt} onChange={setDueAt} disabledDate={(d) => d.isBefore(dayjs().startOf('day'))} />
            <Button type="primary" icon={<PlusOutlined />} disabled={!title.trim()} loading={saving} onClick={() => void add()}>
              Qo'shish
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
