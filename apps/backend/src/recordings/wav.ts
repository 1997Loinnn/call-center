/**
 * Mock rejim uchun sintetik qo'ng'iroq yozuvi: 8 kHz, 16-bit, mono PCM WAV.
 * Ovoz o'rniga navbatma-navbat ikki "so'zlovchi" ohangi va pauzalar — pleyer,
 * oqim (Range) va o'rtadan tinglashni UCM6510siz sinash uchun.
 */
export function syntheticWav(seconds: number, sampleRate = 8000): Buffer {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt bo'lagi hajmi
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // bayt/soniya
  buf.writeUInt16LE(2, 32); // blok hajmi
  buf.writeUInt16LE(16, 34); // bit/namuna
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  const PHRASE = 2.4; // 1.6 s "gap" + 0.8 s pauza
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const phrase = t % PHRASE;
    const envelope = phrase < 1.6 ? Math.sin((Math.PI * phrase) / 1.6) : 0;
    const freq = Math.floor(t / PHRASE) % 2 === 0 ? 220 : 180;
    const value = envelope * 0.18 * (Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(2 * Math.PI * freq * 2.01 * t));
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  return buf;
}
