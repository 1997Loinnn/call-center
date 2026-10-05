import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Popconfirm, Select, Skeleton, Switch } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Category, KnowledgeArticle } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ArticleBody from '../../components/ArticleBody';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { formatDateTime } from '../../format';
import { useAsync } from '../../hooks/useAsync';
import './knowledge.css';

interface ArticleForm {
  title: string;
  categoryId: number | null;
  body: string;
  isPublished: boolean;
}

/** Bilimlar bazasi (F-OP-06): xizmatlar tartibi, kerakli hujjatlar va tez-tez beriladigan savollar. */
export default function KnowledgePage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const editor = can(P.KnowledgeManage);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [editing, setEditing] = useState<KnowledgeArticle | 'new' | null>(null);
  const [form] = Form.useForm<ArticleForm>();

  const categories = useAsync(() => api.get<Category[]>('/reference/categories').then((r) => r.data.filter((c) => c.parentId === null)), []);
  const list = useAsync(
    () => api.get<KnowledgeArticle[]>('/knowledge', { params: { search: query || undefined, categoryId } }).then((r) => r.data),
    [query, categoryId],
  );
  const selectedId = Number(params.get('a')) || null;
  const items = list.data ?? [];
  const selected = useMemo(() => items.find((a) => a.id === selectedId) ?? items[0], [items, selectedId]);

  useEffect(() => {
    if (editing) form.setFieldsValue(editing === 'new' ? { title: '', categoryId: categoryId ?? null, body: '', isPublished: true } : { ...editing, categoryId: editing.category?.id ?? null });
  }, [editing, form, categoryId]);

  const save = async () => {
    const values = await form.validateFields();
    try {
      const res = editing === 'new' ? await api.post<KnowledgeArticle>('/knowledge', values) : await api.put<KnowledgeArticle>(`/knowledge/${(editing as KnowledgeArticle).id}`, values);
      setEditing(null);
      message.success('Maqola saqlandi');
      await list.reload();
      setParams({ a: String(res.data.id) }, { replace: true });
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = async (article: KnowledgeArticle) => {
    try {
      await api.delete(`/knowledge/${article.id}`);
      setParams({}, { replace: true });
      await list.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bilimlar bazasi</h1>
          <span className="page-sub">Xizmatlar tartibi, kerakli hujjatlar va tez-tez beriladigan savollar · operator suhbat paytida panel ichida ham qidiradi</span>
        </div>
        {editor && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Maqola
          </Button>
        )}
      </div>
      <div className="kb-grid">
        <aside className="kb-list">
          <Input
            allowClear
            data-hotkey="search"
            prefix={<SearchOutlined />}
            placeholder="Qidirish: hujjat, pasport, ipoteka…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setQuery('');
            }}
            onPressEnter={() => setQuery(search.trim())}
          />
          <Select
            allowClear
            placeholder="Barcha toifalar"
            value={categoryId}
            onChange={setCategoryId}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.nameUz }))}
          />
          {list.loading && !list.data ? (
            <Skeleton active />
          ) : items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Maqola topilmadi" />
          ) : (
            <div className="kb-items">
              {items.map((a) => (
                <button key={a.id} type="button" className={`kb-item${a.id === selected?.id ? ' is-selected' : ''}`} onClick={() => setParams({ a: String(a.id) }, { replace: true })}>
                  <span className="cell-strong">{a.title}</span>
                  <span className="cell-sub">
                    {a.category?.nameUz ?? 'Umumiy'}
                    {!a.isPublished && ' · qoralama'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="kb-article">
          {list.error && <Alert type="error" showIcon message={list.error} />}
          {selected ? (
            <Card
              title={selected.title}
              extra={
                editor && (
                  <span className="header-actions">
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(selected)}>
                      Tahrirlash
                    </Button>
                    <Popconfirm title="Maqola o'chirilsinmi?" okText="O'chirish" cancelText="Yo'q" onConfirm={() => void remove(selected)}>
                      <Button size="small" danger icon={<DeleteOutlined />} aria-label="O'chirish" />
                    </Popconfirm>
                  </span>
                )
              }
            >
              <div className="kb-meta">
                {selected.category && <ToneTag tone="teal">{selected.category.nameUz}</ToneTag>}
                {!selected.isPublished && <ToneTag tone="amber">Qoralama — operatorlarga ko'rinmaydi</ToneTag>}
                <span className="cell-sub">
                  Yangilangan: {formatDateTime(selected.updatedAt)}
                  {selected.updatedBy ? ` · ${selected.updatedBy.fullName}` : ''}
                </span>
              </div>
              <ArticleBody text={selected.body} />
            </Card>
          ) : (
            !list.loading && <Empty description="Chapdan maqolani tanlang" />
          )}
        </section>
      </div>

      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Yangi maqola' : 'Maqolani tahrirlash'}
        okText="Saqlash"
        cancelText="Bekor qilish"
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Sarlavha" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={200} />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="categoryId" label="Toifa" style={{ flex: 2 }}>
              <Select allowClear placeholder="Umumiy" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.nameUz }))} />
            </Form.Item>
            <Form.Item name="isPublished" label="Operatorlarga ko'rinadi" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="body" label="Matn" extra="Har bir xatboshi yangi qatordan; «- » bilan boshlangan qatorlar ro'yxat bo'lib chiqadi" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={14} maxLength={20000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
