import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Input, QRCode, Skeleton } from 'antd';
import { useState } from 'react';

/**
 * Autentifikator ilovasini ulash: QR kod (yoki kalitni qo'lda kiritish) va ilovadagi birinchi kod bilan tasdiqlash.
 * Kirish jarayonida ham, "Xavfsizlik" oynasida ham ishlatiladi.
 */
export default function TwoFactorSetup({ secret, uri, busy, onConfirm }: {
  secret: string | null;
  uri: string | null;
  busy: boolean;
  onConfirm: (code: string) => void;
}) {
  const { message } = App.useApp();
  const [code, setCode] = useState('');

  if (!secret || !uri) return <Skeleton active paragraph={{ rows: 4 }} />;

  return (
    <div className="tfa-setup">
      <ol className="tfa-steps">
        <li>Telefoningizga autentifikator ilovasini o'rnating (Google Authenticator, Microsoft Authenticator yoki boshqasi).</li>
        <li>Ilovada «QR kodni skanerlash» ni tanlang:</li>
      </ol>
      <div className="tfa-qr">
        <QRCode value={uri} size={176} bordered={false} />
        <div className="tfa-key">
          <span className="cell-sub">Skanerlab bo'lmasa, kalitni qo'lda kiriting:</span>
          <code className="mono">{secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => void navigator.clipboard?.writeText(secret).then(() => message.success('Kalit nusxalandi'), () => undefined)}
          >
            Nusxalash
          </Button>
        </div>
      </div>
      <ol className="tfa-steps" start={3}>
        <li>Ilovada paydo bo'lgan 6 raqamli kodni kiriting:</li>
      </ol>
      <div className="tfa-confirm">
        <Input.OTP length={6} value={code} onChange={setCode} autoFocus aria-label="Tasdiqlash kodi" />
        <Button type="primary" loading={busy} disabled={code.length !== 6} onClick={() => onConfirm(code)}>
          Tasdiqlash
        </Button>
      </div>
    </div>
  );
}
