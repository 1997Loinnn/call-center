import type { TicketStatus } from '../api/types';
import { STATUS_META } from '../constants';
import ToneTag from './ToneTag';

export default function StatusTag({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  return <ToneTag tone={meta.tone}>{meta.label}</ToneTag>;
}
