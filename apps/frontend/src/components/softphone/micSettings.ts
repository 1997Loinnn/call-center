/**
 * Mikrofon sozlamalari: shu brauzerda saqlanadi.
 * micConstraints() — getUserMedia uchun; buildMicChain() — Web Audio ishlov berish zanjiri.
 * WebRTC softfon ulanganda ham aynan shu ikki funksiya ishlatiladi.
 */
export interface MicSettings {
  gain: number; // foiz, 0–200
  channels: 1 | 2;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseGate: boolean;
  highpassHz: 0 | 80 | 120 | 200;
  compressor: boolean;
  limiter: boolean;
}

export const DEFAULT_MIC: MicSettings = {
  gain: 100,
  channels: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: false,
  noiseGate: false,
  highpassHz: 0,
  compressor: false,
  limiter: false,
};

const STORAGE_KEY = 'cc.mic-settings.v1';

export function loadMicSettings(): MicSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_MIC, ...(JSON.parse(raw) as Partial<MicSettings>) } : DEFAULT_MIC;
  } catch {
    return DEFAULT_MIC;
  }
}

export function saveMicSettings(settings: MicSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Xususiy rejim yoki bloklangan saqlash: sozlama faqat shu sessiyada qoladi
  }
}

export function micConstraints(s: MicSettings): MediaTrackConstraints {
  return {
    channelCount: s.channels,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
  };
}

/** Shovqin chegarasi ostidagi signal o'chiriladi (RMS, 0–1 shkalada). */
export const NOISE_GATE_THRESHOLD = 0.012;

export interface MicChain {
  output: AudioNode;
  /** Shovqin chegarasidan oldingi nuqta: darajani o'lchash shu yerdan olinadi. */
  measure: AudioNode;
  /** Shovqin chegarasi yoqilgan bo'lsa — joriy RMS darajasiga qarab ochiladi/yopiladi. */
  updateGate: (rms: number) => void;
}

export function buildMicChain(ctx: AudioContext, input: AudioNode, s: MicSettings): MicChain {
  let node: AudioNode = input;
  const connect = (next: AudioNode) => {
    node.connect(next);
    node = next;
  };

  const gain = ctx.createGain();
  gain.gain.value = s.gain / 100;
  connect(gain);

  if (s.highpassHz) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = s.highpassHz;
    connect(hp);
  }
  if (s.compressor) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -24;
    c.ratio.value = 4;
    c.attack.value = 0.003;
    c.release.value = 0.25;
    connect(c);
  }
  if (s.limiter) {
    const l = ctx.createDynamicsCompressor();
    l.threshold.value = -3;
    l.knee.value = 0;
    l.ratio.value = 20;
    l.attack.value = 0.001;
    l.release.value = 0.05;
    connect(l);
  }

  const measure = node;
  const gate = ctx.createGain();
  connect(gate);
  const updateGate = (rms: number) => {
    if (!s.noiseGate) return;
    const target = rms < NOISE_GATE_THRESHOLD ? 0 : 1;
    gate.gain.setTargetAtTime(target, ctx.currentTime, target ? 0.005 : 0.08);
  };

  return { output: node, measure, updateGate };
}
