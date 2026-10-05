import { zip } from './zip';

export type CellValue = string | number | null | undefined;

export interface Sheet {
  name: string;
  columns: string[];
  rows: CellValue[][];
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MAX_WIDTH = 60;

// XML 1.0 da ruxsat etilmagan boshqaruv belgilari (tab, yangi qatordan tashqari)
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel varaq nomi: 31 belgigacha, []:*?/\ belgilarsiz, takrorlanmas. */
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base = (sheet.name.replace(/[[\]:*?/\\]/g, ' ').trim() || `Varaq ${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} (${n})`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cell(ref: string, value: CellValue, style?: number): string {
  if (value === null || value === undefined || value === '') return '';
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  // Matn "inlineStr" sifatida yoziladi: "=" bilan boshlansa ham formula bo'lib bajarilmaydi
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function worksheet(sheet: Sheet): string {
  const widths = sheet.columns.map((title, c) => {
    const longest = sheet.rows.reduce((max, row) => Math.max(max, String(row[c] ?? '').length), title.length);
    return Math.min(MAX_WIDTH, Math.max(8, longest + 2));
  });
  const header = `<row r="1">${sheet.columns.map((title, c) => cell(`${columnName(c)}1`, title, 1)).join('')}</row>`;
  const body = sheet.rows
    .map((row, r) => `<row r="${r + 2}">${row.map((value, c) => cell(`${columnName(c)}${r + 2}`, value)).join('')}</row>`)
    .join('');
  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">` +
    // Sarlavha qatori qotirilgan: uzun jadvalni aylantirganda ustun nomlari ko'rinib turadi
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    (sheet.columns.length > 0 ? `<autoFilter ref="A1:${columnName(sheet.columns.length - 1)}${sheet.rows.length + 1}"/>` : '') +
    '</worksheet>'
  );
}

const STYLES =
  `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>';

/**
 * Bir yoki bir nechta varaqli XLSX fayl (Office Open XML). Sana va vaqt tayyor matn ko'rinishida
 * beriladi — Excel'ning mintaqa sozlamasidan qat'i nazar bir xil ko'rinadi.
 */
export function buildXlsx(sheets: Sheet[]): Buffer {
  const list = sheets.length > 0 ? sheets : [{ name: 'Varaq 1', columns: [], rows: [] }];
  const names = sheetNames(list);
  const files = [
    {
      name: '[Content_Types].xml',
      xml:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        list
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      xml: `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      xml:
        `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml:
        `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${list.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', xml: STYLES },
    ...list.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: worksheet(sheet) })),
  ];
  return zip(files.map((f) => ({ name: f.name, data: Buffer.from(f.xml, 'utf8') })));
}
