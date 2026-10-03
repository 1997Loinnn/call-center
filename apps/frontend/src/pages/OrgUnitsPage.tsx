import { PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Row, Select, Spin, Tag, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { OrgTreeNode, OrgUnitDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ORG_TYPE_LABELS, P } from '../constants';
import { useAsync } from '../hooks/useAsync';

const toTreeData = (nodes: OrgTreeNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.id,
    title: (
      <span>
        {node.name} <Tag style={{ marginLeft: 4 }}>{ORG_TYPE_LABELS[node.type] ?? node.type}</Tag>
      </span>
    ),
    children: toTreeData(node.children),
  }));

interface NewUnitForm {
  name: string;
  code: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
}

/** Tashkiliy tuzilma (TZ 5-bo'lim): agentlik, DKP, hududiy boshqarmalar va tasarrufidagi tashkilotlar. */
export default function OrgUnitsPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<NewUnitForm>();
  const tree = useAsync(() => api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data), []);
  const detail = useAsync(
    () => (selected ? api.get<OrgUnitDetail>(`/org-units/${selected}`).then((r) => r.data) : Promise.resolve(undefined)),
    [selected],
  );
  const treeData = useMemo(() => toTreeData(tree.data ?? []), [tree.data]);
  const rootKeys = useMemo(() => (tree.data ?? []).map((n) => n.id), [tree.data]);

  const create = async () => {
    const values = await form.validateFields();
    try {
      await api.post('/org-units', { ...values, parentId: selected });
      message.success("Bo'linma qo'shildi");
      setAdding(false);
      form.resetFields();
      void tree.reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Tashkiliy tuzilma</h1>
        {can(P.OrgManage) && (
          <Button type="primary" icon={<PlusOutlined />} disabled={!selected} onClick={() => setAdding(true)}>
            Quyi bo'linma qo'shish
          </Button>
        )}
      </div>
      {tree.error && <Alert type="error" message={tree.error} showIcon style={{ marginBottom: 16 }} />}
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card size="small">
            {tree.loading ? (
              <Spin />
            ) : (
              <Tree
                treeData={treeData}
                defaultExpandedKeys={rootKeys}
                onSelect={(keys) => setSelected(keys.length ? Number(keys[0]) : null)}
                height={640}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Bo'linma ma'lumotlari">
            {!selected ? (
              <Empty description="Daraxtdan bo'linmani tanlang" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : detail.loading || !detail.data ? (
              <Spin />
            ) : (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Nomi">{detail.data.name}</Descriptions.Item>
                <Descriptions.Item label="Turi">{ORG_TYPE_LABELS[detail.data.type] ?? detail.data.type}</Descriptions.Item>
                <Descriptions.Item label="Kod">{detail.data.code}</Descriptions.Item>
                <Descriptions.Item label="Yuqori bo'linma">{detail.data.parent?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Hudud">{detail.data.region?.nameUz ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Telefon">{detail.data.phone ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Email">{detail.data.email ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Manzil">{detail.data.address ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Sayt">{detail.data.website ?? '—'}</Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={adding}
        title={`Quyi bo'linma: ${detail.data?.name ?? ''}`}
        onCancel={() => setAdding(false)}
        onOk={create}
        okText="Qo'shish"
        cancelText="Bekor qilish"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="Kod"
            rules={[{ required: true }, { pattern: /^[a-z0-9.-]{2,64}$/, message: "Kichik lotin harflari, raqam, '.' va '-'" }]}
            extra="Masalan: dkp.toshkent-sh.chilonzor"
          >
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Turi" rules={[{ required: true }]}>
            <Select options={Object.entries(ORG_TYPE_LABELS).filter(([v]) => v !== 'AGENCY').map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="phone" label="Telefon">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Manzil">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
