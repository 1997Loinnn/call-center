import { PhoneOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App, Avatar, Button, Card, DatePicker, Empty, Input, Popconfirm, Popover, Skeleton, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CampaignContact, CampaignDetail, CampaignStatus, ContactStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { CAMPAIGN_STATUS_META, CAMPAIGN_TYPE_LABELS, CONTACT_STATUS_META, P } from '../../constants';
import { formatDate, formatDuration, formatNumber, formatPhone } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import { TONE } from '../../theme';
import ImportContactsModal from './ImportContactsModal';

const RESULTS: ContactStatus[] = ['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALL_LATER'];
const RESULT_LABELS: Partial<Record<ContactStatus, string>> = {
  REACHED: "Bog'lanildi",
  NO_ANSWER: 'Javob bermadi',
  BUSY: 'Band',
  WRONG_NUMBER: "Noto'g'ri raqam",
  CALL_LATER: "Keyinroq qo'ng'iroq",
};
const RESOLVED_OPTIONS: { value: 'yes' | 'partly' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Ha' },
  { value: 'partly', label: 'Qisman' },
  { value: 'no', label: "Yo'q" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

interface Survey {
  resolved?: 'yes' | 'partly' | 'no';
  rating?: number;
  note: string;
}

/** Tanlangan kampaniya: boshqarish, navbatdagi kontakt, qo'ng'iroq natijasi va so'rovnoma. */
export default function CampaignWorkspace({ campaignId, onChanged }: { campaignId: number; onChanged: () => void }) {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const canManage = can(P.CampaignsManage);
  const canDial = can(P.TelephonyUse);
  const detail = useAsync(() => api.get<CampaignDetail>(`/campaigns/${campaignId}`).then((r) => r.data), [campaignId]);
  const [contact, setContact] = useState<CampaignContact | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey>({ note: '' });
  const [laterAt, setLaterAt] = useState<Dayjs>(dayjs().add(1, 'day').hour(10).minute(0));
  const [laterOpen, setLaterOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const autoClaimed = useRef(false);

  const c = detail.data;
  const isActive = c?.status === 'ACTIVE';

  const run = async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(key);
    try {
      const value = await fn();
      if (success) message.success(success);
      return value;
    } catch (err) {
      message.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const claimNext = useCallback(async () => {
    const next = await run('next', () => api.post<CampaignContact | null>(`/campaigns/${campaignId}/next`).then((r) => r.data));
    if (next === undefined) return;
    setContact(next);
    setEmpty(next === null);
    setSurvey({ note: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Sahifa ochilganda: avval olingan kontakt bo'lsa — o'sha, aks holda navbatdan avtomatik olinadi
  useEffect(() => {
    if (!c) return;
    if (c.current) {
      setContact(c.current);
      return;
    }
    if (isActive && canDial && !autoClaimed.current) {
      autoClaimed.current = true;
      void claimNext();
    }
  }, [c, isActive, canDial, claimNext]);

  const refresh = () => {
    void detail.reload();
    onChanged();
  };

  const callContact = async () => {
    if (!contact) return;
    const updated = await run('call', () => api.post<CampaignContact>(`/campaigns/${campaignId}/contacts/${contact.id}/call`).then((r) => r.data), "Qo'ng'iroq boshlanmoqda — telefoningizni oling");
    if (updated) setContact(updated);
  };

  const skip = async () => {
    if (!contact) return;
    const ok = await run('skip', () => api.post(`/campaigns/${campaignId}/contacts/${contact.id}/skip`));
    if (ok !== undefined) await claimNext();
  };

  const saveResult = async (status: ContactStatus) => {
    if (!contact) return;
    const body = {
      status,
      callLaterAt: status === 'CALL_LATER' ? laterAt.toISOString() : undefined,
      ...(status === 'REACHED' ? { resolved: survey.resolved, rating: survey.rating } : {}),
      note: survey.note.trim() || undefined,
    };
    const saved = await run(`result-${status}`, () => api.post(`/campaigns/${campaignId}/contacts/${contact.id}/result`, body), 'Natija saqlandi');
    if (saved === undefined) return;
    setLaterOpen(false);
    refresh();
    await claimNext();
  };

  const setStatus = async (status: CampaignStatus, success: string) => {
    const ok = await run(`status-${status}`, () => api.patch(`/campaigns/${campaignId}`, { status }), success);
    if (ok === undefined) return;
    autoClaimed.current = false;
    setContact(null);
    refresh();
  };

  if (detail.error) return <Alert type="error" showIcon message={detail.error} />;
  if (!c) return <Skeleton active />;

  const meta = CAMPAIGN_STATUS_META[c.status];
  const name = contact ? (contact.fullName ?? contact.citizen?.fullName ?? 'Ismi noma\'lum') : '';
  const reason = !contact
    ? ''
    : contact.ticket
      ? c.type === 'SURVEY'
        ? `${contact.ticket.number} yopilgandan keyin sifat so'rovi`
        : c.type === 'CALLBACK'
          ? `${contact.ticket.number} bo'yicha qayta aloqa`
          : contact.ticket.number
      : (c.description ?? CAMPAIGN_TYPE_LABELS[c.type]);
  const managerActions = canManage && (
    <Space wrap size={6}>
      {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
        <Button size="small" type="primary" loading={busy === 'status-ACTIVE'} onClick={() => void setStatus('ACTIVE', 'Kampaniya boshlandi')}>
          Boshlash
        </Button>
      )}
      {c.status === 'ACTIVE' && (
        <Button size="small" loading={busy === 'status-PAUSED'} onClick={() => void setStatus('PAUSED', "Kampaniya to'xtatildi")}>
          Pauza
        </Button>
      )}
      {c.status === 'PAUSED' && (
        <Button size="small" type="primary" loading={busy === 'status-ACTIVE'} onClick={() => void setStatus('ACTIVE', 'Kampaniya davom etmoqda')}>
          Davom ettirish
        </Button>
      )}
      {(c.status === 'ACTIVE' || c.status === 'PAUSED') && (
        <Popconfirm title="Kampaniya yakunlansinmi? Qolgan kontaktlarga qo'ng'iroq qilinmaydi." okText="Ha" cancelText="Yo'q" onConfirm={() => void setStatus('COMPLETED', 'Kampaniya yakunlandi')}>
          <Button size="small">Yakunlash</Button>
        </Popconfirm>
      )}
      {c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && (
        <Button size="small" icon={<UserAddOutlined />} onClick={() => setImporting(true)}>
          Kontakt qo'shish
        </Button>
      )}
    </Space>
  );

  return (
    <div className="workspace">
      <Card size="small" className="workspace-main">
        <div className="workspace-head">
          <div className="workspace-title">
            <span className="workspace-name">{c.name}</span>
            <span className="workspace-badge">Ko'rib chiqib terish</span>
            <ToneTag tone={meta.tone}>{meta.label}</ToneTag>
          </div>
          <span className="mono workspace-queue">Navbatda: {formatNumber(c.stats.callable)}</span>
        </div>
        <div className="workspace-sub">
          {CAMPAIGN_TYPE_LABELS[c.type]} · {formatNumber(c.stats.total)} kontakt · urinishlar {c.maxAttempts} tagacha
          {c.startsAt ? ` · ${formatDate(c.startsAt)}${c.endsAt ? ` — ${formatDate(c.endsAt)}` : ''}` : ''}
        </div>
        {managerActions && <div className="workspace-manage">{managerActions}</div>}

        {!isActive ? (
          <Alert
            type="info"
            showIcon
            className="workspace-alert"
            message={
              c.status === 'PAUSED'
                ? "Kampaniya to'xtatilgan — supervisor davom ettirgach qo'ng'iroqlar boshlanadi."
                : c.status === 'SCHEDULED' || c.status === 'DRAFT'
                  ? `Kampaniya hali boshlanmagan${c.startsAt ? ` (${formatDate(c.startsAt)} dan)` : ''}.`
                  : "Kampaniya yakunlangan — natijalar hisobotlarda."
            }
          />
        ) : !canDial ? (
          <Alert type="info" showIcon className="workspace-alert" message="Qo'ng'iroq qilish uchun softfon huquqi va SIP raqam kerak." />
        ) : contact ? (
          <>
            <div className="contact-card">
              <Avatar size={56} className="contact-avatar">
                {initials(name) || '?'}
              </Avatar>
              <div className="contact-info">
                <span className="contact-name">{name}</span>
                <span className="contact-phone mono">{formatPhone(contact.phone)}</span>
                <span className="contact-reason">Sabab: {reason}</span>
                <span className="cell-sub">
                  Urinish {Math.min(contact.attempts + 1, c.maxAttempts)} / {c.maxAttempts}
                  {contact.lastAttemptAt ? ` · oxirgi aloqa ${formatDate(contact.lastAttemptAt)}` : ''}
                </span>
              </div>
              <div className="contact-actions">
                <Button size="large" loading={busy === 'skip'} onClick={() => void skip()}>
                  O'tkazib yuborish
                </Button>
                <Button
                  size="large"
                  type="primary"
                  className="btn-call"
                  icon={<PhoneOutlined />}
                  loading={busy === 'call'}
                  disabled={!user?.sipExtension}
                  title={user?.sipExtension ? undefined : 'Sizga SIP raqam biriktirilmagan'}
                  onClick={() => void callContact()}
                >
                  Qo'ng'iroq qilish
                </Button>
              </div>
            </div>
            <div className="result-label">Qo'ng'iroq natijasi</div>
            <div className="result-row">
              {RESULTS.map((status) => {
                const tone = TONE[CONTACT_STATUS_META[status].tone];
                const button = (
                  <Button
                    key={status}
                    className="result-btn"
                    loading={busy === `result-${status}`}
                    disabled={!!busy && busy !== `result-${status}`}
                    onClick={status === 'CALL_LATER' ? undefined : () => void saveResult(status)}
                  >
                    <span className="tone-dot" style={{ background: tone.dot }} />
                    {RESULT_LABELS[status]}
                  </Button>
                );
                return status === 'CALL_LATER' ? (
                  <Popover
                    key={status}
                    trigger="click"
                    open={laterOpen}
                    onOpenChange={setLaterOpen}
                    content={
                      <div className="later-pop">
                        <span className="field-label">Qachon qo'ng'iroq qilinsin</span>
                        <DatePicker
                          showTime={{ format: 'HH:mm', minuteStep: 15 }}
                          format="DD.MM.YYYY HH:mm"
                          value={laterAt}
                          allowClear={false}
                          disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                          onChange={(v) => v && setLaterAt(v)}
                        />
                        <Button type="primary" block loading={busy === 'result-CALL_LATER'} onClick={() => void saveResult('CALL_LATER')}>
                          Saqlash
                        </Button>
                      </div>
                    }
                  >
                    {button}
                  </Popover>
                ) : (
                  button
                );
              })}
            </div>
          </>
        ) : (
          <div className="contact-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={empty ? "Hozircha qo'ng'iroq qilinadigan kontakt yo'q (qayta urinishlar vaqti kelmagan yoki ro'yxat tugagan)." : 'Kontakt olinmagan'}
            />
            <Button loading={busy === 'next'} onClick={() => void claimNext()}>
              Navbatdan olish
            </Button>
          </div>
        )}
      </Card>

      <div className="workspace-bottom">
        <Card size="small" title={c.type === 'SURVEY' ? "So'rovnoma" : 'Suhbat skripti va izoh'} className="survey-card">
          {c.type === 'SURVEY' ? (
            <div className="survey">
              <span className="survey-q">1. Murojaatingiz hal qilindimi?</span>
              <div className="survey-options">
                {RESOLVED_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`survey-option${survey.resolved === o.value ? ' is-selected' : ''}`}
                    aria-pressed={survey.resolved === o.value}
                    disabled={!contact}
                    onClick={() => setSurvey((s) => ({ ...s, resolved: s.resolved === o.value ? undefined : o.value }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="survey-q">2. Operator xizmatini 1 dan 5 gacha baholang</span>
              <div className="survey-options">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`survey-option mono${survey.rating === n ? ' is-selected' : ''}`}
                    aria-pressed={survey.rating === n}
                    aria-label={`Baho ${n}`}
                    disabled={!contact}
                    onClick={() => setSurvey((s) => ({ ...s, rating: s.rating === n ? undefined : n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="survey-q" htmlFor="survey-note">
                3. Taklif yoki izoh
              </label>
              <Input.TextArea
                id="survey-note"
                rows={3}
                maxLength={2000}
                disabled={!contact}
                placeholder="Abonent fikrini qisqacha yozing"
                value={survey.note}
                onChange={(e) => setSurvey((s) => ({ ...s, note: e.target.value }))}
              />
              <span className="panel-note">Javoblar «Bog'lanildi» natijasi bilan saqlanadi.</span>
            </div>
          ) : (
            <div className="survey">
              {c.script ? <p className="script-text">{c.script}</p> : <p className="page-sub">Bu kampaniya uchun skript kiritilmagan.</p>}
              <label className="survey-q" htmlFor="contact-note">
                Izoh
              </label>
              <Input.TextArea
                id="contact-note"
                rows={3}
                maxLength={2000}
                disabled={!contact}
                placeholder="Suhbat natijasi bo'yicha qisqa izoh"
                value={survey.note}
                onChange={(e) => setSurvey((s) => ({ ...s, note: e.target.value }))}
              />
            </div>
          )}
        </Card>

        <div className="workspace-side">
          <Card size="small" title="So'nggi natijalar">
            {c.recent.length === 0 ? (
              <span className="cell-sub">Bu kampaniyada hali natija yozmagansiz.</span>
            ) : (
              <ul className="mini-list">
                {c.recent.map((r) => (
                  <li key={r.id}>
                    <span className="cell-ellipsis">{r.fullName ?? r.citizen?.fullName ?? formatPhone(r.phone)}</span>
                    <span className="mono cell-sub">{r.call ? formatDuration(r.call.talkSeconds) : '—'}</span>
                    <ToneTag tone={CONTACT_STATUS_META[r.status].tone}>{CONTACT_STATUS_META[r.status].label}</ToneTag>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card size="small" title="Navbatdagi kontaktlar">
            {c.upcoming.length === 0 ? (
              <span className="cell-sub">Navbat bo'sh.</span>
            ) : (
              <ul className="mini-list">
                {c.upcoming.map((u) => (
                  <li key={u.id}>
                    <span className="cell-ellipsis">{u.fullName ?? 'Ismi noma\'lum'}</span>
                    <span className="mono cell-sub">{formatPhone(u.phone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {canManage && (
        <ImportContactsModal
          campaignId={campaignId}
          open={importing}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
