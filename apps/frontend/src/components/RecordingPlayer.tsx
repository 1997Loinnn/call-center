import { CloseOutlined, DownloadOutlined, PauseOutlined, CaretRightOutlined } from '@ant-design/icons';
import { Button, Slider } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { CallRow } from '../api/types';
import { formatDateTime, formatDuration, formatPhone } from '../format';

const SPEEDS = [1, 1.5, 2];

/**
 * Qo'ng'iroq yozuvini tinglash (F-REC-05). Fayl backend'dan oqim bilan keladi (Range),
 * har bir tinglash va yuklab olish audit jurnaliga yoziladi.
 */
export default function RecordingPlayer({ call, onClose }: { call: CallRow; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(call.recording?.durationSeconds ?? 0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const src = `${api.defaults.baseURL}/calls/${call.id}/recording`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setFailed(false);
    setTime(0);
    setDuration(call.recording?.durationSeconds ?? 0);
    audio.src = src;
    audio.playbackRate = speed;
    // Tinglash tugma bosilgandan keyin boshlanadi, shuning uchun brauzer avtomatik ijroni bloklamaydi
    audio.play().catch(() => undefined);
    // Faqat boshqa yozuv tanlanganda qayta yuklanadi (tezlik o'zgarishi alohida qo'llanadi)
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const who = call.agent?.fullName ?? call.queue?.name ?? '';
  const number = formatPhone(call.direction === 'OUTBOUND' ? call.calledNumber : call.callerNumber);

  return (
    <section className="player" aria-label="Yozuv pleyeri">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <Button
        shape="circle"
        size="large"
        type="primary"
        className="player-toggle"
        icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
        aria-label={playing ? 'Pauza' : 'Tinglash'}
        onClick={toggle}
        disabled={failed}
      />
      <div className="player-main">
        <div className="player-head">
          <span className="player-title">
            <span className="mono">{number}</span>
            {who ? ` · ${who}` : ''} · {formatDateTime(call.startedAt)}
          </span>
          <span className="mono player-time">
            {failed ? "Yozuvni ochib bo'lmadi" : `${formatDuration(Math.floor(time))} / ${formatDuration(Math.round(duration))}`}
          </span>
        </div>
        <Slider
          className="player-progress"
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={time}
          disabled={failed}
          ariaLabelForHandle="Yozuvdagi o'rin"
          tooltip={{ formatter: (v) => formatDuration(Math.floor(v ?? 0)) }}
          onChange={(v) => {
            if (audioRef.current) audioRef.current.currentTime = v;
            setTime(v);
          }}
        />
      </div>
      <Button className="player-btn mono" onClick={cycleSpeed} aria-label={`Tezlik: ${speed}×`}>
        {speed}×
      </Button>
      <Button className="player-btn" icon={<DownloadOutlined />} href={`${src}?download=1`} aria-label="Yozuvni yuklab olish">
        Yuklab olish
      </Button>
      <Button className="player-btn" type="text" icon={<CloseOutlined />} aria-label="Pleyerni yopish" onClick={onClose} />
    </section>
  );
}
