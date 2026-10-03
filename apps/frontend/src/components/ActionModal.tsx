import { App, Form, Input, Modal, Select, TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { OrgTreeNode, TicketDetail } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { toTreeSelect } from './orgTree';

export type ActionKind = 'route' | 'assign' | 'return' | 'answer' | 'reject' | 'reopen' | 'comment';

const TITLES: Record<ActionKind, string> = {
  route: "Mas'ul bo'linmaga yo'naltirish",
  assign: 'Ijrochiga berish',
  return: "Noto'g'ri yo'naltirilgan — qaytarish",
  answer: 'Javob yozish',
  reject: 'Javobni rad etish',
  reopen: 'Qayta ochish',
  comment: "Izoh qo'shish",
};

const COMMENT_LABEL: Partial<Record<ActionKind, string>> = {
  return: 'Qaytarish sababi',
  reject: 'Rad etish sababi',
  reopen: 'Qayta ochish sababi',
  comment: 'Izoh',
};

interface Assignee {
  id: number;
  fullName: string;
  orgUnit: { id: number; name: string };
}

/** Murojaat holatini o'zgartiruvchi amallar uchun yagona oyna. */
export default function ActionModal({ kind, ticket, onCancel, onDone }: {
  kind: ActionKind | null;
  ticket: TicketDetail | undefined;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Record<string, unknown>>();
  const [saving, setSaving] = useState(false);

  const orgTree = useAsync(
    () => (kind === 'route' ? api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data) : Promise.resolve([])),
    [kind],
  );
  const assignees = useAsync(
    () =>
      kind === 'assign' && ticket?.assignedOrgUnit
        ? api.get<Assignee[]>('/users/assignable', { params: { orgUnitId: ticket.assignedOrgUnit.id } }).then((r) => r.data)
        : Promise.resolve([]),
    [kind, ticket?.assignedOrgUnit?.id],
  );
  const treeData = useMemo(() => toTreeSelect(orgTree.data ?? []), [orgTree.data]);

  useEffect(() => {
    if (kind) form.resetFields();
  }, [kind, form]);

  const submit = async () => {
    if (!kind || !ticket) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.post(`/tickets/${ticket.id}/${kind === 'comment' ? 'comments' : kind}`, values);
      message.success('Saqlandi');
      onDone();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const commentRequired = kind !== null && kind in COMMENT_LABEL;

  return (
    <Modal
      open={kind !== null}
      title={kind ? TITLES[kind] : ''}
      onCancel={onCancel}
      onOk={submit}
      confirmLoading={saving}
      okText="Saqlash"
      cancelText="Bekor qilish"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        {kind === 'route' && (
          <Form.Item name="orgUnitId" label="Bo'linma" rules={[{ required: true, message: "Bo'linmani tanlang" }]}>
            <TreeSelect showSearch treeNodeFilterProp="title" treeData={treeData} loading={orgTree.loading} />
          </Form.Item>
        )}
        {kind === 'assign' && (
          <Form.Item name="assigneeId" label="Ijrochi" rules={[{ required: true, message: 'Ijrochini tanlang' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={assignees.loading}
              options={(assignees.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} — ${u.orgUnit.name}` }))}
            />
          </Form.Item>
        )}
        {kind === 'answer' && (
          <Form.Item name="answer" label="Javob matni" rules={[{ required: true, message: 'Javobni yozing' }]}>
            <Input.TextArea rows={5} maxLength={5000} showCount />
          </Form.Item>
        )}
        {(kind === 'route' || kind === 'assign' || commentRequired) && (
          <Form.Item
            name="comment"
            label={(kind && COMMENT_LABEL[kind]) ?? 'Izoh (ixtiyoriy)'}
            rules={commentRequired ? [{ required: true, message: 'Sababni yozing' }] : undefined}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
