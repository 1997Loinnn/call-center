import { Card, Descriptions, Empty, Input, List, Skeleton, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { CitizenCard } from '../api/types';
import { formatDate, formatDateTime, formatDuration } from '../format';
import StatusTag from './StatusTag';

/** Fuqaro kartasi (F-OP-02): shu raqamdan oldingi murojaatlar va qo'ng'iroqlar. */
export default function CitizenCardView({ card, loading, onSearch }: {
  card: CitizenCard | null;
  loading: boolean;
  onSearch: (phone: string) => void;
}) {
  return (
    <Card title="Fuqaro kartasi" size="small" style={{ marginTop: 16 }}>
      <Input.Search placeholder="Telefon raqami bo'yicha qidirish" enterButton="Qidirish" onSearch={onSearch} allowClear />
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !card ? (
          <Empty description="Qo'ng'iroq kelganda karta avtomatik ochiladi" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Telefon">{card.phone}</Descriptions.Item>
              <Descriptions.Item label="F.I.Sh.">{card.citizen?.fullName ?? <Typography.Text type="secondary">Yangi fuqaro</Typography.Text>}</Descriptions.Item>
              {card.citizen?.region && <Descriptions.Item label="Hudud">{card.citizen.region.nameUz}</Descriptions.Item>}
              <Descriptions.Item label="Qo'ng'iroqlar">
                {card.calls.length > 0
                  ? `${card.calls.length} ta, oxirgisi ${formatDateTime(card.calls[0].startedAt)} (${formatDuration(card.calls[0].talkSeconds)})`
                  : "yo'q"}
              </Descriptions.Item>
            </Descriptions>
            <List
              size="small"
              header={<Typography.Text strong>Oldingi murojaatlar ({card.tickets.length})</Typography.Text>}
              locale={{ emptyText: "Murojaatlar yo'q" }}
              dataSource={card.tickets}
              renderItem={(t) => (
                <List.Item extra={<StatusTag status={t.status} />}>
                  <List.Item.Meta
                    title={<Link to={`/tickets/${t.id}`}>{t.number}</Link>}
                    description={`${t.subject} · ${formatDate(t.createdAt)}${t.assignedOrgUnit ? ` · ${t.assignedOrgUnit.name}` : ''}`}
                  />
                </List.Item>
              )}
            />
          </Space>
        )}
      </div>
    </Card>
  );
}
