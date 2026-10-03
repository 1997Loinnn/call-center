import { App, Badge, Select } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AgentStatus } from '../api/types';
import { AGENT_STATUS_META } from '../constants';

// Operator qo'lda tanlaydigan holatlar; "Suhbatda" PBX hodisalaridan avtomatik o'rnatiladi
const SELECTABLE: AgentStatus[] = ['READY', 'BREAK', 'OFFLINE'];
const BADGE: Record<AgentStatus, 'success' | 'processing' | 'warning' | 'default'> = {
  READY: 'success',
  ON_CALL: 'processing',
  WRAP_UP: 'warning',
  BREAK: 'warning',
  OFFLINE: 'default',
};

/** Softfon holati tugmasi (header). F-OP-03. */
export default function AgentStatusControl() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<AgentStatus>('OFFLINE');
  const [saving, setSaving] = useState(false);

  const change = async (next: AgentStatus) => {
    setSaving(true);
    try {
      await api.post('/telephony/agent-status', { status: next });
      setStatus(next);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      value={status}
      loading={saving}
      onChange={change}
      style={{ width: 170 }}
      options={SELECTABLE.map((s) => ({
        value: s,
        label: <Badge status={BADGE[s]} text={AGENT_STATUS_META[s].label} />,
      }))}
    />
  );
}
