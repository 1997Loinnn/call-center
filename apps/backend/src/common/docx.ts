import { escapeXml } from './xlsx';
import { zip } from './zip';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocxParagraph {
  text: string;
  bold?: boolean;
  /** Shrift o'lchami, pt (standart 14 — rasmiy xat) */
  size?: number;
  align?: 'left' | 'center' | 'right' | 'both';
  /** Xatboshidan keyingi bo'shliq, pt */
  after?: number;
}

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FONT = 'Times New Roman';

function paragraph(p: DocxParagraph): string {
  const size = (p.size ?? 14) * 2; // half-point
  const run = (text: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>${p.bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  // Xat ichidagi yangi qatorlar <w:br/> bilan
  const runs = p.text.split(/\r?\n/).map(run).join('<w:r><w:br/></w:r>');
  return `<w:p><w:pPr><w:jc w:val="${p.align ?? 'left'}"/><w:spacing w:after="${(p.after ?? 6) * 20}"/></w:pPr>${runs}</w:p>`;
}

/** Oddiy Word hujjati (A4, rasmiy xat maydonlari): javob xati va shunga o'xshash bir sahifali hujjatlar uchun. */
export function buildDocx(paragraphs: DocxParagraph[]): Buffer {
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${NS}"><w:body>` +
    paragraphs.map(paragraph).join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  const files = [
    {
      name: '[Content_Types].xml',
      xml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      xml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    { name: 'word/document.xml', xml: document },
  ];
  return zip(files.map((f) => ({ name: f.name, data: Buffer.from(f.xml, 'utf8') })));
}
