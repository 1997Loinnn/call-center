import type { CellValue } from './xlsx';

export const PDF_MIME = 'application/pdf';

export interface PdfTable {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: CellValue[][];
  /** Har sahifa pastida chiqadi (masalan, yaratilgan vaqt) */
  footer?: string;
  /** Uzun matn qisqartirilmaydi, katakda bir necha qatorga bo'linadi (murojaat kartasi) */
  wrap?: boolean;
  /** Ustunlarning nisbiy kengligi; berilmasa — mazmun bo'yicha */
  columnWeights?: number[];
}

// Helvetica va Helvetica-Bold harf kengliklari (Adobe AFM, 1000 birlik), 32..126 belgilar
// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// WinAnsiEncoding'dagi Latin-1 dan tashqari belgilar (o'zbekcha tutuq belgisi ʻ ham shu yerga)
const WIN_ANSI: Record<number, number> = {
  0x2014: 0x97, 0x2013: 0x96, 0x2018: 0x91, 0x2019: 0x92, 0x02bb: 0x91, 0x02bc: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2026: 0x85, 0x2022: 0x95, 0x2116: 0x4e, 0x20ac: 0x80,
};

/** Unicode matnni WinAnsi baytlariga o'giradi; kodlanmaydigan belgi "?" bo'ladi. */
export function toWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) bytes.push(code);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else if (WIN_ANSI[code] !== undefined) bytes.push(WIN_ANSI[code]);
    else if (code === 0x2192) bytes.push(45, 62); // → o'rniga "->"
    else if (code === 0x2190) bytes.push(60, 45); // ← o'rniga "<-"
    else if (code === 9 || code === 10 || code === 13) bytes.push(32);
    else bytes.push(63);
  }
  return bytes;
}

const charWidth = (byte: number, bold: boolean): number => {
  if (byte >= 32 && byte <= 126) return (bold ? HELVETICA_BOLD : HELVETICA)[byte - 32];
  if (byte === 0x97 || byte === 0x85) return 1000;
  if (byte === 0x91 || byte === 0x92) return bold ? 278 : 222;
  return 556;
};

export function textWidth(text: string, size: number, bold = false): number {
  return (toWinAnsi(text).reduce((sum, b) => sum + charWidth(b, bold), 0) * size) / 1000;
}

/** PDF satr literal: ( ) \ qochiriladi, 127 dan katta baytlar sakkizlik kod bilan — oqim ASCII bo'lib qoladi. */
function pdfString(text: string): string {
  return `(${toWinAnsi(text)
    .map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b > 126 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b)))
    .join('')})`;
}

/** Ustunga sig'magan matn "…" bilan qisqartiriladi. */
function fit(text: string, width: number, size: number, bold: boolean): string {
  if (textWidth(text, size, bold) <= width) return text;
  let cut = text;
  while (cut.length > 0 && textWidth(`${cut}…`, size, bold) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Matnni berilgan kenglikka so'zlar bo'yicha qatorlarga bo'ladi; juda uzun so'z belgilar bo'yicha kesiladi. */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (textWidth(rest, size, bold) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
}

const PAGE_W = 842; // A4, albom
const PAGE_H = 595;
const MARGIN = 36;
const FONT = 8.5;
const ROW_H = 16;
const LINE_H = 11;
const PAD = 4;

const display = (value: CellValue): string =>
  value === null || value === undefined ? '' : typeof value === 'number' ? value.toLocaleString('ru-RU').replace(/ /g, ' ') : String(value);

/**
 * Bitta jadvalli hisobot (A4 albom, Helvetica). Tashqi kutubxonasiz: hisobotlarni PDF formatida
 * yuklab olish uchun yetarli; murakkab maketlar (logotip, imzo) uchun keyin shablonlash qo'shiladi.
 */
export function buildTablePdf(table: PdfTable): Buffer {
  const width = PAGE_W - MARGIN * 2;
  const cells = table.rows.map((row) => table.columns.map((_, c) => display(row[c])));
  const numeric = table.columns.map((_, c) => table.rows.length > 0 && table.rows.every((row) => row[c] === null || row[c] === undefined || typeof row[c] === 'number'));

  // Ustun kengligi: berilgan nisbat yoki sarlavha va eng uzun qiymat (cheklangan) bo'yicha, keyin sahifa eniga moslanadi
  const natural = table.columnWeights
    ? table.columnWeights
    : table.columns.map((title, c) =>
        Math.min(260, Math.max(textWidth(title, FONT, true), ...cells.slice(0, 500).map((row) => textWidth(row[c], FONT))) + PAD * 2),
      );
  const total = natural.reduce((a, b) => a + b, 0) || 1;
  const widths = natural.map((w) => (w * width) / total);

  // Har katak qatorlari va qator balandligi
  const lines = cells.map((row) => row.map((value, c) => (table.wrap ? wrapText(value, widths[c] - PAD * 2, FONT) : [fit(value, widths[c] - PAD * 2, FONT, false)])));
  const heights = lines.map((row) => Math.max(1, ...row.map((l) => l.length)) * LINE_H + (ROW_H - LINE_H));

  const pages: string[] = [];
  const firstTop = PAGE_H - MARGIN - (table.subtitle ? 44 : 30);
  const usable = (top: number) => top - MARGIN - 20 - ROW_H;
  const chunks: number[][] = [];
  let current: number[] = [];
  let available = usable(firstTop);
  heights.forEach((h, i) => {
    if (current.length > 0 && h > available) {
      chunks.push(current);
      current = [];
      available = usable(PAGE_H - MARGIN);
    }
    current.push(i);
    available -= h;
  });
  chunks.push(current);

  chunks.forEach((rows, pageIndex) => {
    const ops: string[] = [];
    const text = (x: number, y: number, value: string, size: number, bold = false, gray = false) =>
      ops.push(`BT ${gray ? '0.37 0.40 0.45 rg' : '0.08 0.10 0.12 rg'} /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`);

    let top = PAGE_H - MARGIN;
    if (pageIndex === 0) {
      text(MARGIN, top - 14, table.title, 14, true);
      if (table.subtitle) text(MARGIN, top - 30, table.subtitle, 9, false, true);
      top = firstTop;
    }
    // Sarlavha qatori
    ops.push(`0.95 0.96 0.97 rg ${MARGIN} ${(top - ROW_H).toFixed(2)} ${width} ${ROW_H} re f`);
    let x = MARGIN;
    table.columns.forEach((title, c) => {
      const label = fit(title, widths[c] - PAD * 2, FONT, true);
      const tx = numeric[c] ? x + widths[c] - PAD - textWidth(label, FONT, true) : x + PAD;
      text(tx, top - ROW_H + 5, label, FONT, true);
      x += widths[c];
    });
    top -= ROW_H;
    // Qatorlar
    rows.forEach((r) => {
      x = MARGIN;
      lines[r].forEach((cellLines, c) => {
        cellLines.forEach((label, j) => {
          const tx = numeric[c] ? x + widths[c] - PAD - textWidth(label, FONT) : x + PAD;
          text(tx, top - ROW_H + 5 - j * LINE_H, label, FONT);
        });
        x += widths[c];
      });
      ops.push(`0.89 0.90 0.92 RG 0.5 w ${MARGIN} ${(top - heights[r]).toFixed(2)} m ${MARGIN + width} ${(top - heights[r]).toFixed(2)} l S`);
      top -= heights[r];
    });
    if (cells.length === 0) text(MARGIN + PAD, top - ROW_H + 5, "Tanlangan davr uchun ma'lumot yo'q", FONT, false, true);
    const pageLabel = `${pageIndex + 1} / ${chunks.length}`;
    text(PAGE_W - MARGIN - textWidth(pageLabel, 8), MARGIN - 16, pageLabel, 8, false, true);
    if (table.footer) text(MARGIN, MARGIN - 16, table.footer, 8, false, true);
    pages.push(ops.join('\n'));
  });

  // Obyektlar: 1 katalog, 2 sahifalar, 3-4 shriftlar, keyin har sahifa uchun sahifa + mazmun oqimi
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, i) => {
    const pageId = pageIds[i];
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, 'latin1');
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
