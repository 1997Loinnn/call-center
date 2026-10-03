import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BRAND } from '../theme';

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await login(values.username.trim(), values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', background: BRAND.sider, padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Call-markaz 1097
        </Typography.Title>
        <Typography.Paragraph type="secondary">Kadastr agentligi · murojaatlar bilan ishlash tizimi</Typography.Paragraph>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label="Login" rules={[{ required: true, message: 'Loginni kiriting' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Parol" rules={[{ required: true, message: 'Parolni kiriting' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Kirish
          </Button>
        </Form>
      </Card>
    </div>
  );
}
