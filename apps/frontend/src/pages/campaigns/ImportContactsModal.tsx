import { App, Modal } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Category } from '../../api/types';
import { useAsync } from '../../hooks/useAsync';
import ContactsSource, { initialSource, sourcePayload, type SourceValue } from './ContactsSource';

/** Mavjud kampaniyaga kontakt qo'shish. */
export default function ImportContactsModal({ campaignId, open, onClose, onImported }: {
  campaignId: number;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { message } = App.useApp();
  const [source, setSource] = useState<SourceValue>(initialSource());
  const [saving, setSaving] = useState(false);
  const categories = useAsync(() => (open ? api.get<Category[]>('/reference/categories').then((r) => r.data) : Promise.resolve([])), [open]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ added: number; skipped: number }>(`/campaigns/${campaignId}/contacts`, sourcePayload(source));
      message.success(`${res.data.added} ta kontakt qo'shildi${res.data.skipped ? `, ${res.data.skipped} tasi o'tkazib yuborildi (takror yoki noto'g'ri)` : ''}`);
      setSource(initialSource());
      onImported();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Kontakt qo'shish" okText="Qo'shish" cancelText="Bekor qilish" confirmLoading={saving} onOk={() => void save()} onCancel={onClose} width={560}>
      <ContactsSource value={source} onChange={setSource} categories={categories.data ?? []} />
    </Modal>
  );
}
