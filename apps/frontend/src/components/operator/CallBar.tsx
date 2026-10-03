import { CustomerServiceOutlined, PhoneOutlined } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import { useEffect, useState } from 'react';
import type { TelephonyInfo } from '../../api/types';
import { formatDuration, formatPhone } from '../../format';
import ToneTag from '../ToneTag';

export interface ActiveCall {
  pbxCallId: string;
  callerNumber: string;
  state: 'ringing' | 'talking' | 'ended';
  talkStartedAt?: number;
  endedAt?: number;
}

const seconds = (from?: number, to?: number) => (from ? Math.max(0, Math.floor(((to ?? Date.now()) - from) / 1000)) : 0);

/**
 * Qo'ng'iroq holati paneli. Ovozni hozircha MicroSIP boshqaradi, shuning uchun bu yerda
 * qabul qilish/kutish tugmalari yo'q — faqat PBX hodisalaridan kelgan holat ko'rsatiladi.
 */
export default function CallBar({ call, info, onSimulate, onDismiss }: {
  call: ActiveCall | null;
  info: TelephonyInfo | null;
  onSimulate: (number: string) => void;
  onDismiss: () => void;
}) {
  const [testNumber, setTestNumber] = useState('+998 90 123 45 67');
  const [, setTick] = useState(0);

  useEffect(() => {
    if (call?.state !== 'talking') return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [call?.state]);

  if (!call) {
    return (
      <section className="call-bar" aria-label="Qo'ng'iroq holati">
        <span className="call-bar-icon">
          <CustomerServiceOutlined />
        </span>
        <span className="call-bar-text">
          <span className="call-bar-title">Qo'ng'iroq kutilmoqda</span>
          <span className="call-bar-sub">
            {info
              ? `SIP ${info.sipExtension ?? '—'} · ${info.driver === 'mock' ? 'test rejimi' : 'UCM6510'} · ovoz MicroSIP orqali, kartalar shu yerda`
              : 'Telefoniya ma\'lumoti yuklanmoqda…'}
          </span>
        </span>
        {info?.driver === 'mock' && (
          <Space.Compact className="call-bar-test">
            <Input aria-label="Test qo'ng'irog'i raqami" className="mono" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} />
            <Button icon={<PhoneOutlined />} onClick={() => onSimulate(testNumber)}>
              Test qo'ng'iroq
            </Button>
          </Space.Compact>
        )}
      </section>
    );
  }

  if (call.state === 'ringing') {
    return (
      <section className="call-bar is-ringing" aria-label="Kiruvchi qo'ng'iroq" aria-live="polite">
        <span className="call-pulse" />
        <span className="call-bar-text">
          <span className="call-bar-label">Kiruvchi qo'ng'iroq</span>
          <span className="call-bar-number mono">{formatPhone(call.callerNumber)}</span>
          <span className="call-bar-sub">Fuqaro kartasi raqam bo'yicha ochildi. MicroSIP'da qabul qiling.</span>
        </span>
      </section>
    );
  }

  if (call.state === 'talking') {
    return (
      <section className="call-bar is-talking" aria-label="Faol qo'ng'iroq">
        <span className="call-bar-text">
          <ToneTag tone="blue">Suhbatda</ToneTag>
          <span className="call-bar-number mono">{formatPhone(call.callerNumber)}</span>
        </span>
        <span className="call-bar-timer mono">{formatDuration(seconds(call.talkStartedAt))}</span>
      </section>
    );
  }

  return (
    <section className="call-bar is-ended" aria-label="Qo'ng'iroq yakunlandi">
      <span className="call-bar-text">
        <span className="call-bar-row">
          <ToneTag tone="teal">Yakunlandi</ToneTag>
          <span className="mono call-bar-sub">
            {formatPhone(call.callerNumber)}
            {call.talkStartedAt ? ` · ${formatDuration(seconds(call.talkStartedAt, call.endedAt))}` : ''}
          </span>
        </span>
        <span className="call-bar-sub">Murojaatni saqlang — u shu qo'ng'iroq yozuviga bog'lanadi.</span>
      </span>
      <Button onClick={onDismiss}>Yopish</Button>
    </section>
  );
}
