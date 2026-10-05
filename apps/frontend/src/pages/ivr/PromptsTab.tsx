import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tooltip, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { IvrSettings, VoicePrompt } from '../../api/types';
import ToneTag from '../../components/ToneTag';
import { formatDate } from '../../format';
import type { IvrTabProps } from './IvrPage';
import { LANGUAGE_LABELS } from './ivr-labels';

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const ACCEPT = '.wav,.mp3,.ogg,.gsm,.ulaw,.alaw';

interface PromptForm {
  name: string;
  language: string;
  text: string;
}

const formatSize = (bytes: number | null) => (bytes === null ? '' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Ovozli xabarlar (diktor matni + audio) va ish vaqtidan tashqari avtojavob (F-TEL-02, F-TEL-06). */
export default function PromptsTab({ data, canEdit, reload }: IvrTabProps) {
  const { message } = App.useApp();
  const [settingsForm] = Form.useForm<IvrSettings>();
  const [promptForm] = Form.useForm<PromptForm>();
  const [editing, setEditing] = useState<VoicePrompt | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  useEffect(() => settingsForm.setFieldsValue(data.settings), [data.settings, settingsForm]);
  useEffect(() => {
    if (editing) promptForm.setFieldsValue(editing === 'new' ? { name: '', language: 'uz', text: '' } : editing);
  }, [editing, promptForm]);

  const promptOptions = data.prompts.map((p) => ({ value: p.id, label: p.name }));
  const upcoming = data.schedule.holidays.filter((d) => d >= new Date().toISOString().slice(0, 10)).sort();

  const saveSettings = async () => {
    const values = await settingsForm.validateFields();
    setSaving(true);
    try {
      await api.put('/ivr/settings', {
        entryMenuId: values.entryMenuId ?? null,
        afterHoursPromptId: values.afterHoursPromptId ?? null,
        holidayPromptId: values.holidayPromptId ?? null,
        voicemailAfterHours: values.voicemailAfterHours,
      });
      message.success('Saqlandi');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const savePrompt = async () => {
    const values = await promptForm.validateFields();
    try {
      if (editing === 'new') await api.post('/ivr/prompts', values);
      else if (editing) await api.patch(`/ivr/prompts/${editing.id}`, values);
      setEditing(null);
      message.success('Xabar saqlandi');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const upload = async (prompt: VoicePrompt, file: File) => {
    setUploading(prompt.id);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post(`/ivr/prompts/${prompt.id}/audio`, body);
      message.success(`«${prompt.name}» audiosi yuklandi`);
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const act = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      message.success(success);
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="ivr-prompts">
      <Card
        size="small"
        title="Ish vaqti va avtojavob"
        extra={
          canEdit && (
            <Button size="small" type="primary" loading={saving} onClick={() => void saveSettings()}>
              Saqlash
            </Button>
          )
        }
      >
        <Form form={settingsForm} layout="vertical" requiredMark={false} disabled={!canEdit}>
          <Form.Item name="entryMenuId" label="Boshlang'ich menyu" extra="Ish vaqtida qo'ng'iroq shu menyudan boshlanadi">
            <Select allowClear options={data.menus.map((m) => ({ value: m.id, label: m.name }))} />
          </Form.Item>
          <Form.Item name="afterHoursPromptId" label="Ish vaqtidan tashqari xabar">
            <Select allowClear options={promptOptions} />
          </Form.Item>
          <Form.Item name="holidayPromptId" label="Bayram kuni xabari" extra="Tanlanmasa ish vaqtidan tashqari xabar eshittiriladi">
            <Select allowClear options={promptOptions} />
          </Form.Item>
          <Form.Item name="voicemailAfterHours" label="Ovozli xabar qoldirish" valuePropName="checked" extra="Qoldirilgan xabar «Ovozli xabar» kanali bilan murojaat sifatida ro'yxatga olinadi">
            <Switch />
          </Form.Item>
        </Form>
        <dl className="ivr-schedule">
          <div>
            <dt>Ish kunlari</dt>
            <dd>{data.schedule.days.map((d) => WEEKDAYS[d - 1]).join(', ')}</dd>
          </div>
          <div>
            <dt>Ish vaqti</dt>
            <dd className="mono">
              {data.schedule.start}–{data.schedule.end}
            </dd>
          </div>
          <div>
            <dt>Yaqin bayramlar</dt>
            <dd>{upcoming.length ? upcoming.slice(0, 3).map(formatDate).join(', ') : "yo'q"}</dd>
          </div>
        </dl>
        <p className="panel-note">
          Ish vaqti va bayram kunlari <Link to="/settings">Tizim → Sozlamalar</Link> sahifasida o'zgartiriladi; «PBX'ga yuklash» bilan UCM6510 vaqt shartlariga o'tadi.
        </p>
      </Card>

      <Card
        size="small"
        title="Ovozli xabarlar"
        extra={
          canEdit && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Xabar
            </Button>
          )
        }
      >
        <Table<VoicePrompt>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={data.prompts}
          scroll={{ x: 760 }}
          columns={[
            {
              title: 'Xabar',
              render: (_, p) => (
                <span className="cell-stack">
                  <span className="cell-strong">
                    {p.name} <span className="cell-sub">· {LANGUAGE_LABELS[p.language] ?? p.language}</span>
                  </span>
                  <span className="cell-sub ivr-prompt-text">{p.text}</span>
                  {p.usedIn.length > 0 && <span className="cell-sub">Ishlatiladi: {p.usedIn.join(', ')}</span>}
                </span>
              ),
            },
            {
              title: 'Audio',
              width: 300,
              render: (_, p) =>
                p.hasAudio ? (
                  <span className="cell-stack">
                    <audio controls preload="none" src={`/api/ivr/prompts/${p.id}/audio?v=${encodeURIComponent(p.updatedAt)}`} className="ivr-audio" aria-label={`${p.name}: tinglash`} />
                    <span className="cell-sub">
                      {p.fileName} · {formatSize(p.sizeBytes)}
                    </span>
                  </span>
                ) : (
                  <ToneTag tone="amber">Yozib olinmagan</ToneTag>
                ),
            },
            {
              title: <span className="visually-hidden">Amallar</span>,
              width: 130,
              render: (_, p) =>
                canEdit && (
                  <span className="header-actions">
                    <Upload
                      accept={ACCEPT}
                      showUploadList={false}
                      beforeUpload={(file) => {
                        void upload(p, file);
                        return false;
                      }}
                    >
                      <Tooltip title={p.hasAudio ? 'Audioni almashtirish' : 'Audio yuklash (WAV, MP3, GSM…)'}>
                        <Button size="small" icon={<UploadOutlined />} loading={uploading === p.id} aria-label="Audio yuklash" />
                      </Tooltip>
                    </Upload>
                    <Tooltip title="Matnni tahrirlash">
                      <Button size="small" icon={<EditOutlined />} aria-label="Tahrirlash" onClick={() => setEditing(p)} />
                    </Tooltip>
                    {p.hasAudio ? (
                      <Popconfirm title="Audio o'chirilsinmi?" okText="Ha" cancelText="Yo'q" onConfirm={() => void act(() => api.delete(`/ivr/prompts/${p.id}/audio`), "Audio o'chirildi")}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label="Audioni o'chirish" />
                      </Popconfirm>
                    ) : (
                      <Popconfirm
                        title={`«${p.name}» o'chirilsinmi?`}
                        disabled={p.usedIn.length > 0}
                        okText="Ha"
                        cancelText="Yo'q"
                        onConfirm={() => void act(() => api.delete(`/ivr/prompts/${p.id}`), "Xabar o'chirildi")}
                      >
                        <Tooltip title={p.usedIn.length > 0 ? 'Ishlatilayotgan xabarni o\'chirib bo\'lmaydi' : "Xabarni o'chirish"}>
                          <Button size="small" danger icon={<DeleteOutlined />} disabled={p.usedIn.length > 0} aria-label="Xabarni o'chirish" />
                        </Tooltip>
                      </Popconfirm>
                    )}
                  </span>
                ),
            },
          ]}
        />
        <p className="panel-note">Diktor matnni o'qib yozadi; fayl 8 kHz mono WAV (yoki MP3/GSM) bo'lsa, UCM6510 uni o'zgartirmasdan ishlatadi. Har bir xabar uchun alohida o'zbek va rus variantini yarating.</p>
      </Card>

      <Modal
        title={editing === 'new' ? 'Yangi ovozli xabar' : 'Ovozli xabar'}
        open={!!editing}
        okText="Saqlash"
        cancelText="Bekor qilish"
        onOk={() => void savePrompt()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        width={600}
      >
        <Form form={promptForm} layout="vertical" requiredMark={false}>
          <div className="form-row">
            <Form.Item name="name" label="Nomi" rules={[{ required: true, whitespace: true }]} style={{ flex: 2 }}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="language" label="Til" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item name="text" label="Diktor matni" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={5} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
