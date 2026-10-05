import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import { App, Button, Card, Drawer, Form, Input, Skeleton, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ChannelState, OmniChannels, OmniSettings } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import ToneTag from '../../components/ToneTag';
import { P } from '../../constants';
import { useAsync } from '../../hooks/useAsync';
import type { Tone } from '../../theme';

const STATE: Record<ChannelState, { label: string; tone: Tone }> = {
  connected: { label: 'Ulangan', tone: 'green' },
  error: { label: 'Xato', tone: 'red' },
  off: { label: 'Ulanmagan', tone: 'grey' },
};

/** Kanallar holati, sayt uchun vidjet kodi, ulanish yo'riqnomasi va avtomatik javoblar. */
export default function ChannelsDrawer({ channels, onClose }: { channels: OmniChannels; onClose: () => void }) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canEdit = can(P.SettingsManage);
  const [form] = Form.useForm<OmniSettings>();
  const [saving, setSaving] = useState(false);
  const settings = useAsync(() => api.get<OmniSettings>('/omni/settings').then((r) => r.data), []);

  useEffect(() => {
    if (settings.data) form.setFieldsValue(settings.data);
  }, [settings.data, form]);

  const origin = window.location.origin;
  const snippet = `<script src="${origin}${channels.webchat.widgetPath}" async></script>`;

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      settings.setData((await api.put<OmniSettings>('/omni/settings', values)).data);
      message.success('Avtomatik javoblar saqlandi');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => message.success('Nusxa olindi'),
      () => message.info('Matnni belgilab nusxa oling'),
    );
  };

  const tg = channels.telegram;
  const mail = channels.email;

  return (
    <Drawer open width={640} title="Omnikanal kanallari" onClose={onClose}>
      <div className="omni-channels">
        <Card size="small" title="Veb-chat (kadastr.uz sayti)" extra={<ToneTag tone="green">Ishlaydi</ToneTag>}>
          <p className="panel-note">Saytning har bir sahifasiga (masalan, &lt;/body&gt; oldiga) shu qatorni qo'ying — o'ng pastki burchakda «Onlayn yordam» tugmasi chiqadi:</p>
          <div className="omni-code">
            <code>{snippet}</code>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(snippet)} aria-label="Kodni nusxalash" />
          </div>
          <a href={channels.webchat.pagePath} target="_blank" rel="noreferrer">
            <ExportOutlined /> Fuqaro ko'rinishida sinab ko'rish
          </a>
          <p className="panel-note">Vidjet sahifasini boshqa saytga joylash uchun nginx'dagi «frame-ancestors» ro'yxatiga sayt manzili qo'shiladi.</p>
        </Card>

        <Card size="small" title="Telegram bot" extra={<ToneTag tone={STATE[tg.state].tone}>{STATE[tg.state].label}</ToneTag>}>
          {tg.state === 'connected' ? (
            <p>
              <a href={`https://t.me/${tg.username}`} target="_blank" rel="noreferrer">
                @{tg.username}
              </a>{' '}
              · {tg.mode === 'webhook' ? 'webhook' : 'long polling'}
            </p>
          ) : (
            <>
              {tg.error && <p className="cell-sub-danger">{tg.error}</p>}
              <ol className="omni-steps">
                <li>Telegram'da @BotFather orqali bot yarating va tokenni oling.</li>
                <li>
                  Backend <span className="mono">.env</span> fayliga <span className="mono">TELEGRAM_BOT_TOKEN=…</span> qo'shing va backendni qayta ishga tushiring.
                </li>
                <li>
                  Server internetga faqat chiquvchi ulanish bilan chiqsa — long polling ishlaydi. Tashqi HTTPS manzil bo'lsa, <span className="mono">TELEGRAM_WEBHOOK_URL</span> (…/api/public/telegram/webhook) va{' '}
                  <span className="mono">TELEGRAM_WEBHOOK_SECRET</span> bering.
                </li>
              </ol>
            </>
          )}
          <p className="panel-note">Bot fuqaroga: murojaat yuborish, raqam bo'yicha holatni bilish, telefon raqamni ulashish (fuqaro kartasiga avtomatik bog'lanadi) va operator bilan yozishma.</p>
        </Card>

        <Card
          size="small"
          title="Email"
          extra={
            <span className="header-actions">
              <ToneTag tone={STATE[mail.inbound].tone}>Kiruvchi: {STATE[mail.inbound].label.toLowerCase()}</ToneTag>
              <ToneTag tone={STATE[mail.outbound].tone}>Javob: {STATE[mail.outbound].label.toLowerCase()}</ToneTag>
            </span>
          }
        >
          {mail.address && <p className="mono">{mail.address}</p>}
          {mail.error && <p className="cell-sub-danger">{mail.error}</p>}
          <ol className="omni-steps">
            <li>
              Javoblar uchun: <span className="mono">SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM</span>.
            </li>
            <li>
              Kiruvchi xatlar: <span className="mono">EMAIL_INBOUND_SECRET</span> bering va pochta serverida murojaat qutisi xatlarini yo'naltiring, masalan Postfix:
              <div className="omni-code">
                <code>{`| curl -s --data-binary @- -H "Content-Type: message/rfc822" -H "X-Inbound-Secret: …" ${origin}/api/public/email/inbound`}</code>
              </div>
            </li>
          </ol>
          <p className="panel-note">Javob xati fuqaro xatiga zanjir bo'lib boradi (In-Reply-To); fuqaro javob qaytarsa, o'sha suhbatga qo'shiladi.</p>
        </Card>

        <Card
          size="small"
          title="Avtomatik javoblar"
          extra={
            canEdit && (
              <Button size="small" type="primary" loading={saving} onClick={() => void save()}>
                Saqlash
              </Button>
            )
          }
        >
          {!settings.data ? (
            <Skeleton active />
          ) : (
            <Form form={form} layout="vertical" requiredMark={false} disabled={!canEdit}>
              <Form.Item name="autoReply" label="Avtomatik javob berish" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="greeting" label="Salomlashish (yangi suhbatda)" rules={[{ required: true, whitespace: true }]}>
                <Input.TextArea rows={3} maxLength={1000} showCount />
              </Form.Item>
              <Form.Item name="afterHours" label="Ish vaqtidan tashqari qo'shimcha" rules={[{ required: true, whitespace: true }]}>
                <Input.TextArea rows={2} maxLength={1000} showCount />
              </Form.Item>
              <Form.Item name="ticketCreated" label="Murojaat ro'yxatga olindi" extra="{raqam} — murojaat raqami" rules={[{ required: true, whitespace: true }]}>
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
            </Form>
          )}
          <Typography.Paragraph type="secondary" className="panel-note">
            Fuqaro murojaat raqamini yuborsa (masalan, 1097-2026-000123), holati avtomatik javob qilinadi.
          </Typography.Paragraph>
        </Card>
      </div>
    </Drawer>
  );
}
