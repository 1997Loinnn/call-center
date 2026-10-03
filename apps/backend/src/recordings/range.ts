export interface ByteRange {
  start: number;
  end: number; // shu bayt ham kiradi
}

/**
 * "Range: bytes=start-end" sarlavhasini tahlil qiladi (brauzer pleyeri o'rtadan tinglaganda yuboradi).
 * null — sarlavha yo'q (butun fayl); 'invalid' — 416 qaytarish kerak. Bir nechta oraliq qo'llanmaydi.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';

  let start: number;
  let end: number;
  if (m[1] === '') {
    // "bytes=-500": oxirgi 500 bayt
    const suffix = Number(m[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
