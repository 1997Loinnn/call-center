import { TicketChannel, TicketStatus, TicketType } from '@prisma/client';
import { csvCell, EXPORT_COLUMNS, formatExportPhone, ticketsToCsv, type ExportRow } from './ticket-export';

describe('csvCell', () => {
  it("qo'shtirnoqni ikkilantiradi", () => {
    expect(csvCell('Uy "Bahor"')).toBe('"Uy ""Bahor"""');
  });

  it('formula sifatida bajariladigan qiymatni matnga aylantiradi', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('-cmd')).toBe('"\'-cmd"');
  });

  it('telefon va manfiy sonni o\'zgartirmaydi', () => {
    expect(csvCell('+998 90 123 45 67')).toBe('"+998 90 123 45 67"');
    expect(csvCell('-5')).toBe('"-5"');
  });
});

describe('formatExportPhone', () => {
  it("O'zbekiston raqamini bo'sh joy bilan ajratadi", () => {
    expect(formatExportPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('boshqa raqamni o\'zgarishsiz qaytaradi', () => {
    expect(formatExportPhone('1097')).toBe('1097');
  });
});

describe('ticketsToCsv', () => {
  const row: ExportRow = {
    number: '1097-2026-000005',
    createdAt: new Date('2026-10-03T10:45:00Z'),
    channel: TicketChannel.PHONE,
    type: TicketType.INFO,
    status: TicketStatus.ROUTED,
    subject: 'Kadastr pasportidagi xatoni tuzatish',
    dueAt: null,
    category: { nameUz: 'Kadastr pasporti' },
    region: { nameUz: 'Toshkent shahri' },
    assignedOrgUnit: { name: 'DKP Toshkent shahri boshqarmasi' },
    assignee: null,
    citizen: { phone: '+998901234567', fullName: 'Test Fuqaro' },
  };

  it("BOM, sarlavha va ';' ajratgich bilan quradi; vaqt Toshkent bo'yicha", () => {
    const csv = ticketsToCsv([row]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header.split(';')).toHaveLength(EXPORT_COLUMNS.length);
    expect(line).toContain('"03.10.2026 15:45"');
    expect(line).toContain('"Yo\'naltirildi"');
    expect(line).toContain('"+998 90 123 45 67"');
  });
});
