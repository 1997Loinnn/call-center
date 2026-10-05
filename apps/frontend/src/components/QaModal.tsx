import { Alert, App, Input, Modal, Segmented, Skeleton } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { CallRow } from '../api/types';
import { formatDateTime, formatPhone } from '../format';
import { useAsync } from '../hooks/useAsync';
import ToneTag from './ToneTag';

interface ChecklistItem {
  item: string;
  max: number;
}

interface Evaluation {
  id: number;
  score: number;
  checklist: { item: string; max: number; score: number }[];
  comment: string | null;
  createdAt: string;
  evaluator: { id: number; fullName: string };
}

type Level = 'full' | 'partial' | 'none';

const scoreTone = (score: number) => (score >= 85 ? 'green' : score >= 60 ? 'amber' : 'red');

/** Suhbatni baholash varaqasi (F-QA-02): har bir band — to'liq, qisman yoki bajarilmagan. */
export default function QaModal({ call, readOnly = false, onClose, onSaved }: { call: CallRow; readOnly?: boolean; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const checklist = useAsync(() => api.get<ChecklistItem[]>('/qa/checklist').then((r) => r.data), []);
  const history = useAsync(() => api.get<Evaluation[]>(`/calls/${call.id}/evaluations`).then((r) => r.data), [call.id]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (checklist.data) setLevels(checklist.data.map(() => 'full'));
  }, [checklist.data]);

  const items = checklist.data ?? [];
  const scores = useMemo(() => items.map((c, i) => (levels[i] === 'full' ? c.max : levels[i] === 'partial' ? Math.round(c.max / 2) : 0)), [items, levels]);
  const max = items.reduce((s, c) => s + c.max, 0);
  const total = max > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / max) * 100) : 0;

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/calls/${call.id}/evaluations`, { scores, comment: comment.trim() || undefined });
      message.success(`Baholandi: ${total} ball`);
      onSaved();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${readOnly ? 'Suhbat baholari' : 'Suhbatni baholash'} · ${call.agent?.fullName ?? ''}`}
      okText={`Saqlash (${total} ball)`}
      cancelText="Yopish"
      okButtonProps={{ disabled: !items.length, style: readOnly ? { display: 'none' } : undefined }}
      confirmLoading={saving}
      onOk={() => void save()}
      onCancel={onClose}
      width={680}
      destroyOnHidden
    >
      <p className="cell-sub">
        {formatDateTime(call.startedAt)} · {formatPhone(call.callerNumber)} · yozuvni tinglab, har bir bandni belgilang
      </p>
      {checklist.error && <Alert type="error" showIcon message={checklist.error} />}
      {readOnly ? null : !checklist.data ? (
        <Skeleton active />
      ) : (
        <ol className="qa-list">
          {items.map((c, i) => (
            <li key={c.item}>
              <span className="qa-item">
                {c.item} <span className="cell-sub">· {c.max} ball</span>
              </span>
              <Segmented<Level>
                size="small"
                value={levels[i]}
                onChange={(v) => setLevels((l) => l.map((x, k) => (k === i ? v : x)))}
                options={[
                  { value: 'full', label: "To'liq" },
                  { value: 'partial', label: 'Qisman' },
                  { value: 'none', label: "Yo'q" },
                ]}
              />
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <Input.TextArea rows={2} maxLength={2000} placeholder="Izoh: nima yaxshi, nimani yaxshilash kerak" value={comment} onChange={(e) => setComment(e.target.value)} />
      )}
      {(history.data ?? []).length > 0 && (
        <div className="qa-history">
          <span className="panel-section-title">Avvalgi baholar</span>
          {history.data!.map((e) => (
            <div key={e.id} className="qa-history-row">
              <ToneTag tone={scoreTone(e.score)}>{e.score} ball</ToneTag>
              <span className="cell-sub">
                {formatDateTime(e.createdAt)} · {e.evaluator.fullName}
              </span>
              {e.comment && <span className="qa-history-comment">{e.comment}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
