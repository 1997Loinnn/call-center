import { BranchesOutlined, DeleteOutlined, LockOutlined, PlusOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Col, Form, Input, Row, Segmented, Select, Switch, TreeSelect, type FormInstance } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Category, OrgTreeNode, Region, TicketListItem, TicketType } from '../api/types';
import { TYPE_LABELS, TYPE_ORDER } from '../constants';
import AiSuggestions from './operator/AiSuggestions';
import TopicPicker from './operator/TopicPicker';
import { toTreeSelect } from './orgTree';
// Forma uslublari (mavzu kartalari, kontaktlar) — operator paneli bilan umumiy; omnikanal oynasida ham ishlatiladi
import '../pages/operator.css';

export interface TicketFormValues {
  type: TicketType;
  /** Tanlangan mavzular: birinchisi asosiy (yo'naltirish va muddat), qolganlari qo'shimcha */
  topics?: number[];
  /** Bog'lanish uchun qo'shimcha raqamlar */
  extraPhones?: string[];
  regionId?: number;
  districtId?: number;
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

// Joyida yopish backend qoidasi bilan bir xil (ticket-workflow.ts: canCloseImmediately)
const CLOSABLE: TicketType[] = ['INFO', 'GRATITUDE'];

/** Murojaat yaratish (F-OP-04): mavzu kartasi tanlanadi, mas'ul bo'linma yo'naltirish jadvalidan taklif qilinadi. */
export default function TicketForm({ form, pbxCallId, submitUrl = '/tickets', categories, regions, orgTree, created, onCreated, onRouteChange }: {
  form: FormInstance<TicketFormValues>;
  pbxCallId?: string;
  /** Omnikanal suhbatidan: /omni/conversations/:id/ticket (kanal va bog'lanish suhbatdan olinadi) */
  submitUrl?: string;
  categories: Category[];
  regions: Region[];
  orgTree: OrgTreeNode[];
  created: TicketListItem | null;
  onCreated: (ticket: TicketListItem) => void;
  onRouteChange?: (routeName: string | undefined, slaDays: number | undefined) => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<{ id: number; name: string } | null>(null);
  const [pickUnit, setPickUnit] = useState(false);
  const treeData = useMemo(() => toTreeSelect(orgTree), [orgTree]);

  const type = Form.useWatch('type', form);
  const topics = Form.useWatch('topics', form) as number[] | undefined;
  const categoryId = topics?.[0];
  const citizenPhone = Form.useWatch('citizenPhone', form) as string | undefined;
  const regionId = Form.useWatch('regionId', form);
  const districtId = Form.useWatch('districtId', form);
  const targetOrgUnitId = Form.useWatch('targetOrgUnitId', form);
  const closeImmediately = Form.useWatch('closeImmediately', form);
  const description = Form.useWatch('description', form) as string | undefined;
  const districts = regions.find((r) => r.id === regionId)?.districts ?? [];
  const topic = categories.find((c) => c.id === categoryId);
  const isCorruption = type === 'CORRUPTION' || !!topic?.isConfidential;
  const closable = CLOSABLE.includes(type);

  useEffect(() => {
    if (!closable && form.getFieldValue('closeImmediately')) form.setFieldValue('closeImmediately', false);
  }, [closable, form]);

  // Murojaat turi o'zgarsa, shu turda chiqmaydigan mavzular tanlovdan olib tashlanadi
  useEffect(() => {
    if (!topics?.length || !type) return;
    const fits = topics.filter((id) => {
      const c = categories.find((x) => x.id === id);
      return !c || c.ticketTypes.length === 0 || c.ticketTypes.includes(type);
    });
    if (fits.length !== topics.length) form.setFieldValue('topics', fits);
  }, [topics, type, categories, form]);

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

  const chosenUnit = targetOrgUnitId === suggestion?.id ? suggestion?.name : undefined;
  useEffect(() => {
    onRouteChange?.(isCorruption ? "Korrupsiyaga qarshi kurash bo'limi" : (chosenUnit ?? suggestion?.name), topic?.slaDays);
  }, [onRouteChange, isCorruption, chosenUnit, suggestion?.name, topic?.slaDays]);

  const onFinish = async (values: TicketFormValues) => {
    setSaving(true);
    try {
      const { topics: chosenTopics = [], extraPhones = [], ...rest } = values;
      const [primary, ...extra] = chosenTopics;
      const chosen = categories.find((c) => c.id === primary);
      const payload = {
        ...rest,
        categoryId: primary,
        topicIds: extra.length > 0 ? extra : undefined,
        extraPhones: extraPhones.map((p) => p?.trim()).filter(Boolean),
        // Asosiy mavzu nomi murojaat mavzusi bo'ladi; operator batafsilini tavsifga yozadi
        subject: chosen?.nameUz ?? TYPE_LABELS[values.type],
        targetOrgUnitId: values.closeImmediately || isCorruption ? undefined : values.targetOrgUnitId,
        pbxCallId,
      };
      const res = await api.post<TicketListItem>(submitUrl, payload);
      setPickUnit(false);
      onCreated(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    form.resetFields();
    setPickUnit(false);
  };

  return (
    <Form<TicketFormValues> form={form} layout="vertical" initialValues={{ type: 'INFO' }} onFinish={onFinish}>
      <Card
        size="small"
        className="composer"
        title="Murojaat yaratish"
        extra={
          <Form.Item name="type" noStyle>
            <Segmented size="small" options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
          </Form.Item>
        }
        actions={[
          <div key="actions" className="composer-actions">
            <Button type="primary" htmlType="submit" loading={saving} icon={<SendOutlined />} iconPosition="end">
              Yuborish
            </Button>
            <Button icon={<UndoOutlined />} onClick={reset}>
              Tozalash
            </Button>
          </div>,
        ]}
      >
        {created && (
          <Alert
            type="success"
            showIcon
            closable
            className="composer-alert"
            message={
              <>
                <b className="mono">{created.number}</b> saqlandi
                {created.assignedOrgUnit ? ` va ${created.assignedOrgUnit.name}ga yuborildi` : ''}.{' '}
                <Link to={`/tickets/${created.id}`}>Ochish</Link>
              </>
            }
          />
        )}
        {isCorruption && (
          <div className="confidential-note">
            <LockOutlined />
            <span>Maxfiy murojaat: korrupsiyaga qarshi kurash bo'limiga avtomatik yuboriladi va saqlangandan keyin sizga ko'rinmaydi.</span>
            <Form.Item name="isAnonymous" valuePropName="checked" noStyle>
              <Switch size="small" aria-label="Anonim murojaat" />
            </Form.Item>
            <span>Anonim</span>
          </div>
        )}

        <Form.Item name="topics" rules={[{ required: true, type: 'array', min: 1, message: 'Kamida bitta mavzuni tanlang' }]}>
          <TopicPicker categories={categories} type={type} />
        </Form.Item>

        {topic && (
          <div className="route-info">
            <BranchesOutlined />
            {closeImmediately ? (
              <span>Murojaat darhol «Yopildi» holatida saqlanadi.</span>
            ) : isCorruption ? (
              <span>
                Yo'naltirish: <b>Korrupsiyaga qarshi kurash bo'limi</b> · ijro muddati <b>{topic.slaDays} kun</b>
              </span>
            ) : (
              <>
                <span>
                  Yo'naltirish: <b>{chosenUnit ?? (targetOrgUnitId ? "qo'lda tanlangan bo'linma" : (suggestion?.name ?? 'qoida topilmadi — supervisor yo\'naltiradi'))}</b>
                  {' · '}ijro muddati <b>{topic.slaDays} kun</b>
                </span>
                <Button type="link" size="small" onClick={() => setPickUnit((v) => !v)}>
                  {pickUnit ? 'Yashirish' : "O'zgartirish"}
                </Button>
              </>
            )}
          </div>
        )}
        {/* Maydon doim formada turadi (yashirin bo'lsa ham): aks holda jadval tavsiyasi yuborilmay qoladi */}
        <Form.Item
          name="targetOrgUnitId"
          label="Mas'ul bo'linma"
          hidden={!pickUnit || !!closeImmediately || isCorruption}
          extra={suggestion ? `Jadval tavsiyasi: ${suggestion.name}` : undefined}
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

        <Form.Item name="description" label="Tavsif" rules={[{ required: true, message: 'Tavsifni kiriting' }]}>
          <Input.TextArea
            rows={4}
            maxLength={5000}
            showCount
            placeholder="Fuqaro so'zlari bilan: qaysi mulk yoki ariza, qachon murojaat qilgan, nima kutmoqda"
          />
        </Form.Item>
        <AiSuggestions
          text={description}
          topics={topics}
          regionId={regionId}
          districtId={districtId}
          type={type}
          onTopic={(id) => form.setFieldValue('topics', [id, ...(topics ?? []).filter((t) => t !== id)])}
          onPlace={(region, district) => {
            const known = regions.find((r) => r.id === region)?.districts?.some((d) => d.id === district);
            form.setFieldsValue({ regionId: region, districtId: known ? district : undefined });
          }}
          onType={(t) => form.setFieldValue('type', t)}
        />

        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="citizenPhone" label="Fuqaro telefoni">
              <Input className="mono" inputMode="tel" placeholder="+998 90 123 45 67" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="citizenName" label="Fuqaro F.I.Sh.">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <div className="contacts-block">
              <div className="contacts-head">
                <span>Bog'lanish uchun kontaktlar</span>
              </div>
              {citizenPhone?.trim() ? (
                <div className="contact-row">
                  <span className="mono">{citizenPhone}</span>
                  <span className="cell-sub">Asosiy · qo'ng'iroq qilgan raqam</span>
                </div>
              ) : (
                <span className="cell-sub">Avval fuqaro telefonini kiriting — qo'shimcha raqamlar unga bog'lanadi.</span>
              )}
              <Form.List name="extraPhones">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <div key={field.key} className="contact-extra">
                        <Form.Item
                          name={field.name}
                          noStyle
                          rules={[{ pattern: /^[+\d\s()-]{9,20}$/, message: "Telefon raqami noto'g'ri" }]}
                        >
                          <Input className="mono" inputMode="tel" placeholder="+998 __ ___ __ __" aria-label="Qo'shimcha telefon" />
                        </Form.Item>
                        <Button icon={<DeleteOutlined />} aria-label="Raqamni olib tashlash" onClick={() => remove(field.name)} />
                      </div>
                    ))}
                    <Button
                      icon={<PlusOutlined />}
                      disabled={!citizenPhone?.trim() || fields.length >= 5}
                      onClick={() => add('')}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Telefon qo'shish
                    </Button>
                  </>
                )}
              </Form.List>
            </div>
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
          <Col xs={24} md={12}>
            <Form.Item name="cadastreNumber" label="Kadastr raqami">
              <Input className="mono" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="applicationNumber" label="Ariza raqami">
              <Input className="mono" />
            </Form.Item>
          </Col>
        </Row>

        {!isCorruption && (
          <Form.Item
            name="closeImmediately"
            valuePropName="checked"
            extra={closable ? undefined : "Joyida faqat ma'lumot so'rash va minnatdorchilik murojaatlari yopiladi"}
          >
            <Checkbox disabled={!closable}>Joyida hal qilindi — murojaat darhol yopiladi</Checkbox>
          </Form.Item>
        )}
        {closeImmediately && closable && (
          <Form.Item name="answer" label="Berilgan ma'lumot" rules={[{ required: true, message: "Qanday ma'lumot berilganini yozing" }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        )}
      </Card>
    </Form>
  );
}
