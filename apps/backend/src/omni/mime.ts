/**
 * Kiruvchi xatni (RFC 822 / MIME) o'qish: pochta serveri xatni xom holda yuboradi
 * (masalan, Postfix pipe → curl), bu yerda jo'natuvchi, mavzu, matn va ilovalar nomi olinadi.
 */
export interface ParsedEmail {
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: { fileName: string; mimeType: string; sizeBytes: number }[];
}

type Headers = Map<string, string>;

function decodeBytes(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase() === 'utf8' ? 'utf-8' : charset).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

/** Quoted-printable → baytlar. */
function qpBytes(value: string, header = false): Buffer {
  const text = header ? value.replace(/_/g, ' ') : value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(text[i], 'utf8'));
    }
  }
  return Buffer.from(bytes);
}

/** RFC 2047: "=?UTF-8?B?...?=" va "=?windows-1251?Q?...?=" so'zlari. */
export function decodeWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) =>
      decodeBytes(enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : qpBytes(data, true), charset.split('*')[0]),
    );
}

/** Ba'zi pochta dasturlari sarlavhaga UTF-8 ni kodlamasdan yozadi: "binary" qatordan qayta o'qiymiz. */
function rawHeader(value: string): string {
  return /[-ÿ]/.test(value) ? Buffer.from(value, 'binary').toString('utf8') : value;
}

function parseHeaders(block: string): Headers {
  const headers: Headers = new Map();
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    if (!headers.has(key)) headers.set(key, line.slice(i + 1).trim());
  }
  return headers;
}

/** "text/plain; charset=utf-8; name=..." → { type, params } */
function parseParams(value: string | undefined): { value: string; params: Record<string, string> } {
  const [head, ...rest] = (value ?? '').split(';');
  const params: Record<string, string> = {};
  for (const part of rest) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    let v = part.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    // RFC 2231: filename*=UTF-8''%D0%...
    if (key.endsWith('*')) {
      const m = /^([^']*)'[^']*'(.*)$/.exec(v);
      if (m) v = decodeBytes(Buffer.from(unescapePercent(m[2])), m[1] || 'utf-8');
      params[key.slice(0, -1)] = v;
    } else {
      params[key] = decodeWords(rawHeader(v));
    }
  }
  return { value: head.trim().toLowerCase(), params };
}

function unescapePercent(value: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(value.charCodeAt(i));
  }
  return bytes;
}

function splitMessage(raw: string): { headers: Headers; body: string } {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { headers: parseHeaders(raw), body: '' };
  return { headers: parseHeaders(raw.slice(0, match.index)), body: raw.slice(match.index + match[0].length) };
}

function decodeBody(body: string, headers: Headers): Buffer {
  const encoding = (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase();
  if (encoding === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  if (encoding === 'quoted-printable') return qpBytes(body);
  return Buffer.from(body, 'binary');
}

/** HTML'dan oddiy matn (faqat text/html qism bo'lsa). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Collected {
  plain: string | null;
  html: string | null;
  attachments: ParsedEmail['attachments'];
}

function walk(raw: string, out: Collected, depth = 0): void {
  const { headers, body } = splitMessage(raw);
  const type = parseParams(headers.get('content-type') ?? 'text/plain');
  const disposition = parseParams(headers.get('content-disposition'));
  const fileName = disposition.params.filename ?? type.params.name;

  if (type.value.startsWith('multipart/') && type.params.boundary && depth < 10) {
    const boundary = `--${type.params.boundary}`;
    const parts = body.split(boundary).slice(1);
    for (const part of parts) {
      if (part.startsWith('--')) break;
      walk(part.replace(/^\r?\n/, ''), out, depth + 1);
    }
    return;
  }
  if (type.value === 'message/rfc822' && depth < 10) {
    out.attachments.push({ fileName: fileName ?? 'xat.eml', mimeType: type.value, sizeBytes: Buffer.byteLength(body, 'binary') });
    return;
  }
  const bytes = decodeBody(body, headers);
  if (disposition.value === 'attachment' || (fileName && !type.value.startsWith('text/'))) {
    out.attachments.push({ fileName: fileName ?? 'ilova', mimeType: type.value, sizeBytes: bytes.length });
    return;
  }
  const text = decodeBytes(bytes, type.params.charset ?? 'utf-8');
  if (type.value === 'text/html') out.html ??= text;
  else if (type.value === 'text/plain' || type.value === '') out.plain ??= text;
}

/** Javob xatidagi iqtibosni (">" bilan boshlanadigan va "... yozdi:" dan keyingi qism) olib tashlaydi. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex(
    (line, i) =>
      /^-{2,}\s*(Original Message|Исходное сообщение|Asl xabar)/i.test(line) ||
      (i > 0 && /^(On |В |Вт|Пн|Ср|Чт|Пт|Сб|Вс).*(wrote|написал[а]?):\s*$/i.test(line)) ||
      (/^>/.test(line.trim()) && lines.slice(i).every((l) => !l.trim() || /^>/.test(l.trim()))),
  );
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim();
  return kept || text.trim();
}

const ids = (value: string | undefined): string[] => (value ? value.match(/<[^>]+>/g) ?? [] : []);

export function parseEmail(raw: string): ParsedEmail {
  // Xom xat baytlari "binary" (latin1) qatorida: har qism o'z kodirovkasi bilan alohida o'qiladi
  const { headers } = splitMessage(raw);
  const out: Collected = { plain: null, html: null, attachments: [] };
  walk(raw, out);
  const fromRaw = decodeWords(rawHeader(headers.get('from') ?? ''));
  const nameMatch = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(fromRaw);
  const text = out.plain ?? (out.html ? htmlToText(out.html) : '');
  return {
    from: (nameMatch ? nameMatch[2] : fromRaw).trim().toLowerCase(),
    fromName: nameMatch?.[1]?.trim() || null,
    subject: decodeWords(rawHeader(headers.get('subject') ?? '')).trim(),
    text: stripQuoted(text),
    messageId: ids(headers.get('message-id'))[0] ?? null,
    inReplyTo: ids(headers.get('in-reply-to'))[0] ?? null,
    references: ids(headers.get('references')),
    attachments: out.attachments,
  };
}
