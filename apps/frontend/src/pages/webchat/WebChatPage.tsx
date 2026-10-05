import { CloseOutlined, MessageOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import './webchat.css';

/**
 * Fuqaro uchun veb-chat (F-OMNI-02): kadastr.uz saytida vidjet (iframe) yoki alohida sahifa sifatida ochiladi.
 * Kirish talab qilinmaydi; suhbat brauzerdagi token bilan davom etadi. Xodim ismi fuqaroga ko'rsatilmaydi.
 */

interface ChatMessage {
  id: number;
  direction: 'IN' | 'OUT';
  body: string;
  sentAt: string;
  author: string | null;
}

const TOKEN_KEY = 'cc-webchat-token';
const POLL_MS = 3000;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* brauzer xotirasi yopiq: suhbat sahifa yangilanguncha davom etadi */
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public/webchat/${url}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { message?: string | string[] }).message;
    throw Object.assign(new Error(Array.isArray(message) ? message.join('; ') : (message ?? "Xabar yuborilmadi, qayta urinib ko'ring")), { status: res.status });
  }
  return body as T;
}

export default function WebChatPage() {
  const embed = new URLSearchParams(window.location.search).get('embed') === '1';
  const [token, setToken] = useState<string | null>(readToken);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = '1097 · Onlayn yordam — Kadastr agentligi';
  }, []);

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const data = await request<{ messages: ChatMessage[]; ticketNumber: string | null }>(`messages?token=${encodeURIComponent(token)}&after=${lastId.current}`);
      if (data.messages.length) {
        lastId.current = data.messages[data.messages.length - 1].id;
        setMessages((list) => [...list, ...data.messages.filter((m) => !list.some((x) => x.id === m.id))]);
      }
      setTicketNumber(data.ticketNumber);
    } catch (err) {
      // Suhbat topilmadi (eski token): yangi suhbat boshlanadi
      if ((err as { status?: number }).status === 404) {
        writeToken(null);
        setToken(null);
        setMessages([]);
        lastId.current = 0;
      }
    }
  }, [token]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await request<{ token: string }>('messages', {
        method: 'POST',
        body: JSON.stringify(token ? { token, body } : { body, name: name.trim() || undefined, phone: phone.trim() || undefined }),
      });
      setDraft('');
      if (res.token !== token) {
        writeToken(res.token);
        lastId.current = 0;
        setMessages([]);
        setToken(res.token);
      } else {
        await poll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const restart = () => {
    writeToken(null);
    setToken(null);
    setMessages([]);
    setTicketNumber(null);
    lastId.current = 0;
  };

  return (
    <div className={`wc-page${embed ? ' is-embed' : ''}`}>
      <section className="wc-window" aria-label="Onlayn yordam">
        <header className="wc-head">
          <span className="wc-logo" aria-hidden>
            <MessageOutlined />
          </span>
          <span className="wc-head-text">
            <span className="wc-title">1097 · Onlayn yordam</span>
            <span className="wc-sub">Kadastr agentligi ishonch xizmati</span>
          </span>
          {embed && (
            <button type="button" className="wc-close" aria-label="Yopish" onClick={() => window.parent.postMessage({ type: 'cc-webchat-close' }, '*')}>
              <CloseOutlined />
            </button>
          )}
        </header>

        <div className="wc-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="wc-intro">
              <p>Assalomu alaykum! Ko'chmas mulk, kadastr va geodeziya xizmatlari bo'yicha savolingizni yozing — operator javob beradi.</p>
              <p>Murojaat holatini bilish uchun uning raqamini yuboring, masalan: <b>1097-2026-000123</b>.</p>
              {!token && (
                <div className="wc-contact">
                  <Input placeholder="Ismingiz" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Ismingiz" />
                  <Input placeholder="Telefon (ixtiyoriy)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" aria-label="Telefon raqami" />
                </div>
              )}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`wc-msg ${m.direction === 'IN' ? 'is-me' : 'is-them'}`}>
              <div className="wc-bubble">
                {m.author && (
                  <span className="wc-author">
                    {m.author === 'Avtomatik javob' && <RobotOutlined />} {m.author}
                  </span>
                )}
                <span className="wc-body">{m.body}</span>
                <span className="wc-time">{dayjs(m.sentAt).format('HH:mm')}</span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {ticketNumber && (
          <div className="wc-ticket">
            Murojaatingiz raqami: <b>{ticketNumber}</b>
          </div>
        )}
        {error && <div className="wc-error">{error}</div>}

        <footer className="wc-composer">
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 5 }}
            maxLength={2000}
            placeholder="Xabaringizni yozing…"
            aria-label="Xabar"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="primary" shape="circle" icon={<SendOutlined />} loading={sending} disabled={!draft.trim()} onClick={() => void send()} aria-label="Yuborish" />
        </footer>
        <div className="wc-foot">
          {token ? (
            <button type="button" className="wc-link" onClick={restart}>
              Yangi suhbat boshlash
            </button>
          ) : (
            <span>Yozishmangiz xizmat sifatini nazorat qilish uchun saqlanadi.</span>
          )}
          <span>Telefon: 1097</span>
        </div>
      </section>
    </div>
  );
}
