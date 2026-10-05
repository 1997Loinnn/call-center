import { PrinterOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Collapse, Empty, Input } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { FAQ, MANUAL, OWN_ORDER } from './manual-content';
import './manual.css';

const norm = (s: string) => s.toLocaleLowerCase('uz').replace(/[ʻʼ‘’`]/g, "'");

/** Foydalanuvchi qo'llanmasi: rollar bo'yicha bo'limlar, qidiruv va chop etish. Birinchi bo'lib foydalanuvchining o'z roli ochiladi. */
export default function ManualPage() {
  const { canAny } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');

  // Foydalanuvchiga mos bo'lim (rol ruxsatlari bo'yicha)
  const own = useMemo(
    () => OWN_ORDER.find((key) => canAny(MANUAL.find((s) => s.key === key)?.permissions ?? [])) ?? 'start',
    [canAny],
  );
  const active = params.get('s') ?? own;
  const query = norm(search.trim());

  const results = useMemo(() => {
    if (!query) return [];
    return MANUAL.flatMap((section) =>
      section.steps.filter((step) => norm(`${step.title} ${step.text}`).includes(query)).map((step) => ({ section, step })),
    );
  }, [query]);

  const section = MANUAL.find((s) => s.key === active) ?? MANUAL[0];

  return (
    <div className="manual">
      <div className="page-header">
        <div>
          <h1>Foydalanuvchi qo'llanmasi</h1>
          <span className="page-sub">Har bir rol uchun qadam-baqadam yo'riqnoma · bo'limlar tizimdagi sahifa va tugma nomlari bilan</span>
        </div>
        <div className="header-actions">
          <Input
            allowClear
            data-hotkey="search"
            prefix={<SearchOutlined />}
            placeholder="Qo'llanmadan qidirish"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Chop etish
          </Button>
        </div>
      </div>

      <div className="manual-grid">
        <nav className="manual-nav" aria-label="Qo'llanma bo'limlari">
          {MANUAL.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`manual-nav-item${s.key === section.key && !query ? ' is-active' : ''}`}
              onClick={() => {
                setSearch('');
                setParams({ s: s.key }, { replace: true });
              }}
            >
              <span className="cell-stack">
                <span className="cell-strong">
                  {s.title}
                  {s.key === own && <span className="manual-own">Sizning rolingiz</span>}
                </span>
                <span className="cell-sub">{s.audience}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className={`manual-nav-item${active === 'faq' && !query ? ' is-active' : ''}`}
            onClick={() => {
              setSearch('');
              setParams({ s: 'faq' }, { replace: true });
            }}
          >
            <span className="cell-strong">Ko'p beriladigan savollar</span>
          </button>
        </nav>

        <article className="manual-body">
          {query ? (
            results.length === 0 ? (
              <Empty description="Hech narsa topilmadi" />
            ) : (
              <>
                <h2>Qidiruv: {results.length} ta natija</h2>
                <ol className="manual-steps">
                  {results.map(({ section: s, step }) => (
                    <li key={`${s.key}-${step.title}`}>
                      <span className="manual-step-section">{s.title}</span>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                      {step.link && <OpenLink to={step.link} />}
                    </li>
                  ))}
                </ol>
              </>
            )
          ) : active === 'faq' ? (
            <>
              <h2>Ko'p beriladigan savollar</h2>
              <Collapse items={FAQ.map((f, i) => ({ key: String(i), label: f.q, children: <p className="manual-faq">{f.a}</p> }))} defaultActiveKey={['0']} />
            </>
          ) : (
            <>
              <h2>{section.title}</h2>
              <p className="manual-intro">{section.intro}</p>
              <ol className="manual-steps is-numbered">
                {section.steps.map((step) => (
                  <li key={step.title}>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                    {step.link && <OpenLink to={step.link} />}
                  </li>
                ))}
              </ol>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

function OpenLink({ to }: { to: string }) {
  return (
    <Link to={to} className="manual-open">
      Sahifani ochish <RightOutlined />
    </Link>
  );
}
