import { Alert, App, Form } from 'antd';
import { useCallback, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Category, CitizenCard, OrgTreeNode, Region, TelephonyInfo, TicketListItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import CallBar, { type ActiveCall } from '../components/operator/CallBar';
import CallScript from '../components/operator/CallScript';
import CitizenPanel, { type ManualCitizen } from '../components/operator/CitizenPanel';
import TicketForm, { type TicketFormValues } from '../components/TicketForm';
import { P } from '../constants';
import { useAsync } from '../hooks/useAsync';
import { useSocketEvent } from '../realtime/socket';
import './operator.css';

// Murojaat raqami: 1097-2026-000123 (backend: formatTicketNumber)
const TICKET_NUMBER = /^[a-z0-9]+-\d{4}-\d{1,6}$/i;

/** Operator ish joyi (TZ 6.2): qo'ng'iroq, fuqaro kartasi va murojaat yaratish bitta ekranda. */
export default function OperatorPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [form] = Form.useForm<TicketFormValues>();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [card, setCard] = useState<CitizenCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [created, setCreated] = useState<TicketListItem | null>(null);
  const [route, setRoute] = useState<{ name?: string; slaDays?: number }>({});

  const telephony = can(P.TelephonyUse);
  const info = useAsync(
    () => (telephony ? api.get<TelephonyInfo>('/telephony/info').then((r) => r.data) : Promise.resolve(null)),
    [telephony],
  );
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

  const loadCard = useCallback(
    async (query: string) => {
      setCardLoading(true);
      try {
        const params = TICKET_NUMBER.test(query.trim()) ? { ticket: query.trim() } : { phone: query };
        const next = (await api.get<CitizenCard>('/citizens/card', { params })).data;
        setCard(next);
        // Karta ochilganda murojaat formasidagi fuqaro ma'lumotlari to'ldiriladi
        form.setFieldsValue({
          citizenPhone: next.phone,
          citizenName: next.citizen?.fullName ?? form.getFieldValue('citizenName'),
          ...(next.citizen?.region ? { regionId: next.citizen.region.id, districtId: next.citizen.district?.id } : {}),
        });
      } catch (err) {
        message.error(errorMessage(err));
      } finally {
        setCardLoading(false);
      }
    },
    [form, message],
  );

  useSocketEvent<{ pbxCallId: string; callerNumber: string }>('call.ringing', (event) => {
    setCall({ ...event, state: 'ringing' });
    setCreated(null);
    void loadCard(event.callerNumber);
  });
  useSocketEvent<{ pbxCallId: string }>('call.answered', (event) =>
    setCall((c) => (c?.pbxCallId === event.pbxCallId ? { ...c, state: 'talking', talkStartedAt: Date.now() } : c)),
  );
  useSocketEvent<{ pbxCallId: string }>('call.ended', (event) =>
    setCall((c) => (c?.pbxCallId === event.pbxCallId ? { ...c, state: 'ended', endedAt: Date.now() } : c)),
  );

  const simulate = async (number: string) => {
    try {
      await api.post('/telephony/dev/simulate-call', { number });
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onManual = (values: ManualCitizen) => {
    setCard(null);
    form.setFieldsValue(values);
    message.success("Fuqaro ma'lumotlari murojaat formasiga qo'shildi");
  };

  const onCreated = (ticket: TicketListItem) => {
    setCreated(ticket);
    form.resetFields();
    if (card) void loadCard(card.phone);
  };

  const onRouteChange = useCallback((name: string | undefined, slaDays: number | undefined) => setRoute({ name, slaDays }), []);

  return (
    <>
      <div className="page-header">
        <h1>Operator paneli</h1>
      </div>
      {reference.error && <Alert type="error" showIcon message={reference.error} style={{ marginBottom: 16 }} />}
      <div className="operator-grid">
        <div className="operator-main">
          {telephony && <CallBar call={call} info={info.data ?? null} onSimulate={simulate} onDismiss={() => setCall(null)} />}
          <TicketForm
            form={form}
            pbxCallId={call?.pbxCallId}
            categories={categories}
            regions={regions}
            orgTree={orgTree}
            created={created}
            onCreated={onCreated}
            onRouteChange={onRouteChange}
          />
        </div>
        <div className="operator-side">
          <CitizenPanel
            card={card}
            loading={cardLoading}
            regions={regions}
            onSearch={loadCard}
            onManual={onManual}
            onClear={() => setCard(null)}
          />
          <CallScript routeName={route.name} slaDays={route.slaDays} />
        </div>
      </div>
    </>
  );
}
