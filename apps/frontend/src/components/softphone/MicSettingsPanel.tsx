import { App, Button, Select, Slider, Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { buildMicChain, DEFAULT_MIC, loadMicSettings, micConstraints, saveMicSettings, type MicSettings } from './micSettings';

type FlagKey = 'noiseSuppression' | 'echoCancellation' | 'autoGainControl' | 'noiseGate' | 'compressor' | 'limiter';

const BASIC: [FlagKey, string][] = [
  ['noiseSuppression', 'Shovqinni bostirish'],
  ['echoCancellation', 'Aks-sadoni bostirish'],
  ['autoGainControl', 'Kuchaytirishni avtomatik boshqarish'],
];

const ADVANCED: [FlagKey, string][] = [
  ['noiseGate', 'Shovqin chegarasi'],
  ['compressor', 'Kompressor'],
  ['limiter', 'Limiter'],
];

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

/** Softfon ichidagi "Mikrofon sozlamalari" bo'limi (prototip: Topbar → Mikrofon sozlamalari). */
export default function MicSettingsPanel() {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<MicSettings>(loadMicSettings);
  const [testing, setTesting] = useState(false);
  const meterRef = useRef<HTMLSpanElement>(null);

  const update = (patch: Partial<MicSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveMicSettings(next);
      return next;
    });

  // Tekshiruv haqiqiy mikrofonda, joriy sozlamalar bilan ishlaydi; sozlama o'zgarsa zanjir qayta quriladi
  useEffect(() => {
    if (!testing) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(settings) });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        const chain = buildMicChain(ctx, ctx.createMediaStreamSource(stream), settings);
        const pre = ctx.createAnalyser();
        const post = ctx.createAnalyser();
        chain.measure.connect(pre);
        chain.output.connect(post);
        const buf = new Float32Array(pre.fftSize);
        const loop = () => {
          chain.updateGate(rms(pre, buf));
          if (meterRef.current) meterRef.current.style.width = `${Math.min(100, rms(post, buf) * 400)}%`;
          frame = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        if (!cancelled) {
          message.error('Mikrofonga ruxsat berilmadi yoki qurilma topilmadi');
          setTesting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [testing, settings, message]);

  const flag = ([key, label]: [FlagKey, string]) => (
    <label key={key} className="setting-row">
      <span>{label}</span>
      <Switch size="small" checked={settings[key]} onChange={(checked) => update({ [key]: checked } as Partial<MicSettings>)} />
    </label>
  );

  return (
    <div className="mic-panel">
      <div>
        <div className="setting-row">
          <span>Mikrofon kuchaytirgichi</span>
          <span className="mono">{settings.gain}%</span>
        </div>
        <Slider
          min={0}
          max={200}
          step={5}
          value={settings.gain}
          onChange={(gain) => update({ gain })}
          ariaLabelForHandle="Mikrofon kuchaytirgichi"
          tooltip={{ formatter: (v) => `${v}%` }}
        />
      </div>
      <div className="setting-row">
        <span id="mic-channels">Kanallar</span>
        <Select
          aria-labelledby="mic-channels"
          size="small"
          style={{ width: 110 }}
          value={settings.channels}
          onChange={(channels) => update({ channels })}
          options={[
            { value: 1, label: 'Mono' },
            { value: 2, label: 'Stereo' },
          ]}
        />
      </div>
      {BASIC.map(flag)}

      <div className="panel-section-title">Kengaytirilgan audio</div>
      {ADVANCED.map(flag)}
      <div className="setting-row">
        <span id="mic-highpass">Past chastota filtri</span>
        <Select
          aria-labelledby="mic-highpass"
          size="small"
          style={{ width: 110 }}
          value={settings.highpassHz}
          onChange={(highpassHz) => update({ highpassHz })}
          options={[
            { value: 0, label: "O'chiq" },
            { value: 80, label: '80 Hz' },
            { value: 120, label: '120 Hz' },
            { value: 200, label: '200 Hz' },
          ]}
        />
      </div>

      {testing && (
        <div className="mic-test">
          <span>Gapiring — signal darajasi:</span>
          <div className="mic-meter" aria-hidden="true">
            <span ref={meterRef} />
          </div>
        </div>
      )}
      <div className="panel-actions">
        <Button type="primary" block onClick={() => setTesting((t) => !t)}>
          {testing ? "Tekshiruvni to'xtatish" : 'Mikrofonni tekshirish'}
        </Button>
        <Button
          onClick={() => {
            setTesting(false);
            setSettings(DEFAULT_MIC);
            saveMicSettings(DEFAULT_MIC);
          }}
        >
          Tiklash
        </Button>
      </div>
      <p className="panel-note">
        Sozlamalar shu brauzerda saqlanadi. WebRTC softfon ulanganda barcha qo'ng'iroqlarga qo'llanadi.
      </p>
    </div>
  );
}
