import { decodeWords, htmlToText, parseEmail, stripQuoted } from './mime';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
// Xom xat "binary" qator ko'rinishida keladi (controller Buffer'ni latin1 bilan o'qiydi)
const raw = (s: string) => Buffer.from(s.replace(/\n/g, '\r\n'), 'utf8').toString('binary');

describe('decodeWords', () => {
  it('B va Q kodlangan so\'zlar, ketma-ket so\'zlar orasidagi bo\'shliq olinadi', () => {
    expect(decodeWords(`=?UTF-8?B?${b64("Ko'chmas mulk")}?= =?UTF-8?B?${b64(' hujjati')}?=`)).toBe("Ko'chmas mulk hujjati");
    expect(decodeWords('=?utf-8?Q?=D0=97=D0=B0=D1=8F=D0=B2=D0=BA=D0=B0_=E2=84=96?=')).toBe('Заявка №');
  });
});

describe('parseEmail', () => {
  it('oddiy UTF-8 xat (8bit), javob zanjiri sarlavhalari bilan', () => {
    const email = parseEmail(
      raw(`From: "Aziz Karimov" <Aziz.Karimov@Mail.uz>
To: 1097@kadastr.uz
Subject: =?UTF-8?B?${b64('Ariza holati')}?=
Message-ID: <abc@mail.uz>
In-Reply-To: <first@kadastr.uz>
References: <root@kadastr.uz> <first@kadastr.uz>
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

Assalomu alaykum, arizam qachon ko'rib chiqiladi?

On Mon, 5 Oct 2026 operator wrote:
> Hurmatli fuqaro
`),
    );
    expect(email).toEqual(
      expect.objectContaining({
        from: 'aziz.karimov@mail.uz',
        fromName: 'Aziz Karimov',
        subject: 'Ariza holati',
        messageId: '<abc@mail.uz>',
        inReplyTo: '<first@kadastr.uz>',
        references: ['<root@kadastr.uz>', '<first@kadastr.uz>'],
      }),
    );
    expect(email.text).toBe("Assalomu alaykum, arizam qachon ko'rib chiqiladi?");
  });

  it('multipart: text/plain (base64) olinadi, ilova nomi yoziladi', () => {
    const email = parseEmail(
      raw(`From: fuqaro@mail.uz
Subject: Hujjat
Content-Type: multipart/mixed; boundary="XYZ"

--XYZ
Content-Type: multipart/alternative; boundary="ALT"

--ALT
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: base64

${b64('Kadastr pasporti nusxasini ilova qildim.')}
--ALT
Content-Type: text/html; charset=UTF-8

<p>HTML</p>
--ALT--
--XYZ
Content-Type: application/pdf; name="pasport.pdf"
Content-Disposition: attachment; filename*=UTF-8''%D0%BF%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82.pdf
Content-Transfer-Encoding: base64

${Buffer.from('PDFDATA').toString('base64')}
--XYZ--
`),
    );
    expect(email.text).toBe('Kadastr pasporti nusxasini ilova qildim.');
    expect(email.attachments).toEqual([{ fileName: 'паспорт.pdf', mimeType: 'application/pdf', sizeBytes: 7 }]);
    expect(email.fromName).toBeNull();
  });

  it('faqat HTML va windows-1251 quoted-printable', () => {
    const email = parseEmail(
      raw(`From: a@b.ru
Subject: test
Content-Type: text/html; charset=windows-1251
Content-Transfer-Encoding: quoted-printable

<div>=CF=F0=E8=E2=E5=F2</div><br>ok
`),
    );
    expect(email.text).toBe('Привет\n\nok');
  });
});

describe('yordamchilar', () => {
  it('htmlToText va stripQuoted', () => {
    expect(htmlToText('<p>Salom&nbsp;&amp; xayr</p><script>x()</script>')).toBe('Salom & xayr');
    expect(stripQuoted('Rahmat!\n\n-----Original Message-----\nFrom: x')).toBe('Rahmat!');
    expect(stripQuoted('> faqat iqtibos')).toBe('> faqat iqtibos');
  });
});
