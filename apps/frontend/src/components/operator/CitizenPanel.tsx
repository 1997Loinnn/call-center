import { RightOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Form, Input, Segmented, Select, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CitizenCard, Region } from '../../api/types';
import { formatDate, formatDateTime, formatDuration, formatPhone } from '../../format';
import StatusTag from '../StatusTag';

export interface ManualCitizen {
  citizenName?: string;
  citizenPhone?: string;
  regionId?: number;
  districtId?: number;
}

interface Recent {
  phone: string;
  name: string;
}

// Oxirgi qidiruvlar faqat shu tab xotirasida turadi: shaxsiy ma'lumot brauzerga yozilmaydi
let recentMemory: Recent[] = [];
const RECENT_LIMIT = 5;
const HISTORY_SHOWN = 5;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Fuqaro kartasi (F-OP-02): qidirish yoki qo'lda kiritish, oldingi murojaatlar va qo'ng'iroqlar. */
export default function CitizenPanel({ card, loading, regions, onSearch, onManual, onClear }: {
  card: CitizenCard | null;
  loading: boolean;
  regions: Region[];
  onSearch: (query: string) => void;
  onManual: (values: ManualCitizen) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Recent[]>(recentMemory);
  const [manual] = Form.useForm<ManualCitizen>();
  const regionId = Form.useWatch('regionId', manual);
  const districts = regions.find((r) => r.id === regionId)?.districts ?? [];

  useEffect(() => {
    if (!card) return;
    const entry = { phone: card.phone, name: card.citizen?.fullName ?? 'Yangi fuqaro' };
    recentMemory = [entry, ...recentMemory.filter((r) => r.phone !== entry.phone)].slice(0, RECENT_LIMIT);
    setRecent(recentMemory);
  }, [card]);

  const search = (value: string) => {
    if (value.trim()) onSearch(value.trim());
  };

  const citizen = card?.citizen;
  const name = citizen?.fullName ?? 'Yangi fuqaro';
  const place = [citizen?.region?.nameUz, citizen?.district?.nameUz].filter(Boolean).join(', ');

  return (
    <Card
      size="small"
      title="Fuqaro kartasi"
      extra={
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as 'search' | 'manual')}
          options={[
            { value: 'search', label: 'Qidirish' },
            { value: 'manual', label: "Qo'lda kiritish" },
          ]}
        />
      }
    >
      {mode === 'search' ? (
        <div className="citizen-panel">
          <label htmlFor="citizen-query" className="field-label">
            Telefon yoki murojaat raqami
          </label>
          <Input
            id="citizen-query"
            allowClear
            placeholder="+998 90 123 45 67 yoki 1097-2026-000123"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={() => search(query)}
          />
          <Button type="primary" block icon={<SearchOutlined />} onClick={() => search(query)} disabled={!query.trim()}>
            Qidirish
          </Button>

          {loading ? (
            <Skeleton active avatar paragraph={{ rows: 4 }} />
          ) : card ? (
            <div className="citizen-card">
              <div className="citizen-head">
                <Avatar size={42} className="citizen-avatar" icon={citizen?.fullName ? undefined : <UserOutlined />}>
                  {citizen?.fullName ? initials(citizen.fullName) : null}
                </Avatar>
                <span className="citizen-head-text">
                  <span className="citizen-name">{name}</span>
                  <span className="mono citizen-phone">{formatPhone(card.phone)}</span>
                </span>
                <Button size="small" onClick={onClear}>
                  Boshqa fuqaro
                </Button>
              </div>
              <dl className="citizen-facts">
                <div>
                  <dt>Hudud</dt>
                  <dd>{place || '—'}</dd>
                </div>
                <div>
                  <dt>Qo'ng'iroqlar</dt>
                  <dd>
                    {card.calls.length > 0
                      ? `${card.calls.length} ta · oxirgisi ${formatDateTime(card.calls[0].startedAt)} (${formatDuration(card.calls[0].talkSeconds)})`
                      : "yo'q"}
                  </dd>
                </div>
              </dl>
              <div className="citizen-history">
                <span className="citizen-history-title">Avvalgi murojaatlar ({card.tickets.length})</span>
                {card.tickets.length === 0 ? (
                  <span className="panel-note">Avval murojaat qilmagan.</span>
                ) : (
                  card.tickets.slice(0, HISTORY_SHOWN).map((t) => (
                    <Link key={t.id} to={`/tickets/${t.id}`} className="history-item">
                      <span className="history-text">
                        <span className="mono history-no">
                          {t.number} · {formatDate(t.createdAt)}
                        </span>
                        <span className="history-subject">{t.subject}</span>
                      </span>
                      <StatusTag status={t.status} />
                    </Link>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="citizen-empty">
                <span className="citizen-empty-icon">
                  <UserOutlined />
                </span>
                <span className="citizen-name">Fuqaro tanlanmagan</span>
                <span className="panel-note">Kiruvchi qo'ng'iroqda karta raqam bo'yicha o'zi ochiladi.</span>
              </div>
              {recent.length > 0 && (
                <div className="recent">
                  <span className="panel-section-title">Oxirgi qidiruvlar</span>
                  {recent.map((r) => (
                    <button key={r.phone} type="button" className="recent-item" onClick={() => onSearch(r.phone)}>
                      <UserOutlined />
                      <span className="recent-text">
                        <span>{r.name}</span>
                        <span className="mono panel-note">{formatPhone(r.phone)}</span>
                      </span>
                      <RightOutlined />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <Form<ManualCitizen>
          form={manual}
          layout="vertical"
          onFinish={(values) => {
            onManual(values);
            manual.resetFields();
            setMode('search');
          }}
        >
          <Form.Item name="citizenName" label="F.I.Sh.">
            <Input placeholder="Familiya Ism Otasining ismi" />
          </Form.Item>
          <Form.Item name="citizenPhone" label="Telefon" rules={[{ required: true, message: 'Telefon raqamini kiriting' }]}>
            <Input className="mono" inputMode="tel" placeholder="+998 __ ___ __ __" />
          </Form.Item>
          <Form.Item name="regionId" label="Viloyat">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={regions.map((r) => ({ value: r.id, label: r.nameUz }))}
              onChange={() => manual.setFieldValue('districtId', undefined)}
            />
          </Form.Item>
          <Form.Item name="districtId" label="Tuman (shahar)">
            <Select allowClear disabled={districts.length === 0} options={districts.map((d) => ({ value: d.id, label: d.nameUz }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Murojaatga qo'shish
          </Button>
          <p className="panel-note" style={{ marginTop: 8 }}>
            Fuqaro murojaat saqlanganda bazaga yoziladi.
          </p>
        </Form>
      )}
    </Card>
  );
}
