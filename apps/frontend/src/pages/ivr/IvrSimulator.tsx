import { AudioOutlined, ClockCircleOutlined, InfoCircleOutlined, PhoneOutlined, ReloadOutlined, SoundOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Input, Segmented } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../../api/client';
import type { IvrOverview, SimResult, SimStep } from '../../api/types';
import ToneTag from '../../components/ToneTag';
import { DIGITS, OUTCOME_LABELS, SCHEDULE_LABELS } from './ivr-labels';

const STEP_ICON: Record<SimStep['kind'], ReactNode> = {
  say: <SoundOutlined />,
  input: <AudioOutlined />,
  info: <InfoCircleOutlined />,
  warning: <WarningOutlined />,
};

/**
 * Qo'ng'iroq simulyatori: administrator IVR'ni PBX'ga yuklashdan oldin "qo'ng'iroq qilib" tekshiradi —
 * qaysi xabar eshittiriladi, qaysi tugma qayerga olib boradi, ish vaqtidan tashqari nima bo'ladi.
 */
export default function IvrSimulator({ data, onMenu }: { data: IvrOverview; onMenu: (menuId: number) => void }) {
  const [input, setInput] = useState<string[] | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<'now' | 'custom'>('now');
  // "Boshqa vaqt" standarti: eng yaqin ish kuni, soat 10:00 (ish vaqtidagi menyuni sinash uchun)
  const [at, setAt] = useState<Dayjs>(() => {
    let day = dayjs().hour(10).minute(0).second(0);
    for (let i = 0; i < 14; i++) {
      const weekday = day.day() === 0 ? 7 : day.day();
      if (data.schedule.days.includes(weekday) && !data.schedule.holidays.includes(day.format('YYYY-MM-DD'))) break;
      day = day.add(1, 'day');
    }
    return day;
  });
  const [ticketNo, setTicketNo] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  const run = async (next: string[]) => {
    setInput(next);
    setStatusText(null);
    try {
      const res = await api.post<SimResult>('/ivr/simulate', { input: next, at: mode === 'custom' ? at.toISOString() : undefined });
      setResult(res.data);
      setError(undefined);
      if (res.data.state.type === 'awaiting') onMenu(res.data.state.menuId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // IVR o'zgarsa (saqlangach) joriy qo'ng'iroq yangi tuzilma bo'yicha qayta hisoblanadi
  useEffect(() => {
    if (input) void run(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [result, statusText]);

  const checkStatus = async () => {
    if (!ticketNo.trim()) return;
    try {
      const res = await api.get<{ found: boolean; text: string }>('/ivr/ticket-status', { params: { number: ticketNo.trim() } });
      setStatusText(res.data.text);
    } catch (err) {
      setStatusText(errorMessage(err));
    }
  };

  const state = result?.state;
  const awaitingMenu = state?.type === 'awaiting' ? data.menus.find((m) => m.id === state.menuId) : undefined;
  const queue = state?.type === 'end' && state.queueId ? data.queues.find((q) => q.id === state.queueId) : undefined;

  return (
    <Card
      size="small"
      title="Qo'ng'iroq simulyatori"
      className="ivr-sim"
      extra={
        input && (
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void run([])}>
            Qaytadan
          </Button>
        )
      }
    >
      <div className="ivr-sim-time">
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as 'now' | 'custom')}
          options={[
            { value: 'now', label: 'Hozir' },
            { value: 'custom', label: 'Boshqa vaqt' },
          ]}
        />
        {mode === 'custom' && (
          <DatePicker size="small" showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD.MM.YYYY HH:mm" value={at} allowClear={false} onChange={(v) => v && setAt(v)} />
        )}
      </div>

      {!input ? (
        <div className="ivr-sim-start">
          <span className="panel-note">1097 ga qo'ng'iroq qilganday menyuni bosqichma-bosqich o'ting. Saqlangan (hali PBX'ga yuklanmagan) tuzilma ishlatiladi.</span>
          <Button type="primary" icon={<PhoneOutlined />} onClick={() => void run([])}>
            1097 ga qo'ng'iroq
          </Button>
        </div>
      ) : (
        <>
          {result && (
            <div className="ivr-sim-schedule">
              <ClockCircleOutlined /> {SCHEDULE_LABELS[result.schedule]}
            </div>
          )}
          <ol className="ivr-sim-log" ref={logRef} aria-live="polite">
            {result?.steps.map((step, i) => (
              <li key={i} className={`is-${step.kind}`}>
                <span className="ivr-sim-icon">{STEP_ICON[step.kind]}</span>
                <span>{step.kind === 'say' ? `«${step.text}»` : step.text}</span>
              </li>
            ))}
            {statusText && (
              <li className="is-say">
                <span className="ivr-sim-icon">
                  <SoundOutlined />
                </span>
                <span>«{statusText}»</span>
              </li>
            )}
          </ol>
          {error && <div className="ivr-sim-error">{error}</div>}

          {state?.type === 'awaiting' && (
            <>
              <div className="ivr-sim-menu">
                Menyu: <b>{awaitingMenu?.name}</b>
              </div>
              <div className="ivr-keypad" role="group" aria-label="Telefon tugmalari">
                {DIGITS.map((d) => {
                  const option = awaitingMenu?.options.find((o) => o.digit === d);
                  return (
                    <button key={d} type="button" className={`ivr-key${option ? ' has-option' : ''}`} title={option?.label} onClick={() => void run([...input, d])}>
                      <span className="ivr-key-digit">{d}</span>
                      {option && <span className="ivr-key-label">{option.label}</span>}
                    </button>
                  );
                })}
              </div>
              <Button block size="small" icon={<ClockCircleOutlined />} onClick={() => void run([...input, 'timeout'])}>
                Tugma bosmaslik ({awaitingMenu?.timeoutSeconds ?? 5} s)
              </Button>
            </>
          )}

          {state?.type === 'end' && (
            <div className="ivr-sim-end">
              <ToneTag tone={state.outcome === 'queue' ? 'teal' : state.outcome === 'hangup' ? 'grey' : 'violet'}>{OUTCOME_LABELS[state.outcome]}</ToneTag>
              <span>{state.text}</span>
              {queue && <span className="cell-sub">Navbatda {queue.members} ta operator biriktirilgan</span>}
              {state.outcome === 'ticket_status' && (
                <div className="ivr-sim-ticket">
                  <Input
                    size="small"
                    className="mono"
                    placeholder="1097-2026-000123"
                    value={ticketNo}
                    onChange={(e) => setTicketNo(e.target.value)}
                    onPressEnter={() => void checkStatus()}
                    aria-label="Murojaat raqami"
                  />
                  <Button size="small" onClick={() => void checkStatus()} disabled={!ticketNo.trim()}>
                    Terish #
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
