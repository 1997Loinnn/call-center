import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Segmented, Statistic, Table } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import RegionMap from '../components/charts/RegionMap';
import type { Summary, TicketStatus } from '../api/types';
import StatusTag from '../components/StatusTag';
import { STATUS_META } from '../constants';
import { formatDuration } from '../format';
import { useAsync } from '../hooks/useAsync';

const REFRESH_MS = 60_000;

function StatTile({ label, value, suffix, prefix, critical }: {
  label: string;
  value: number | string;
  suffix?: string;
  prefix?: ReactNode;
  critical?: boolean;
}) {
  return (
    <Card size="small">
      <Statistic
        title={label}
        value={value}
        suffix={suffix}
        prefix={prefix}
        valueStyle={{ fontWeight: 600, ...(critical ? { color: '#cf1322' } : {}) }}
      />
    </Card>
  );
}

/** Rahbariyat dashboardi (F-REP-06): bugungi qo'ng'iroqlar va murojaatlar holati. */
export default function DashboardPage() {
  const [regionView, setRegionView] = useState<'map' | 'table'>('map');
  const { data, loading, error, reload } = useAsync(() => api.get<Summary>('/reports/summary').then((r) => r.data), []);

  useEffect(() => {
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const calls = data?.callsToday;
  const statusRows = (Object.keys(STATUS_META) as TicketStatus[]).map((status) => ({
    status,
    count: data?.tickets.byStatus[status] ?? 0,
  }));
  const open = statusRows.filter((row) => row.status !== 'CLOSED').reduce((sum, row) => sum + row.count, 0);
  const answeredShare = calls && calls.total > 0 ? Math.round((calls.answered / calls.total) * 100) : null;
  const overdue = data?.tickets.overdue ?? 0;

  return (
    <>
      <div className="page-header">
        <h1>Bosh sahifa</h1>
        <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>
          Yangilash
        </Button>
      </div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <StatTile label="Bugun kelgan qo'ng'iroqlar" value={calls?.total ?? 0} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile label="Javob berilgan" value={calls?.answered ?? 0} suffix={answeredShare !== null ? `· ${answeredShare}%` : undefined} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile label="Javobsiz" value={calls?.abandoned ?? 0} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile label="O'rtacha kutish" value={formatDuration(calls?.avgWaitSeconds ?? 0)} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile label="Ochiq murojaatlar" value={open} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile
            label="Muddati o'tgan"
            value={overdue}
            prefix={overdue > 0 ? <WarningOutlined /> : undefined}
            critical={overdue > 0}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Murojaatlar holati" size="small">
            <Table
              size="small"
              rowKey="status"
              pagination={false}
              loading={loading && !data}
              dataSource={statusRows}
              columns={[
                { title: 'Holat', dataIndex: 'status', render: (s: TicketStatus) => <StatusTag status={s} /> },
                { title: 'Soni', dataIndex: 'count', align: 'right', className: 'num' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Hududlar bo'yicha murojaatlar"
            size="small"
            extra={
              <Segmented<'map' | 'table'>
                size="small"
                value={regionView}
                onChange={setRegionView}
                options={[
                  { value: 'map', label: 'Xarita' },
                  { value: 'table', label: 'Jadval' },
                ]}
              />
            }
          >
            {regionView === 'map' ? (
              <RegionMap data={data?.tickets.byRegion ?? []} />
            ) : (
            <Table
              size="small"
              rowKey="region"
              pagination={false}
              loading={loading && !data}
              dataSource={data?.tickets.byRegion ?? []}
              locale={{ emptyText: "Hozircha ma'lumot yo'q" }}
              columns={[
                { title: 'Hudud', dataIndex: 'region' },
                { title: 'Soni', dataIndex: 'count', align: 'right', className: 'num' },
              ]}
            />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
