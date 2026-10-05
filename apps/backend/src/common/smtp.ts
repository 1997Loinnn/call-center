import { randomBytes } from 'node:crypto';
import { connect as netConnect, Socket } from 'node:net';
import { connect as tlsConnect, TLSSocket } from 'node:tls';

/**
 * Kichik SMTP mijoz (tashqi kutubxonasiz): EHLO, STARTTLS, AUTH LOGIN, bitta xat.
 * Omnikanal email javoblari va jadval bo'yicha hisobotlar (ilova fayl bilan) shu orqali yuboriladi.
 */
export interface SmtpOptions {
  host: string;
  port: number;
  /** true — darhol TLS (465-port); false — oddiy ulanish, server qo'llasa STARTTLS */
  secure: boolean;
  user?: string;
  password?: string;
  /** "1097 Call-markaz <call-center@kadastr.uz>" */
  from: string;
  /** Sinov uchun: o'z-o'zidan imzolangan sertifikatga ruxsat (ishlab chiqarishda ishlatilmaydi) */
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
}

export interface MailAttachment {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  /** Ilova fayllar (jadval bo'yicha hisobotlar): bo'lsa xat multipart/mixed bo'ladi */
  attachments?: MailAttachment[];
}

/** RFC 2047: UTF-8 sarlavha (mavzu va ism kirill yoki o'zbek harflari bilan). */
export function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** "Ism <a@b.uz>" → a@b.uz */
export function addressOf(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match ? match[1] : value).trim();
}

function displayFrom(from: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return match && match[1] ? `${encodeHeader(match[1])} <${match[2]}>` : from;
}

const base64Lines = (data: Buffer) => data.toString('base64').replace(/.{1,76}/g, '$&\r\n');

/** RFC 2231: fayl nomi UTF-8 da (o'zbekcha harflar va bo'shliqlar bilan). */
function fileNameParam(name: string): string {
  const safe = name.replace(/[\r\n"\\]/g, '_');
  if (/^[\x20-\x7e]*$/.test(safe)) return `filename="${safe}"`;
  return `filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** Xat matni: sarlavhalar + base64 (uzun qatorlar va nuqta bilan boshlanadigan qatorlar muammosiz). */
export function buildMessage(options: Pick<SmtpOptions, 'from'>, mail: MailMessage, messageId: string, date = new Date()): string {
  const body = base64Lines(Buffer.from(mail.text.replace(/\r?\n/g, '\r\n'), 'utf8'));
  const headers = [
    `From: ${displayFrom(options.from)}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${messageId}`,
    ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`] : []),
    ...(mail.references?.length ? [`References: ${mail.references.join(' ')}`] : []),
    'MIME-Version: 1.0',
  ];
  if (!mail.attachments?.length) {
    headers.push('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
    return `${headers.join('\r\n')}\r\n\r\n${body}`;
  }
  const boundary = `=_cc1097_${randomBytes(12).toString('hex')}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`,
    ...mail.attachments.map(
      (a) =>
        `--${boundary}\r\nContent-Type: ${a.contentType}; name="${encodeHeader(a.fileName)}"\r\n` +
        `Content-Disposition: attachment; ${fileNameParam(a.fileName)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(a.content)}`,
    ),
  ];
  return `${headers.join('\r\n')}\r\n\r\n${parts.join('')}--${boundary}--\r\n`;
}

class SmtpConnection {
  private buffer = '';
  private waiter: { resolve: (r: { code: number; text: string }) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(private socket: Socket | TLSSocket) {
    this.attach(socket);
  }

  private attach(socket: Socket | TLSSocket): void {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on('error', (err) => this.fail(err));
    socket.on('close', () => this.fail(new Error('SMTP ulanishi uzildi')));
  }

  private fail(err: Error): void {
    this.failure ??= err;
    this.waiter?.reject(err);
    this.waiter = null;
  }

  /** Ko'p qatorli javob: "250-..." davom etadi, "250 ..." tugaydi. */
  private flush(): void {
    if (!this.waiter) return;
    const lines = this.buffer.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const text = lines.slice(0, i + 1).join('\n');
        this.buffer = lines.slice(i + 1).join('\r\n');
        const waiter = this.waiter;
        this.waiter = null;
        waiter.resolve({ code: Number(lines[i].slice(0, 3)), text });
        return;
      }
    }
  }

  read(): Promise<{ code: number; text: string }> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
      this.flush();
    });
  }

  /** label — xato xabarida buyruq o'rniga (parol va xat matni logga tushmasligi uchun). */
  async command(line: string, expect: number[], label = line.split(' ')[0]): Promise<string> {
    this.socket.write(`${line}\r\n`);
    const reply = await this.read();
    if (!expect.includes(reply.code)) throw new Error(`SMTP ${label}: ${reply.text}`);
    return reply.text;
  }

  upgrade(host: string, rejectUnauthorized: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners('data');
      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('close');
      const secure = tlsConnect({ socket: this.socket, servername: host, rejectUnauthorized }, () => resolve());
      secure.once('error', reject);
      this.socket = secure;
      this.buffer = '';
      this.attach(secure);
    });
  }

  close(): void {
    this.socket.end();
  }
}

/** Bitta xat yuboradi; Message-ID ni qaytaradi (javob zanjiri uchun). */
export async function sendMail(options: SmtpOptions, mail: MailMessage): Promise<string> {
  const domain = addressOf(options.from).split('@')[1] ?? 'localhost';
  const messageId = `<${Date.now().toString(36)}.${randomBytes(8).toString('hex')}@${domain}>`;
  const rejectUnauthorized = options.rejectUnauthorized ?? true;
  const timeout = options.timeoutMs ?? 20_000;

  const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
    const s = options.secure
      ? tlsConnect({ host: options.host, port: options.port, servername: options.host, rejectUnauthorized }, () => resolve(s))
      : netConnect({ host: options.host, port: options.port }, () => resolve(s));
    s.setTimeout(timeout, () => s.destroy(new Error('SMTP server javob bermadi')));
    s.once('error', reject);
  });

  const smtp = new SmtpConnection(socket);
  try {
    const greeting = await smtp.read();
    if (greeting.code !== 220) throw new Error(`SMTP: ${greeting.text}`);
    let caps = await smtp.command(`EHLO ${domain}`, [250]);
    if (!options.secure && /STARTTLS/i.test(caps)) {
      await smtp.command('STARTTLS', [220]);
      await smtp.upgrade(options.host, rejectUnauthorized);
      caps = await smtp.command(`EHLO ${domain}`, [250]);
    }
    if (options.user) {
      if (!/AUTH[ =][^\n]*LOGIN/i.test(caps) && /AUTH[ =][^\n]*PLAIN/i.test(caps)) {
        const token = Buffer.from(`\0${options.user}\0${options.password ?? ''}`).toString('base64');
        await smtp.command(`AUTH PLAIN ${token}`, [235], 'AUTH');
      } else {
        await smtp.command('AUTH LOGIN', [334]);
        await smtp.command(Buffer.from(options.user).toString('base64'), [334], 'AUTH');
        await smtp.command(Buffer.from(options.password ?? '').toString('base64'), [235], 'AUTH');
      }
    }
    await smtp.command(`MAIL FROM:<${addressOf(options.from)}>`, [250]);
    await smtp.command(`RCPT TO:<${addressOf(mail.to)}>`, [250, 251]);
    await smtp.command('DATA', [354]);
    await smtp.command(`${buildMessage(options, mail, messageId)}\r\n.`, [250], 'DATA');
    await smtp.command('QUIT', [221]).catch(() => undefined);
    return messageId;
  } finally {
    smtp.close();
  }
}
