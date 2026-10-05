import { ArrowLeftOutlined, CheckOutlined, GlobalOutlined, MessageOutlined, SafetyOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth, type LoginResponse, type MfaStep } from '../auth/AuthContext';
import TwoFactorSetup from '../components/TwoFactorSetup';
import './login.css';

interface LoginForm {
  username: string;
  password: string;
}

type Mode = 'password' | 'sms';

const FEATURES = [
  "UCM6510 orqali qo'ng'iroqlar va ularning yozuvlari",
  'Fuqaro kartasi va murojaatlar tarixi',
  "Bo'linmalarga yo'naltirish va ijro nazorati",
  'Jonli monitoring, hisobotlar va audit',
];

/**
 * Tizimga kirish (prototip: Kirish artboardi): login + parol yoki SMS kodi; rahbariyat, supervisor va administratorlar
 * uchun ikkinchi bosqich — autentifikator ilovasi kodi. 5 xatodan keyin hisob vaqtincha bloklanadi (TZ 9-bo'lim).
 */
export default function LoginPage() {
  const { user, completeLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('password');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  // SMS kodi bosqichi
  const [codeSentTo, setCodeSentTo] = useState<{ username: string } | null>(null);
  const [smsCode, setSmsCode] = useState('');
  // Ikkinchi bosqich (2FA)
  const [mfa, setMfa] = useState<MfaStep | null>(null);
  const [totp, setTotp] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);

  // Ilovani ulash kerak bo'lsa — kalit va QR olinadi
  useEffect(() => {
    if (!mfa?.setup) return;
    api
      .post<{ secret: string; uri: string }>('/auth/2fa/setup', { challenge: mfa.challenge })
      .then((r) => setSetup(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [mfa]);

  if (user) return <Navigate to="/" replace />;

  const go = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  };

  /** Server javobi: kirish yakunlandi yoki ikkinchi bosqich. */
  const run = async (request: () => Promise<{ data: LoginResponse }>) => {
    setSubmitting(true);
    setError(undefined);
    try {
      const next = completeLogin((await request()).data);
      if (next) {
        setMfa(next);
        setTotp('');
      } else go();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const requestCode = async (username: string) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await api.post('/auth/code/request', { username });
      setCodeSentTo({ username });
      setSmsCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setMfa(null);
    setSetup(null);
    setCodeSentTo(null);
    setError(undefined);
  };

  let card;
  if (mfa && mfa.setup) {
    card = (
      <>
        <h2>Ikki bosqichli himoyani ulash</h2>
        <p className="page-sub">Rolingiz uchun majburiy (TZ 4-bo'lim): keyingi kirishlarda parol bilan birga ilovadagi kod so'raladi.</p>
        {error && <Alert type="error" message={error} showIcon className="login-error" />}
        <TwoFactorSetup
          secret={setup?.secret ?? null}
          uri={setup?.uri ?? null}
          busy={submitting}
          onConfirm={(code) => void run(() => api.post('/auth/2fa/enable', { challenge: mfa.challenge, code }))}
        />
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={back}>
          Orqaga
        </Button>
      </>
    );
  } else if (mfa) {
    card = (
      <>
        <h2>Tasdiqlash kodi</h2>
        <p className="page-sub">Autentifikator ilovasidagi 6 raqamli kodni kiriting</p>
        {error && <Alert type="error" message={error} showIcon className="login-error" />}
        <div className="login-otp">
          <Input.OTP length={6} value={totp} onChange={setTotp} autoFocus size="large" aria-label="Ilova kodi" />
        </div>
        <Button
          type="primary"
          size="large"
          block
          loading={submitting}
          disabled={totp.length !== 6}
          onClick={() => void run(() => api.post('/auth/2fa/verify', { challenge: mfa.challenge, code: totp }))}
        >
          Kirish
        </Button>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={back}>
          Boshqa hisob bilan kirish
        </Button>
        <div className="login-note">
          <SafetyOutlined aria-hidden />
          <span>Telefoningiz yo'qolgan bo'lsa, administrator ikki bosqichli himoyani bekor qiladi.</span>
        </div>
      </>
    );
  } else {
    card = (
      <>
        <h2>Tizimga kirish</h2>
        <p className="page-sub">{mode === 'password' ? 'Agentlik bergan login va parolingizni kiriting' : "Login kiriting — telefoningizga bir martalik kod yuboriladi"}</p>
        <Segmented<Mode>
          block
          value={mode}
          className="login-mode"
          onChange={(m) => {
            setMode(m);
            back();
          }}
          options={[
            { value: 'password', label: 'Login va parol' },
            { value: 'sms', label: 'SMS kod' },
          ]}
        />
        {error && <Alert type="error" message={error} showIcon className="login-error" />}
        {mode === 'password' ? (
          <Form<LoginForm> layout="vertical" onFinish={(v) => void run(() => api.post('/auth/login', { username: v.username.trim(), password: v.password }))} requiredMark={false}>
            <Form.Item name="username" label="Login" rules={[{ required: true, message: 'Loginni kiriting' }]}>
              <Input size="large" autoComplete="username" placeholder="masalan, operator1" autoFocus />
            </Form.Item>
            <Form.Item name="password" label="Parol" rules={[{ required: true, message: 'Parolni kiriting' }]}>
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              Davom etish
            </Button>
          </Form>
        ) : !codeSentTo ? (
          <Form<{ username: string }> layout="vertical" onFinish={(v) => void requestCode(v.username.trim())} requiredMark={false}>
            <Form.Item name="username" label="Login" rules={[{ required: true, message: 'Loginni kiriting' }]}>
              <Input size="large" autoComplete="username" placeholder="masalan, operator1" autoFocus />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} icon={<MessageOutlined />}>
              Kod yuborish
            </Button>
          </Form>
        ) : (
          <>
            <p className="login-sent">
              Kod hisobingizdagi telefon raqamiga yuborildi va 5 daqiqa amal qiladi. Kelmasa — login to'g'ri ekanini va telefon raqamingiz
              kiritilganini tekshiring yoki login va parol bilan kiring.
            </p>
            <div className="login-otp">
              <Input.OTP length={6} value={smsCode} onChange={setSmsCode} autoFocus size="large" aria-label="SMS kodi" />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              disabled={smsCode.length !== 6}
              onClick={() => void run(() => api.post('/auth/code/verify', { username: codeSentTo.username, code: smsCode }))}
            >
              Kirish
            </Button>
            <Button type="link" onClick={() => void requestCode(codeSentTo.username)} disabled={submitting}>
              Kodni qayta yuborish
            </Button>
          </>
        )}
        <div className="login-note">
          <SafetyOutlined aria-hidden />
          <span>5 marta noto'g'ri kiritilsa, hisob vaqtincha bloklanadi. Har bir kirish audit jurnaliga yoziladi.</span>
        </div>
      </>
    );
  }

  return (
    <div className="login">
      <aside className="login-intro">
        <div className="login-brand">
          <span className="sider-logo" aria-hidden="true">
            <GlobalOutlined />
          </span>
          <span className="sider-brand-text">
            <span className="sider-brand-name">1097 Call-markaz</span>
            <span className="sider-brand-sub">Kadastr agentligi</span>
          </span>
        </div>
        <div className="login-pitch">
          <span className="login-kicker mono">1097 · ishonch telefoni</span>
          <h1>«Zamonaviy Call-markaz» yagona axborot tizimi</h1>
          <p>Operatorlar, bo'linmalar va rahbariyat uchun yagona ish joyi: qo'ng'iroqlar, fuqaro kartasi, murojaatlar ijrosi va hisobotlar.</p>
          <ul>
            {FEATURES.map((f) => (
              <li key={f}>
                <span className="login-check" aria-hidden>
                  <CheckOutlined />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <span className="login-foot">Ishlab chiqaruvchi: GeoInfoCom · Ma'lumotlar agentlik serverlarida saqlanadi</span>
      </aside>

      <main className="login-main">
        <Select className="login-lang" aria-label="Interfeys tili" value="uz" options={[{ value: 'uz', label: "O'zbek" }]} />
        <div className="login-card">{card}</div>
      </main>
    </div>
  );
}
