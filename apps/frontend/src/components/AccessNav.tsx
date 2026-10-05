import { Segmented } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

/** Kirish boshqaruvi sahifalari orasida o'tish (prototip: "Foydalanuvchilar | Rollar va huquqlar"). */
export default function AccessNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <Segmented
      value={pathname.startsWith('/roles') ? '/roles' : '/users'}
      onChange={(path) => navigate(path)}
      options={[
        { value: '/users', label: 'Foydalanuvchilar' },
        { value: '/roles', label: 'Rollar va huquqlar' },
      ]}
    />
  );
}
