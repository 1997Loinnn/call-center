import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EskizSmsDriver, HttpSmsDriver, isUzMobile, renderTemplate, SmsError, smsParts } from './sms';

describe('SMS yordamchilari', () => {
  it("shablon o'zgaruvchilari", () => {
    expect(renderTemplate('Raqami: {raqam}. Manzil: {manzil}', { raqam: '1097-2026-000123' })).toBe('Raqami: 1097-2026-000123. Manzil:');
  });

  it('SMS qismlari: lotin 160, kirill 70', () => {
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts("Ko'chmas mulk")).toBe(1);
    expect(smsParts('я'.repeat(71))).toBe(2);
  });

  it('faqat O‘zbekiston mobil raqami', () => {
    expect(isUzMobile('+998901234567')).toBe(true);
    expect(isUzMobile('1097')).toBe(false);
  });
});

/** Sinov serveri: so'rovlarni yozib oladi, javobni testning o'zi beradi. */
async function server(handler: (path: string, headers: Record<string, string | string[] | undefined>, body: string) => [number, unknown]) {
  const calls: { path: string; body: string; auth?: string }[] = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ path: req.url ?? '', body, auth: req.headers.authorization });
      const [status, json] = handler(req.url ?? '', req.headers, body);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { calls, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}

describe('EskizSmsDriver', () => {
  it('login qilib yuboradi, token eskirsa qayta login', async () => {
    let logins = 0;
    let sends = 0;
    const srv = await server((path) => {
      if (path === '/auth/login') return [200, { data: { token: `t${++logins}` } }];
      sends++;
      return sends === 1 ? [401, { message: 'Expired' }] : [200, { id: 'abc-1', status: 'waiting' }];
    });
    try {
      const driver = new EskizSmsDriver({ email: 'a@b.uz', password: 'p', from: '4546', baseUrl: srv.url });
      await expect(driver.send('+998901234567', 'Salom')).resolves.toBe('abc-1');
      expect(logins).toBe(2);
      const send = srv.calls.filter((c) => c.path === '/message/sms/send').pop()!;
      expect(send.auth).toBe('Bearer t2');
      expect(send.body).toContain('998901234567');
      expect(send.body).not.toContain('+998');
    } finally {
      srv.close();
    }
  });

  it('4xx — doimiy xato', async () => {
    const srv = await server((path) => (path === '/auth/login' ? [200, { data: { token: 't' } }] : [400, { message: 'Matn shablonga mos emas' }]));
    try {
      const driver = new EskizSmsDriver({ email: 'a@b.uz', password: 'p', from: '4546', baseUrl: srv.url });
      const err = await driver.send('+998901234567', 'x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SmsError);
      expect((err as SmsError).permanent).toBe(true);
    } finally {
      srv.close();
    }
  });
});

describe('HttpSmsDriver', () => {
  it('JSON yuboradi va id qaytaradi; 5xx — vaqtinchalik xato', async () => {
    let fail = false;
    const srv = await server(() => (fail ? [503, { message: 'band' }] : [200, { id: 77 }]));
    try {
      const driver = new HttpSmsDriver({ url: srv.url, authorization: 'Basic eDp5', from: '1097' });
      await expect(driver.send('+998901234567', 'Matn')).resolves.toBe('77');
      expect(JSON.parse(srv.calls[0].body)).toEqual({ phone: '998901234567', text: 'Matn', from: '1097' });
      expect(srv.calls[0].auth).toBe('Basic eDp5');
      fail = true;
      const err = await driver.send('+998901234567', 'Matn').catch((e: unknown) => e);
      expect((err as SmsError).permanent).toBe(false);
    } finally {
      srv.close();
    }
  });
});
