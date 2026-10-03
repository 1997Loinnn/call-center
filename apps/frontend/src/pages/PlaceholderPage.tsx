import { ClockCircleOutlined } from '@ant-design/icons';
import { Result, Typography } from 'antd';
import { useParams } from 'react-router-dom';

// Yo'l xaritasidagi modullar (TZ 13-bo'lim) va ularning talablari (TZ 6-bo'lim)
const MODULES: Record<string, { title: string; requirements: string; month: number; summary: string }> = {
  routing: {
    title: "Yo'naltirish qoidalari",
    requirements: "F-CRM-03, F-ADM-02",
    month: 3,
    summary: "Toifa va hudud bo'yicha mas'ul bo'linma jadvalini tahrirlash. Jadval bazada bor va hozir ham ishlaydi (seed).",
  },
  categories: {
    title: 'Murojaat toifalari',
    requirements: 'F-ADM-02',
    month: 3,
    summary: "Toifalar, ijro muddatlari va maxfiylik belgisini boshqarish.",
  },
  export: {
    title: 'Eksport shablonlari',
    requirements: 'F-REP-05',
    month: 4,
    summary: 'Excel va PDF eksport shablonlari, hisobotlarni jadval bo\'yicha email orqali yuborish.',
  },
  ivr: {
    title: 'Navbatlar va IVR',
    requirements: 'F-TEL-02, F-TEL-03, F-ADM-03',
    month: 2,
    summary: "IVR menyusi, navbatlar va ish vaqti sozlamalari (UCM6510 integratsiyasi bilan).",
  },
  omnichannel: {
    title: 'Omnikanal',
    requirements: 'F-OMNI-01 — F-OMNI-04',
    month: 5,
    summary: 'Telegram bot, veb-chat va email murojaatlari bitta operator oynasida.',
  },
  live: {
    title: 'Jonli holat',
    requirements: 'F-MON-01, F-MON-02, F-MON-04',
    month: 4,
    summary: "Navbatdagi qo'ng'iroqlar, operatorlar holati, suhbatni tinglash va videodevor rejimi.",
  },
  alerts: {
    title: 'Ogohlantirishlar',
    requirements: 'F-MON-03',
    month: 4,
    summary: "Navbat va kutish vaqti chegaralari oshganda supervisorga ogohlantirish.",
  },
  analytics: {
    title: 'Analitika va hisobotlar',
    requirements: 'F-REP-01 — F-REP-04, F-BIL-04',
    month: 4,
    summary: "Qo'ng'iroqlar, operator samaradorligi, ijro intizomi, hududlar xaritasi va billing hisobotlari.",
  },
  settings: {
    title: 'Sozlamalar',
    requirements: 'F-ADM-01 — F-ADM-04',
    month: 2,
    summary: "Ish vaqti, bayramlar, saqlash muddatlari, SMS shablonlari va integratsiyalar holati.",
  },
};

export default function PlaceholderPage() {
  const { module = '' } = useParams();
  const info = MODULES[module];
  if (!info) return <Result status="404" title="Modul topilmadi" />;
  return (
    <Result
      icon={<ClockCircleOutlined />}
      title={info.title}
      subTitle={`Yo'l xaritasi bo'yicha ${info.month}-oyda ishga tushadi · TZ talablari: ${info.requirements}`}
      extra={<Typography.Paragraph type="secondary" style={{ maxWidth: 560, margin: '0 auto' }}>{info.summary}</Typography.Paragraph>}
    />
  );
}
