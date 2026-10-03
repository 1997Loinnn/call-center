import { AudioOutlined, LeftOutlined, PhoneOutlined, RightOutlined } from '@ant-design/icons';
import { App, Button, Input, Popover, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { AgentStatus, TelephonyInfo } from '../../api/types';
import { AGENT_STATUS_META } from '../../constants';
import { formatDuration } from '../../format';
import { useSocketEvent } from '../../realtime/socket';
import { TONE, type Tone } from '../../theme';
import MicSettingsPanel from './MicSettingsPanel';

// Operator qo'lda tanlaydigan holatlar; "Suhbatda" PBX hodisalaridan keladi
const SELECTABLE: AgentStatus[] = ['READY', 'BREAK', 'OFFLINE'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

interface LiveCall {
  pbxCallId: string;
  number: string;
  phase: 'ringing' | 'talking';
  since: number;
}

/** Yuqori paneldagi softfon (F-OP-03): holat, raqam terish va mikrofon sozlamalari. */
export default function SoftphoneButton() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'mic'>('main');
  const [status, setStatus] = useState<AgentStatus>('OFFLINE');
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState('');
  const [dialing, setDialing] = useState(false);
  const [info, setInfo] = useState<TelephonyInfo | null>(null);
  const [call, setCall] = useState<LiveCall | null>(null);
  const [now, setNow] = useState(Date.now());

  useSocketEvent<{ pbxCallId: string; callerNumber: string }>('call.ringing', (e) =>
    setCall({ pbxCallId: e.pbxCallId, number: e.callerNumber, phase: 'ringing', since: Date.now() }),
  );
  useSocketEvent<{ pbxCallId: string }>('call.answered', (e) =>
    setCall((c) => (c && c.pbxCallId === e.pbxCallId ? { ...c, phase: 'talking', since: Date.now() } : c)),
  );
  useSocketEvent<{ pbxCallId: string }>('call.ended', (e) => setCall((c) => (c && c.pbxCallId === e.pbxCallId ? null : c)));

  useEffect(() => {
    if (call?.phase !== 'talking') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call?.phase]);

  useEffect(() => {
    if (!open || info) return;
    api
      .get<TelephonyInfo>('/telephony/info')
      .then((r) => setInfo(r.data))
      .catch(() => undefined);
  }, [open, info]);

  const changeStatus = async (next: AgentStatus) => {
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

  const dial = async () => {
    if (!number.trim()) return;
    setDialing(true);
    try {
      await api.post('/telephony/originate', { number: number.trim() });
      message.success("Qo'ng'iroq boshlanmoqda");
      setOpen(false);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setDialing(false);
    }
  };

  let tone: Tone = AGENT_STATUS_META[status].tone;
  let title = "Qo'ng'iroq qilish";
  let sub = AGENT_STATUS_META[status].label;
  if (call?.phase === 'ringing') {
    tone = 'blue';
    title = "Kiruvchi qo'ng'iroq";
    sub = call.number;
  } else if (call?.phase === 'talking') {
    tone = 'blue';
    title = `Suhbatda · ${formatDuration(Math.max(0, Math.floor((now - call.since) / 1000)))}`;
    sub = call.number;
  }
  const t = TONE[tone];

  const main = (
    <div className="softphone-panel">
      <div className="softphone-panel-head">
        <span className="softphone-panel-title">Softfon</span>
        <Segmented<AgentStatus>
          size="small"
          value={status}
          disabled={saving}
          onChange={(v) => void changeStatus(v)}
          options={SELECTABLE.map((s) => ({
            value: s,
            label: (
              <span className="seg-label">
                <span className="tone-dot" style={{ background: TONE[AGENT_STATUS_META[s].tone].dot }} />
                {AGENT_STATUS_META[s].label}
              </span>
            ),
          }))}
        />
      </div>
      <div>
        <label htmlFor="softphone-number" className="field-label">
          Raqam terish
        </label>
        <div className="dial-row">
          <Input
            id="softphone-number"
            className="mono"
            inputMode="tel"
            placeholder="+998 __ ___ __ __"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onPressEnter={() => void dial()}
          />
          <Button type="primary" className="btn-call" loading={dialing} disabled={!number.trim()} onClick={() => void dial()}>
            Terish
          </Button>
        </div>
      </div>
      <div className="dialpad">
        {KEYS.map((k) => (
          <Button key={k} className="mono" onClick={() => setNumber((n) => n + k)} aria-label={`${k} raqami`}>
            {k}
          </Button>
        ))}
      </div>
      <span className="panel-note">
        {info ? `${info.driver === 'mock' ? 'Test rejimi (mock)' : 'UCM6510'} · SIP ${info.sipExtension ?? '—'}` : 'Telefoniya holati yuklanmoqda…'}
      </span>
      <Button block className="menu-row" onClick={() => setView('mic')}>
        <AudioOutlined />
        <span>Mikrofon sozlamalari</span>
        <RightOutlined />
      </Button>
    </div>
  );

  const mic = (
    <div className="softphone-panel">
      <div className="softphone-panel-head">
        <Button size="small" type="text" icon={<LeftOutlined />} aria-label="Orqaga" onClick={() => setView('main')} />
        <span className="softphone-panel-title" style={{ flex: 1 }}>
          Mikrofon sozlamalari
        </span>
      </div>
      <MicSettingsPanel />
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      arrow={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView('main');
      }}
      content={view === 'main' ? main : mic}
    >
      <button type="button" className="softphone-btn" aria-label="Softfon" style={{ borderColor: t.bg, background: `${t.bg}66` }}>
        <span className="softphone-dot" style={{ background: t.dot }}>
          <PhoneOutlined />
        </span>
        <span className="softphone-text">
          <span className="softphone-title">{title}</span>
          <span className="softphone-sub" style={{ color: t.fg }}>
            {sub}
          </span>
        </span>
      </button>
    </Popover>
  );
}
