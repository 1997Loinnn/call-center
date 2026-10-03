import { LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Empty, Input } from 'antd';
import { useMemo, useState } from 'react';
import type { Category } from '../../api/types';

// 12 ta: 2, 3, 4 va 6 ustunda ham qatorlar to'liq bo'ladi
const PER_PAGE = 12;

/**
 * Qo'ng'iroq mavzularini raqamli kartalar ko'rinishida tanlash (prototip: Operator paneli).
 * Mavzu — toifaning quyi bandi; mavzular hali kiritilmagan bo'lsa, toifalarning o'zi chiqadi.
 */
export default function TopicPicker({ categories, value, onChange }: {
  categories: Category[];
  value?: number;
  onChange?: (id: number | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const parentName = useMemo(() => new Map(categories.filter((c) => !c.parentId).map((c) => [c.id, c.nameUz])), [categories]);
  const topics = useMemo(() => {
    const children = categories.filter((c) => c.parentId);
    return (children.length > 0 ? children : categories).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? topics.filter(
        (t) =>
          t.nameUz.toLowerCase().includes(q) ||
          (t.parentId && parentName.get(t.parentId)?.toLowerCase().includes(q)) ||
          String(t.sortOrder) === q,
      )
    : topics;
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  return (
    <div className="topic-picker">
      <div className="topic-toolbar">
        <span className="topic-title">Qo'ng'iroq mavzusini tanlang</span>
        <Input
          allowClear
          className="topic-search"
          prefix={<SearchOutlined />}
          placeholder="Mavzu, toifa yoki raqam"
          aria-label="Mavzuni qidirish"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <div className="topic-pager">
          <Button size="small" icon={<LeftOutlined />} aria-label="Oldingi sahifa" disabled={current === 0} onClick={() => setPage(current - 1)} />
          <span className="mono">
            {current + 1} / {pages}
          </span>
          <Button size="small" icon={<RightOutlined />} aria-label="Keyingi sahifa" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} />
        </div>
      </div>
      {visible.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Mos mavzu topilmadi. «Boshqa masala»ni tanlab, tavsifda yozing." />
      ) : (
        <div className="topic-grid">
          {visible.map((t) => {
            const selected = t.id === value;
            return (
              <button
                key={t.id}
                type="button"
                className={`topic-card${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onChange?.(selected ? undefined : t.id)}
              >
                <span className="topic-meta">
                  <span className="topic-parent">{t.parentId ? parentName.get(t.parentId) : 'Toifa'}</span>
                  {t.parentId !== null && <span className="topic-no mono">{t.sortOrder}</span>}
                </span>
                <span className="topic-name">{t.nameUz}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
