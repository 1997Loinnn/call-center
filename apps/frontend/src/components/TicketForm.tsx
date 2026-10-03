import { App, Alert, Button, Card, Checkbox, Col, Form, Input, Row, Select, Switch, TreeSelect, type FormInstance } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Category, OrgTreeNode, Region, TicketListItem, TicketType } from '../api/types';
import { TYPE_LABELS } from '../constants';
import { useAsync } from '../hooks/useAsync';
import { toTreeSelect } from './orgTree';

export interface TicketFormValues {
  type: TicketType;
  categoryId?: number;
  regionId?: number;
  districtId?: number;
  subject: string;
  description: string;
  citizenPhone?: string;
  citizenName?: string;
  isAnonymous?: boolean;
  cadastreNumber?: string;
  applicationNumber?: string;
  targetOrgUnitId?: number;
  closeImmediately?: boolean;
  answer?: string;
}

const CLOSABLE: TicketType[] = ['INFO', 'GRATITUDE'];

/** Murojaat kartasi (F-OP-04): yo'naltirish jadvali bo'yicha mas'ul bo'linma avtomatik taklif qilinadi. */
export default function TicketForm({ form, pbxCallId, onCreated }: {
  form: FormInstance<TicketFormValues>;
  pbxCallId?: string;
  onCreated: (ticket: TicketListItem) => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<{ id: number; name: string } | null>(null);

  const reference = useAsync(
    () =>
      Promise.all([
        api.get<Category[]>('/reference/categories').then((r) => r.data),
        api.get<Region[]>('/reference/regions').then((r) => r.data),
        api.get<OrgTreeNode[]>('/org-units/tree').then((r) => r.data),
      ]),
    [],
  );
  const [categories = [], regions = [], orgTree = []] = reference.data ?? [];
  const treeData = useMemo(() => toTreeSelect(orgTree), [orgTree]);

  const type = Form.useWatch('type', form);
  const categoryId = Form.useWatch('categoryId', form);
  const regionId = Form.useWatch('regionId', form);
  const districtId = Form.useWatch('districtId', form);
  const closeImmediately = Form.useWatch('closeImmediately', form);
  const districts = regions.find((r) => r.id === regionId)?.districts ?? [];
  const isCorruption = type === 'CORRUPTION' || categories.find((c) => c.id === categoryId)?.isConfidential;

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ id: number; name: string } | null>('/tickets/routing-suggestion', { params: { categoryId, regionId, districtId } })
      .then((res) => {
        if (cancelled) return;
        setSuggestion(res.data || null);
        if (res.data && !form.isFieldTouched('targetOrgUnitId')) form.setFieldValue('targetOrgUnitId', res.data.id);
      })
      .catch(() => !cancelled && setSuggestion(null));
    return () => {
      cancelled = true;
    };
  }, [categoryId, regionId, districtId, form]);

  const onFinish = async (values: TicketFormValues) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        targetOrgUnitId: values.closeImmediately || isCorruption ? undefined : values.targetOrgUnitId,
        pbxCallId,
      };
      const res = await api.post<TicketListItem>('/tickets', payload);
      onCreated(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Yangi murojaat" size="small">
      {reference.error && <Alert type="error" message={reference.error} showIcon style={{ marginBottom: 12 }} />}
      <Form<TicketFormValues> form={form} layout="vertical" initialValues={{ type: 'APPLICATION' }} onFinish={onFinish}>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="citizenPhone" label="Telefon raqami">
              <Input placeholder="+998 90 123 45 67" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="citizenName" label="Fuqaro F.I.Sh.">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="type" label="Murojaat turi" rules={[{ required: true }]}>
              <Select options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="categoryId" label="Toifa">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={reference.loading}
                options={categories.map((c) => ({ value: c.id, label: c.nameUz }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="regionId" label="Viloyat">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={regions.map((r) => ({ value: r.id, label: r.nameUz }))}
                onChange={() => form.setFieldValue('districtId', undefined)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="districtId" label="Tuman (shahar)">
              <Select
                allowClear
                disabled={districts.length === 0}
                placeholder={regionId && districts.length === 0 ? "Tumanlar ro'yxati hali kiritilmagan" : undefined}
                options={districts.map((d) => ({ value: d.id, label: d.nameUz }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="subject" label="Mavzu" rules={[{ required: true, message: 'Mavzuni kiriting' }, { max: 200 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="description" label="Mazmuni" rules={[{ required: true, message: 'Mazmunini kiriting' }]}>
              <Input.TextArea rows={4} maxLength={5000} showCount />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cadastreNumber" label="Kadastr raqami">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="applicationNumber" label="Ariza raqami">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        {isCorruption ? (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Maxfiy murojaat"
              description="Korrupsiya xabari avtomatik ravishda korrupsiyaga qarshi kurash bo'limiga yuboriladi va saqlangandan keyin sizga ko'rinmaydi."
            />
            <Form.Item name="isAnonymous" label="Fuqaro ma'lumotlarini yashirish (anonim)" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        ) : (
          <>
            {CLOSABLE.includes(type) && (
              <Form.Item name="closeImmediately" valuePropName="checked">
                <Checkbox>Ma'lumot berildi — murojaatni darhol yopish</Checkbox>
              </Form.Item>
            )}
            {closeImmediately && CLOSABLE.includes(type) ? (
              <Form.Item name="answer" label="Berilgan ma'lumot" rules={[{ required: true, message: "Qanday ma'lumot berilganini yozing" }]}>
                <Input.TextArea rows={2} />
              </Form.Item>
            ) : (
              <Form.Item
                name="targetOrgUnitId"
                label="Mas'ul bo'linma"
                extra={suggestion ? `Yo'naltirish jadvali tavsiyasi: ${suggestion.name}` : "Bo'sh qoldirilsa, murojaat \"Yangi\" holatida qoladi"}
              >
                <TreeSelect
                  allowClear
                  showSearch
                  treeNodeFilterProp="title"
                  treeData={treeData}
                  treeDefaultExpandedKeys={suggestion ? [suggestion.id] : undefined}
                  placeholder="Bo'linmani tanlang"
                />
              </Form.Item>
            )}
          </>
        )}

        <Button type="primary" htmlType="submit" loading={saving}>
          Saqlash
        </Button>
      </Form>
    </Card>
  );
}
