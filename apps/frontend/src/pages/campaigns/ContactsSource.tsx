import { DatePicker, Input, Segmented, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Category } from '../../api/types';

export type SourceKind = 'list' | 'tickets' | 'none';

export interface SourceValue {
  kind: SourceKind;
  text: string;
  range: [Dayjs, Dayjs];
  categoryId?: number;
}

export const initialSource = (kind: SourceKind = 'list'): SourceValue => ({
  kind,
  text: '',
  range: [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')],
});

/** "telefon; F.I.Sh." qatorlari → kontaktlar (ajratgich: ; , yoki tab). */
export function parseContacts(text: string): { phone: string; fullName?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [phone, ...rest] = line.split(/[;,\t]/);
      const fullName = rest.join(' ').trim();
      return { phone: phone.trim(), fullName: fullName || undefined };
    });
}

/** Backend'ga yuboriladigan qism (ContactsSourceDto). */
export function sourcePayload(value: SourceValue) {
  if (value.kind === 'list') return { contacts: parseContacts(value.text) };
  if (value.kind === 'tickets') {
    return { closedFrom: value.range[0].startOf('day').toISOString(), closedTo: value.range[1].endOf('day').toISOString(), categoryId: value.categoryId };
  }
  return {};
}

/** Kampaniya kontaktlari manbai: qo'lda ro'yxat yoki davrda yopilgan murojaatlar fuqarolari. */
export default function ContactsSource({ value, onChange, categories, allowNone }: {
  value: SourceValue;
  onChange: (value: SourceValue) => void;
  categories: Category[];
  allowNone?: boolean;
}) {
  const count = value.kind === 'list' ? parseContacts(value.text).length : 0;
  return (
    <div className="contacts-source">
      <Segmented<SourceKind>
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
        options={[
          { value: 'list', label: "Ro'yxat" },
          { value: 'tickets', label: 'Yopilgan murojaatlar' },
          ...(allowNone ? [{ value: 'none' as const, label: 'Keyinroq' }] : []),
        ]}
      />
      {value.kind === 'list' && (
        <>
          <Input.TextArea
            rows={6}
            className="mono"
            aria-label="Kontaktlar ro'yxati"
            placeholder={'+998 90 123 45 67; Aliyev Jasur\n+998 91 234 56 78; Rasulova Madina'}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
          <span className="panel-note">
            Har qatorda: telefon raqami va (ixtiyoriy) F.I.Sh. Takror va noto'g'ri raqamlar o'tkazib yuboriladi · {count} ta qator
          </span>
        </>
      )}
      {value.kind === 'tickets' && (
        <>
          <label className="field-label" htmlFor="source-range">
            Murojaat yopilgan davr
          </label>
          <DatePicker.RangePicker
            id="source-range"
            format="DD.MM.YYYY"
            allowClear={false}
            value={value.range}
            disabledDate={(d) => d.isAfter(dayjs().endOf('day'))}
            onChange={(range) => range?.[0] && range[1] && onChange({ ...value, range: [range[0], range[1]] })}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Barcha toifalar"
            aria-label="Toifa"
            value={value.categoryId}
            onChange={(categoryId?: number) => onChange({ ...value, categoryId })}
            options={categories.filter((c) => c.parentId === null).map((c) => ({ value: c.id, label: c.nameUz }))}
          />
          <span className="panel-note">Anonim va maxfiy murojaatlar olinmaydi; bir fuqaroga bitta kontakt.</span>
        </>
      )}
    </div>
  );
}
