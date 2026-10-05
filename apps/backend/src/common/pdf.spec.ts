import { buildTablePdf, textWidth, toWinAnsi, wrapText } from './pdf';

describe('pdf', () => {
  it("o'zbekcha tutuq belgilari va tirelarni WinAnsi'ga o'giradi", () => {
    expect(toWinAnsi("Bo'linma ʻ — «a»")).toEqual([66, 111, 39, 108, 105, 110, 109, 97, 32, 0x91, 32, 0x97, 32, 0xab, 97, 0xbb]);
    expect(toWinAnsi('Ж')).toEqual([63]);
    expect(toWinAnsi('a→b')).toEqual([97, 45, 62, 98]);
  });

  it("uzun matnni so'zlar bo'yicha qatorlarga bo'ladi", () => {
    const lines = wrapText("Fuqaro ariza bergan, belgilangan muddat o'tgan bo'lsa-da javob olinmagan", 120, 8.5);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 8.5)).toBeLessThanOrEqual(120);
    expect(wrapText('qisqa', 120, 8.5)).toEqual(['qisqa']);
  });

  it('matn kengligini AFM bo\'yicha hisoblaydi', () => {
    expect(textWidth('WW', 10)).toBeCloseTo(18.88);
    expect(textWidth('ii', 10, true)).toBeCloseTo(5.56);
  });

  it("xref ofsetlari obyektlarga to'g'ri ko'rsatadi va uzun jadval sahifalarga bo'linadi", () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Bo'linma ${i + 1} (qavslar) \\`, i * 3, null]);
    const pdf = buildTablePdf({ title: 'Hisobot', subtitle: '01.10.2026 — 03.10.2026', columns: ['Nomi', 'Soni', 'Izoh'], rows, footer: 'test' });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const entries = text.slice(xref).split('\n').slice(3).filter((line) => / 00000 n $/.test(line));
    entries.forEach((line, i) => expect(text.startsWith(`${i + 1} 0 obj\n`, Number(line.slice(0, 10)))).toBe(true));
    const count = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(count).toBeGreaterThan(1);
    // Qavs va teskari chiziq qochirilgan, matn oqimi ASCII
    expect(text).toContain('(qavslar\\) \\\\');
  });
});
