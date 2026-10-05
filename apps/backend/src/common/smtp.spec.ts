import { createServer, Server, Socket } from 'node:net';
import { AddressInfo } from 'node:net';
import { buildMessage, encodeHeader, sendMail } from './smtp';

/** Sinov uchun SMTP server: buyruqlarni yozib oladi va xatni qabul qiladi. */
function fakeServer(options: { authFails?: boolean } = {}): Promise<{ server: Server; port: number; log: string[]; data: string[] }> {
  const log: string[] = [];
  const data: string[] = [];
  const server = createServer((socket: Socket) => {
    let buffer = '';
    let inData = false;
    let authStep = 0;
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 queued\r\n');
          } else data.push(line);
          continue;
        }
        log.push(line);
        if (authStep === 1) {
          authStep = 2;
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (authStep === 2) {
          authStep = 0;
          socket.write(options.authFails ? '535 auth failed\r\n' : '235 ok\r\n');
        } else if (line.startsWith('EHLO')) socket.write('250-test\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
        else if (line === 'AUTH LOGIN') {
          authStep = 1;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (line === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (line === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, log, data })));
}

describe('smtp', () => {
  it('UTF-8 mavzu RFC 2047 bilan kodlanadi', () => {
    expect(encodeHeader('Re: test')).toBe('Re: test');
    expect(encodeHeader("Re: Ko'chmas — №5")).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it('xat sarlavhalari va base64 matn', () => {
    const msg = buildMessage({ from: '1097 Call-markaz <cc@kadastr.uz>' }, { to: 'a@b.uz', subject: 'Re: Savol', text: 'Salom\nfuqaro', inReplyTo: '<x@y>', references: ['<x@y>'] }, '<id@kadastr.uz>');
    expect(msg).toContain('From: 1097 Call-markaz <cc@kadastr.uz>');
    expect(msg).toContain('In-Reply-To: <x@y>');
    expect(msg).toContain('Message-ID: <id@kadastr.uz>');
    const body = msg.split('\r\n\r\n')[1];
    expect(Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')).toBe('Salom\r\nfuqaro');
  });

  it('ilova fayl bilan multipart/mixed xat', () => {
    const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 200 }, (_, i) => i % 256)]);
    const msg = buildMessage(
      { from: 'cc@kadastr.uz' },
      { to: 'a@b.uz', subject: 'Hisobot', text: 'Ilovada', attachments: [{ fileName: "Ko'rsatkichlar — oktabr.xlsx", contentType: 'application/vnd.ms-excel', content }] },
      '<id@x>',
    );
    const boundary = /boundary="([^"]+)"/.exec(msg)?.[1];
    expect(boundary).toBeTruthy();
    const parts = msg.split(`--${boundary}`);
    // preambula, matn, ilova, yakun "--"
    expect(parts).toHaveLength(4);
    expect(parts[3].trim()).toBe('--');
    // ASCII bo'lmagan nom RFC 2231 bilan kodlanadi
    expect(parts[2]).toContain("filename*=UTF-8''Ko%27rsatkichlar%20%E2%80%94%20oktabr.xlsx");
    const encoded = parts[2].split('\r\n\r\n')[1];
    expect(Buffer.from(encoded.replace(/\s/g, ''), 'base64').equals(content)).toBe(true);
    // SMTP qatori 998 belgidan oshmasligi kerak
    expect(Math.max(...msg.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(998);
  });

  it('AUTH LOGIN bilan xat yuboradi', async () => {
    const srv = await fakeServer();
    try {
      const id = await sendMail(
        { host: '127.0.0.1', port: srv.port, secure: false, user: 'cc', password: 'secret', from: 'cc@kadastr.uz' },
        { to: 'Fuqaro <f@mail.uz>', subject: 'Javob', text: 'Murojaatingiz qabul qilindi' },
      );
      expect(id).toMatch(/^<.+@kadastr\.uz>$/);
      expect(srv.log).toEqual(
        expect.arrayContaining(['EHLO kadastr.uz', 'AUTH LOGIN', Buffer.from('cc').toString('base64'), 'MAIL FROM:<cc@kadastr.uz>', 'RCPT TO:<f@mail.uz>', 'DATA', 'QUIT']),
      );
      expect(srv.data).toContain('Subject: Javob');
    } finally {
      srv.server.close();
    }
  });

  it("autentifikatsiya xatosida parol xabarga tushmaydi", async () => {
    const srv = await fakeServer({ authFails: true });
    try {
      await expect(
        sendMail({ host: '127.0.0.1', port: srv.port, secure: false, user: 'cc', password: 'secret', from: 'cc@kadastr.uz' }, { to: 'f@mail.uz', subject: 's', text: 't' }),
      ).rejects.toThrow('SMTP AUTH: 535 auth failed');
    } finally {
      srv.server.close();
    }
  });
});
