import { Layout, Select } from 'antd';
import { useAuth } from '../auth/AuthContext';
import SoftphoneButton from '../components/softphone/SoftphoneButton';
import { P } from '../constants';
import KpiStrip from './KpiStrip';
import NotificationBell from './NotificationBell';

/** Har sahifada turadigan yuqori panel: bugungi ko'rsatkichlar, softfon, bildirishnomalar, til. */
export default function TopBar() {
  const { can } = useAuth();
  return (
    <Layout.Header className="topbar">
      <KpiStrip />
      <div className="topbar-actions">
        {can(P.TelephonyUse) && <SoftphoneButton />}
        <NotificationBell />
        <Select
          className="topbar-lang"
          aria-label="Interfeys tili"
          value="uz"
          style={{ width: 120 }}
          options={[
            { value: 'uz', label: "O'zbek" },
          ]}
        />
      </div>
    </Layout.Header>
  );
}
