import { inflateRawSync } from 'node:zlib';
import { buildXlsx, columnName, escapeXml } from './xlsx';
import { crc32, zip } from './zip';

/** Test uchun ZIP o'quvchi: markaziy katalog bo'yicha fayllarni ochadi va CRC'ni tekshiradi. */
function unzip(archive: Buffer): Map<string, string> {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = archive.readUInt16LE(end + 10);
  let pos = archive.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(pos)).toBe(0x02014b50);
    const crc = archive.readUInt32LE(pos + 16);
    const compressedSize = archive.readUInt32LE(pos + 20);
    const nameLength = archive.readUInt16LE(pos + 28);
    const localOffset = archive.readUInt32LE(pos + 42);
    const name = archive.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const start = localOffset + 30 + localNameLength;
    const data = inflateRawSync(archive.subarray(start, start + compressedSize));
    expect(crc32(data)).toBe(crc);
    files.set(name, data.toString('utf8'));
    pos += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it("CRC-32 standart nazorat qiymatini beradi", () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it("arxivdagi fayllar o'zgarishsiz ochiladi", () => {
    const files = unzip(zip([{ name: 'a.txt', data: Buffer.from('salom') }, { name: 'dir/b.xml', data: Buffer.from('<x/>') }]));
    expect(files.get('a.txt')).toBe('salom');
    expect(files.get('dir/b.xml')).toBe('<x/>');
  });
});

describe('xlsx', () => {
  it('ustun nomlari Excel tartibida', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('XML maxsus va boshqaruv belgilarini tozalaydi', () => {
    expect(escapeXml('a<b>&"c"\u0001')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it("varaqlar, sarlavha va qiymatlarni yozadi", () => {
    const files = unzip(
      buildXlsx([
        { name: 'Murojaatlar', columns: ['Raqam', 'Soni'], rows: [['1097-2026-000001', 5], ['=HYPERLINK("x")', null]] },
        { name: 'Murojaatlar', columns: ['Bo\'linma'], rows: [] },
      ]),
    );
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']),
    );
    // Takroriy varaq nomi o'zgartiriladi (Excel bir xil nomli varaqli faylni ochmaydi)
    expect(files.get('xl/workbook.xml')).toContain('name="Murojaatlar (2)"');
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Raqam</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>5</v></c>');
    // Formulaga o'xshash matn formula sifatida emas, matn sifatida yoziladi
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t></is></c>');
    expect(sheet).not.toContain('<f>');
  });
});
