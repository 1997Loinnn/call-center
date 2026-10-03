import { PhoneOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Card, Col, Descriptions, Form, Input, Row, Space, Typography } from 'antd';
import { useCallback, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { CitizenCard, TelephonyInfo, TicketListItem } from '../api/types';
import CitizenCardView from '../components/CitizenCardView';
import TicketForm, { type TicketFormValues } from '../components/TicketForm';
import { useAsync } from '../hooks/useAsync';
import { useSocketEvent } from '../realtime/socket';

interface ActiveCall {
  pbxCallId: string;
  callerNumber: string;
  state: 'ringing' | 'talking' | 'ended';
}

const CALL_STATE: Record<ActiveCall['state'], { text: string; badge: 'processing' | 'success' | 'default' }> = {
  ringing: { text: 'Jiringlamoqda', badge: 'processing' },
  talking: { text: 'Suhbatda', badge: 'success' },
  ended: { text: 'Yakunlandi', badge: 'default' },
};

/** Operator ish joyi (TZ 6.2): kiruvchi qo'ng'iroq, fuqaro kartasi va murojaat kartasi bitta ekranda. */
export default function OperatorPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<TicketFormValues>();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [card, setCard] = useState<CitizenCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [testNumber, setTestNumber] = useState('+998 90 123 45 67');
  const info = useAsync(() => api.get<TelephonyInfo>('/telephony/info').then((r) => r.data), []);

  const loadCard = useCallback(
    async (phone: string) => {
      if (!phone.trim()) return;
      setCardLoading(true);
      try {
        setCard((await api.get<CitizenCard>('/citizens/card', { params: { phone } })).data);
      } catch (err) {
        message.error(errorMessage(err));
      } finally {
        setCardLoading(false);
      }
    },
    [message],
  );

  useSocketEvent<{ pbxCallId: string; callerNumber: string }>('call.ringing', (event) => {
    setCall({ ...event, state: 'ringing' });
    form.setFieldsValue({ citizenPhone: event.callerNumber });
    void loadCard(event.callerNumber);
  });
  useSocketEvent<{ pbxCallId: string }>('call.answered', (event) =>
    setCall((current) => (current?.pbxCallId === event.pbxCallId ? { ...current, state: 'talking' } : current)),
  );
  useSocketEvent<{ pbxCallId: string }>('call.ended', (event) =>
    setCall((current) => (current?.pbxCallId === event.pbxCallId ? { ...current, state: 'ended' } : current)),
  );

  const simulate = async () => {
    try {
      await api.post('/telephony/dev/simulate-call', { number: testNumber });
      message.info("Test qo'ng'irog'i yuborildi");
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onCreated = (ticket: TicketListItem) => {
    message.success(`Murojaat saqlandi: ${ticket.number}`);
    form.resetFields();
    if (card) void loadCard(card.phone);
  };

  return (
    <>
      <div className="page-header">
        <h1>Operator paneli</h1>
      </div>
      <Row gutter={16}>
        <Col xs={24} xl={9}>
          <Card title="Qo'ng'iroq" size="small">
            {call ? (
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Raqam">
                  <Typography.Text strong>{call.callerNumber}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Holat">
                  <Badge status={CALL_STATE[call.state].badge} text={CALL_STATE[call.state].text} />
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Text type="secondary">Kiruvchi qo'ng'iroq kutilmoqda</Typography.Text>
            )}
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message={`Ichki raqam: ${info.data?.sipExtension ?? '—'} · PBX: ${info.data?.driver ?? '—'}`}
              description="Brauzerdagi WebRTC softfon (SIP.js) UCM6510 tekshiruvidan keyin ulanadi. Hozircha ovoz MicroSIP orqali, kartalar esa shu yerda."
            />
            {info.data?.driver === 'mock' && (
              <Space.Compact style={{ width: '100%', marginTop: 12 }}>
                <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} />
                <Button icon={<PhoneOutlined />} onClick={simulate}>
                  Test qo'ng'iroq
                </Button>
              </Space.Compact>
            )}
          </Card>
          <CitizenCardView card={card} loading={cardLoading} onSearch={loadCard} />
        </Col>
        <Col xs={24} xl={15}>
          <TicketForm form={form} pbxCallId={call?.pbxCallId} onCreated={onCreated} />
        </Col>
      </Row>
    </>
  );
}
