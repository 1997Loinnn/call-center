import { ExportFormat } from '@prisma/client';

export interface ReportSource {
  label: string;
  /** Hisobotda bo'lishi mumkin bo'lgan ustunlar; shablon ulardan tanlaydi (nomi bo'yicha) */
  columns: string[];
  formats: ExportFormat[];
  /** false: davr bo'yicha hisobot emas (masalan, bitta murojaatga javob xati) */
  periodic: boolean;
}

/**
 * Eksport shablonlari manbalari (F-REP-05). Shablon ustunlari shu ro'yxatdan tanlanadi,
 * hisobot generatori (ReportExportService) har bir manba uchun shu ustunlarni to'ldiradi.
 */
export const REPORT_SOURCES = {
  daily_summary: {
    label: "Kunlik ko'rsatkichlar",
    columns: ['Sana', 'Kiruvchi', 'Javob berildi', 'Javobsiz', "O'rt. kutish", "O'rt. suhbat", 'Murojaatlar', 'Joyida hal'],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: true,
  },
  operators: {
    label: 'Operatorlar samaradorligi',
    columns: ['Operator', 'SIP', "Qo'ng'iroq", "O'rt. suhbat", 'Murojaat', 'Joyida hal', 'Baho'],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: true,
  },
  topics: {
    label: 'Mavzular va toifalar',
    columns: ['Raqam', 'Toifa', 'Mavzu', 'Murojaatlar', 'Yopilgan', "Muddati o'tgan"],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: true,
  },
  org_units: {
    label: "Bo'linmalar kesimida ijro",
    columns: ["Bo'linma", 'Jami', 'Ijroda', "Muddati o'tgan", 'Yopildi', "O'rt. ijro kuni"],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: true,
  },
  overdue: {
    label: "Muddati o'tgan murojaatlar",
    columns: ['Raqam', 'Qabul qilingan', 'Mavzu', "Bo'linma", 'Ijrochi', 'Ijro muddati', 'Kechikish (kun)'],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: false,
  },
  billing: {
    label: "Qo'ng'iroqlar xarajati (billing)",
    columns: ["Yo'nalish", "Qo'ng'iroqlar", 'Daqiqa', "Summa (so'm)"],
    formats: [ExportFormat.XLSX, ExportFormat.CSV, ExportFormat.PDF],
    periodic: true,
  },
  tickets: {
    label: "Murojaatlar ro'yxati",
    columns: ['Raqam', 'Sana', 'Kanal', 'Fuqaro', 'Telefon', 'Turi', 'Toifa', 'Mavzu', 'Hudud', "Bo'linma", 'Ijrochi', 'Holat', 'Muddat'],
    formats: [ExportFormat.XLSX, ExportFormat.CSV],
    periodic: true,
  },
  calls: {
    label: "Qo'ng'iroqlar jurnali",
    columns: ['Vaqt', "Yo'nalish", 'Raqam', 'Navbat', 'Operator', 'Kutish', 'Suhbat', 'Natija', 'Murojaat', "Narx (so'm)"],
    formats: [ExportFormat.XLSX, ExportFormat.CSV],
    periodic: true,
  },
  ticket_answer: {
    label: 'Javob xati (murojaat kartasidan)',
    columns: ['{raqam}', '{fuqaro}', '{sana}', '{javob_matni}', '{ijrochi}', '{bolinma}'],
    formats: [ExportFormat.DOCX],
    periodic: false,
  },
} satisfies Record<string, ReportSource>;

export type ReportSourceKey = keyof typeof REPORT_SOURCES;

export const REPORT_SOURCE_KEYS = Object.keys(REPORT_SOURCES) as ReportSourceKey[];

export const isReportSource = (value: string): value is ReportSourceKey => value in REPORT_SOURCES;

/** Shablon ustunlari shablondagi tartibda; manbada yo'qlari tashlanadi, hech biri qolmasa — manbaning hammasi. */
export function resolveColumns(source: ReportSourceKey, columns: string[]): string[] {
  const available: string[] = REPORT_SOURCES[source].columns;
  const chosen = [...new Set(columns)].filter((column) => available.includes(column));
  return chosen.length > 0 ? chosen : available;
}
