import { DeleteOutlined, ExclamationCircleOutlined, HomeOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { IvrAction, IvrMenu, IvrOption } from '../../api/types';
import type { IvrTabProps } from './IvrPage';
import IvrSimulator from './IvrSimulator';
import { ACTION_LABELS, ACTION_TARGET, DIGIT_ORDER, LANGUAGE_LABELS } from './ivr-labels';

interface MenuForm {
  code: string;
  name: string;
  language: string | null;
  promptId: number | null;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueueId: number | null;
}

type EditableOption = IvrOption & { key: string };

const toForm = (m: IvrMenu): MenuForm => ({
  code: m.code,
  name: m.name,
  language: m.language,
  promptId: m.promptId,
  timeoutSeconds: m.timeoutSeconds,
  maxRetries: m.maxRetries,
  fallbackQueueId: m.fallbackQueueId,
});

const withKeys = (options: IvrOption[]): EditableOption[] => options.map((o) => ({ ...o, key: `${o.digit}-${o.id ?? Math.random()}` }));

/** IVR menyusi: chapda menyular va qo'ng'iroq simulyatori, o'ngda tanlangan menyu va uning tugmalari. */
export default function MenusTab({ data, canEdit, reload }: IvrTabProps) {
  const { message } = App.useApp();
  const [selectedId, setSelectedId] = useState<number | undefined>(data.settings.entryMenuId ?? data.menus[0]?.id);
  const [form] = Form.useForm<MenuForm>();
  const [options, setOptions] = useState<EditableOption[]>([]);
  const [optionsDirty, setOptionsDirty] = useState(false);
  const [saving, setSaving] = useState<'menu' | 'options' | null>(null);
  const [creating, setCreating] = useState(false);
  const [newForm] = Form.useForm<MenuForm>();

  const menu = data.menus.find((m) => m.id === selectedId) ?? data.menus[0];
  const entryId = data.settings.entryMenuId;

  useEffect(() => {
    if (!menu) return;
    form.setFieldsValue(toForm(menu));
    setOptions(withKeys(menu.options));
    setOptionsDirty(false);
  }, [menu, form]);

  // Boshlang'ich menyu birinchi, qolganlari tartib bo'yicha
  const ordered = useMemo(() => [...data.menus].sort((a, b) => Number(b.id === entryId) - Number(a.id === entryId)), [data.menus, entryId]);
  const issuesOf = (id: number) => data.issues.filter((i) => i.menuId === id);
  const general = data.issues.filter((i) => i.menuId === undefined);

  const promptOptions = data.prompts.map((p) => ({ value: p.id, label: `${p.name}${p.hasAudio ? '' : ' (audiosiz)'}` }));
  const queueOptions = data.queues.map((q) => ({ value: q.id, label: `${q.number} · ${q.name}${q.isActive ? '' : ' (faol emas)'}` }));
  const menuOptions = data.menus.filter((m) => m.id !== menu?.id).map((m) => ({ value: m.id, label: m.name }));

  const saveMenu = async () => {
    if (!menu) return;
    const values = await form.validateFields();
    setSaving('menu');
    try {
      await api.put(`/ivr/menus/${menu.id}`, values);
      message.success('Menyu saqlandi');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const saveOptions = async () => {
    if (!menu) return;
    const empty = options.find((o) => !o.label.trim());
    if (empty) {
      message.error(`«${empty.digit}» tugmasi uchun nomni kiriting`);
      return;
    }
    setSaving('options');
    try {
      await api.put(`/ivr/menus/${menu.id}/options`, {
        // Faqat API qabul qiladigan maydonlar (bazadan kelgan id, menuId yuborilmaydi)
        options: options.map((o) => ({
          digit: o.digit,
          label: o.label.trim(),
          action: o.action,
          queueId: o.queueId,
          targetMenuId: o.targetMenuId,
          promptId: o.promptId,
        })),
      });
      message.success('Tugmalar saqlandi');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const createMenu = async () => {
    const values = await newForm.validateFields();
    try {
      const res = await api.post<IvrMenu>('/ivr/menus', values);
      setCreating(false);
      newForm.resetFields();
      await reload();
      setSelectedId(res.data.id);
      message.success('Menyu yaratildi');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeMenu = async (id: number) => {
    try {
      await api.delete(`/ivr/menus/${id}`);
      setSelectedId(entryId ?? undefined);
      await reload();
      message.success("Menyu o'chirildi");
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const update = (key: string, patch: Partial<IvrOption>) => {
    setOptions((list) =>
      list.map((o) => {
        if (o.key !== key) return o;
        const next = { ...o, ...patch };
        // Amal o'zgarsa, keraksiz maqsad maydonlari tozalanadi
        if (patch.action) {
          const target = ACTION_TARGET[patch.action];
          if (target !== 'queue') next.queueId = null;
          if (target !== 'menu') next.targetMenuId = null;
          if (target !== 'prompt') next.promptId = null;
        }
        return next;
      }),
    );
    setOptionsDirty(true);
  };

  const addOption = () => {
    const free = DIGIT_ORDER.find((d) => !options.some((o) => o.digit === d));
    if (!free) return;
    setOptions((list) => [...list, { key: `new-${Date.now()}`, digit: free, label: '', action: 'QUEUE', queueId: null, targetMenuId: null, promptId: null }]);
    setOptionsDirty(true);
  };

  const sortedOptions = [...options].sort((a, b) => DIGIT_ORDER.indexOf(a.digit) - DIGIT_ORDER.indexOf(b.digit));

  return (
    <div className="ivr-grid">
      <div className="ivr-col">
        <Card
          size="small"
          title="Menyular"
          extra={
            canEdit && (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                Menyu
              </Button>
            )
          }
          className="ivr-menu-list"
        >
          {ordered.length === 0 && <Empty description="Menyu yo'q" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          {ordered.map((m) => {
            const issues = issuesOf(m.id);
            const hasError = issues.some((i) => i.level === 'error');
            return (
              <button key={m.id} type="button" className={`ivr-menu-item${m.id === menu?.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(m.id)}>
                <span className="cell-stack">
                  <span className="ivr-menu-name">
                    {m.id === entryId && <HomeOutlined aria-label="Boshlang'ich menyu" />} {m.name}
                  </span>
                  <span className="cell-sub mono">
                    {m.code} · {m.options.length} tugma{m.language ? ` · ${LANGUAGE_LABELS[m.language] ?? m.language}` : ''}
                  </span>
                </span>
                {issues.length > 0 && (
                  <Tooltip title={issues.map((i) => i.message).join('\n')}>
                    {hasError ? <ExclamationCircleOutlined className="ivr-issue-icon is-error" aria-label="Xato" /> : <WarningOutlined className="ivr-issue-icon" aria-label="Ogohlantirish" />}
                  </Tooltip>
                )}
              </button>
            );
          })}
        </Card>
        {general.length > 0 && (
          <Card size="small" title="Tekshiruv" className="ivr-issues">
            <ul>
              {general.map((i) => (
                <li key={i.message} className={i.level === 'error' ? 'is-error' : undefined}>
                  {i.level === 'error' ? <ExclamationCircleOutlined /> : <WarningOutlined />} {i.message}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <IvrSimulator data={data} onMenu={setSelectedId} />
      </div>

      <div className="ivr-col">
        {!menu ? (
          <Card>
            <Empty description="IVR menyusi hali yaratilmagan" />
          </Card>
        ) : (
          <>
            <Card
              size="small"
              title={
                <span>
                  {menu.name}
                  {menu.id === entryId && <span className="ivr-entry-tag">Boshlang'ich</span>}
                </span>
              }
              extra={
                canEdit && (
                  <span className="header-actions">
                    {menu.id !== entryId && (
                      <Popconfirm title={`«${menu.name}» o'chirilsinmi?`} okText="O'chirish" cancelText="Yo'q" onConfirm={() => void removeMenu(menu.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Menyuni o'chirish" />
                      </Popconfirm>
                    )}
                    <Button size="small" type="primary" loading={saving === 'menu'} onClick={() => void saveMenu()}>
                      Saqlash
                    </Button>
                  </span>
                )
              }
            >
              <Form form={form} layout="vertical" requiredMark={false} disabled={!canEdit}>
                <div className="form-row">
                  <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true }]} style={{ flex: 2 }}>
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item name="code" label="Kod (PBX)" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/, message: 'Lotin harflari, raqam, nuqta' }]} style={{ flex: 1 }}>
                    <Input className="mono" maxLength={64} />
                  </Form.Item>
                  <Form.Item name="language" label="Til" style={{ flex: 1 }}>
                    <Select allowClear options={Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                </div>
                <Form.Item name="promptId" label="Ovozli xabar" extra={data.prompts.find((p) => p.id === menu.promptId)?.text}>
                  <Select allowClear showSearch optionFilterProp="label" options={promptOptions} placeholder="Menyu matni yozilgan xabar" />
                </Form.Item>
                <div className="form-row">
                  <Form.Item name="timeoutSeconds" label="Tugmani kutish, s" rules={[{ required: true }]} style={{ flex: 1 }}>
                    <InputNumber min={2} max={30} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="maxRetries" label="Urinishlar" rules={[{ required: true }]} style={{ flex: 1 }}>
                    <InputNumber min={1} max={5} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="fallbackQueueId" label="Urinishlar tugasa" style={{ flex: 2 }}>
                    <Select allowClear options={queueOptions} placeholder="Xayrlashib uzish" />
                  </Form.Item>
                </div>
              </Form>
            </Card>

            <Card
              size="small"
              title="Tugmalar"
              extra={
                canEdit && (
                  <span className="header-actions">
                    <Button size="small" icon={<PlusOutlined />} onClick={addOption} disabled={options.length >= DIGIT_ORDER.length}>
                      Tugma
                    </Button>
                    <Button size="small" type="primary" disabled={!optionsDirty} loading={saving === 'options'} onClick={() => void saveOptions()}>
                      Saqlash
                    </Button>
                  </span>
                )
              }
            >
              {issuesOf(menu.id).length > 0 && (
                <ul className="ivr-inline-issues">
                  {issuesOf(menu.id).map((i) => (
                    <li key={i.message} className={i.level === 'error' ? 'is-error' : undefined}>
                      {i.level === 'error' ? <ExclamationCircleOutlined /> : <WarningOutlined />} {i.message.replace(`${menu.name}: `, '')}
                    </li>
                  ))}
                </ul>
              )}
              <Table<EditableOption>
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={sortedOptions}
                scroll={{ x: 640 }}
                locale={{ emptyText: "Tugmalar yo'q" }}
                columns={[
                  {
                    title: 'Tugma',
                    width: 80,
                    render: (_, o) => (
                      <Select
                        size="small"
                        value={o.digit}
                        disabled={!canEdit}
                        style={{ width: 64 }}
                        aria-label="Tugma"
                        options={DIGIT_ORDER.map((d) => ({ value: d, label: d, disabled: d !== o.digit && options.some((x) => x.digit === d) }))}
                        onChange={(digit) => update(o.key, { digit })}
                      />
                    ),
                  },
                  {
                    title: 'Nomi',
                    render: (_, o) => <Input size="small" value={o.label} disabled={!canEdit} maxLength={120} aria-label="Tugma nomi" onChange={(e) => update(o.key, { label: e.target.value })} />,
                  },
                  {
                    title: 'Amal',
                    width: 220,
                    render: (_, o) => (
                      <Select<IvrAction>
                        size="small"
                        value={o.action}
                        disabled={!canEdit}
                        style={{ width: '100%' }}
                        aria-label="Amal"
                        options={(Object.keys(ACTION_LABELS) as IvrAction[]).map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
                        onChange={(action) => update(o.key, { action })}
                      />
                    ),
                  },
                  {
                    title: 'Qayerga',
                    width: 230,
                    render: (_, o) => {
                      const target = ACTION_TARGET[o.action];
                      if (target === 'queue')
                        return <Select size="small" value={o.queueId ?? undefined} disabled={!canEdit} style={{ width: '100%' }} placeholder="Navbat" options={queueOptions} status={o.queueId ? undefined : 'error'} onChange={(queueId) => update(o.key, { queueId })} />;
                      if (target === 'menu')
                        return <Select size="small" value={o.targetMenuId ?? undefined} disabled={!canEdit} style={{ width: '100%' }} placeholder="Menyu" options={menuOptions} status={o.targetMenuId ? undefined : 'error'} onChange={(targetMenuId) => update(o.key, { targetMenuId })} />;
                      if (target === 'prompt')
                        return <Select size="small" value={o.promptId ?? undefined} disabled={!canEdit} style={{ width: '100%' }} placeholder="Xabar" options={promptOptions} status={o.promptId ? undefined : 'error'} onChange={(promptId) => update(o.key, { promptId })} />;
                      return <span className="cell-sub">—</span>;
                    },
                  },
                  {
                    title: <span className="visually-hidden">Amallar</span>,
                    width: 44,
                    render: (_, o) =>
                      canEdit && (
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`«${o.digit}» tugmasini olib tashlash`}
                          onClick={() => {
                            setOptions((list) => list.filter((x) => x.key !== o.key));
                            setOptionsDirty(true);
                          }}
                        />
                      ),
                  },
                ]}
              />
              <p className="panel-note">
                «Murojaat holatini aytish»: fuqaro raqamni terib # ni bosadi, holat ovozli o'qiladi (topilmasa — menyuning zaxira navbatiga ulanadi). Kadastr axborot tizimidagi ariza holati integratsiyadan keyin qo'shiladi.
              </p>
            </Card>
          </>
        )}
      </div>

      <Modal title="Yangi menyu" open={creating} okText="Yaratish" cancelText="Bekor qilish" onOk={() => void createMenu()} onCancel={() => setCreating(false)} destroyOnHidden>
        <Form form={newForm} layout="vertical" requiredMark={false} initialValues={{ timeoutSeconds: 5, maxRetries: 3, language: 'uz' }}>
          <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={120} placeholder="Masalan: Geodeziya bo'yicha menyu" />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="code" label="Kod (PBX)" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/, message: 'Lotin harflari, raqam, nuqta' }]} style={{ flex: 1 }}>
              <Input className="mono" placeholder="geodesy.uz" />
            </Form.Item>
            <Form.Item name="language" label="Til" style={{ flex: 1 }}>
              <Select allowClear options={Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item name="promptId" label="Ovozli xabar">
            <Select allowClear showSearch optionFilterProp="label" options={promptOptions} />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="timeoutSeconds" label="Tugmani kutish, s" style={{ flex: 1 }}>
              <InputNumber min={2} max={30} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxRetries" label="Urinishlar" style={{ flex: 1 }}>
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="fallbackQueueId" label="Urinishlar tugasa">
            <Select allowClear options={queueOptions} placeholder="Xayrlashib uzish" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
