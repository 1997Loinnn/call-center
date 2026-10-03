import { Tag } from 'antd';
import type { TicketStatus } from '../api/types';
import { STATUS_META } from '../constants';

export default function StatusTag({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
