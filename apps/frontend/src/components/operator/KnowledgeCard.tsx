import { BookOutlined, SearchOutlined } from '@ant-design/icons';
import { Card, Empty, Input, Modal, Skeleton } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { KnowledgeArticle } from '../../api/types';
import { useAsync } from '../../hooks/useAsync';
import ArticleBody from '../ArticleBody';

/**
 * Operator paneli: bilimlar bazasidan tezkor ma'lumot (F-OP-06). Mavzu tanlansa — shu toifa maqolalari,
 * qidiruv — butun baza bo'yicha. Maqola suhbatni to'xtatmasdan oynada ochiladi.
 */
export default function KnowledgeCard({ categoryId }: { categoryId?: number }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<KnowledgeArticle | null>(null);
  const list = useAsync(
    () =>
      query || categoryId
        ? api.get<KnowledgeArticle[]>('/knowledge', { params: query ? { search: query } : { categoryId } }).then((r) => r.data.slice(0, 6))
        : Promise.resolve([] as KnowledgeArticle[]),
    [query, categoryId],
  );

  return (
    <Card size="small" title={<span><BookOutlined /> Bilimlar bazasi</span>} extra={<Link to="/knowledge">Hammasi</Link>}>
      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Masalan: kadastr pasporti"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!e.target.value) setQuery('');
        }}
        onPressEnter={() => setQuery(search.trim())}
        aria-label="Bilimlar bazasidan qidirish"
      />
      <div className="kb-mini">
        {list.loading ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : (list.data ?? []).length === 0 ? (
          <span className="panel-note">{query ? 'Topilmadi' : categoryId ? "Bu toifa bo'yicha maqola yo'q" : 'Mavzu tanlang yoki qidiring'}</span>
        ) : (
          (list.data ?? []).map((a) => (
            <button key={a.id} type="button" className="kb-mini-item" onClick={() => setOpen(a)}>
              {a.title}
            </button>
          ))
        )}
      </div>
      <Modal open={!!open} title={open?.title} footer={null} onCancel={() => setOpen(null)} width={640}>
        {open ? <ArticleBody text={open.body} /> : <Empty />}
      </Modal>
    </Card>
  );
}
