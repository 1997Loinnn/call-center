import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Modal, Skeleton } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import TwoFactorSetup from '../components/TwoFactorSetup';
import ToneTag from '../components/ToneTag';
import { useAsync } from '../hooks/useAsync';

/** O'z hisobim → Xavfsizlik: ikki bosqichli himoyani ulash yoki (rol talab qilmasa) o'chirish. */
export default function SecurityModal({ onClose }: { onClose: () => void }) {
  const { message } = App.useApp();
  const status = useAsync(() => api.get<{ enabled: boolean; required: boolean }>('/auth/2fa').then((r) => r.data), []);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const start = async () => {
    setBusy(true);
    try {
      setSetup((await api.post<{ secret: string; uri: string }>('/auth/2fa/self-setup')).data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const enable = async (value: string) => {
    setBusy(true);
    try {
      await api.post('/auth/2fa/self-enable', { code: value });
      message.success('Ikki bosqichli himoya yoqildi');
      setSetup(null);
      await status.reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.post('/auth/2fa/self-disable', { code });
      message.success("Ikki bosqichli himoya o'chirildi");
      setCode('');
      await status.reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const s = status.data;
  return (
    <Modal open title="Xavfsizlik" footer={null} onCancel={onClose} width={560} destroyOnHidden>
      {status.error && <Alert type="error" showIcon message={status.error} />}
      {!s ? (
        <Skeleton active />
      ) : (
        <div className="security-modal">
          <div className="security-row">
            <SafetyCertificateOutlined className="security-icon" />
            <span className="cell-stack">
              <span className="cell-strong">Ikki bosqichli himoya (2FA)</span>
              <span className="cell-sub">Kirishda parol bilan birga telefoningizdagi ilova kodi so'raladi{s.required ? ' — rolingiz uchun majburiy' : ''}.</span>
            </span>
            {s.enabled ? <ToneTag tone="green">Yoqilgan</ToneTag> : <ToneTag tone={s.required ? 'red' : 'grey'}>O'chiq</ToneTag>}
          </div>
          {!s.enabled && !setup && (
            <Button type="primary" loading={busy} onClick={() => void start()}>
              Ilovani ulash
            </Button>
          )}
          {!s.enabled && setup && <TwoFactorSetup secret={setup.secret} uri={setup.uri} busy={busy} onConfirm={(v) => void enable(v)} />}
          {s.enabled && !s.required && (
            <div className="tfa-confirm">
              <Input.OTP length={6} value={code} onChange={setCode} aria-label="Ilova kodi" />
              <Button danger loading={busy} disabled={code.length !== 6} onClick={() => void disable()}>
                O'chirish
              </Button>
            </div>
          )}
          {s.enabled && s.required && <p className="panel-note">Telefon almashtirilsa yoki yo'qolsa, administrator 2FA ni bekor qiladi va keyingi kirishda yangi telefon ulanadi.</p>}
        </div>
      )}
    </Modal>
  );
}
