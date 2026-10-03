import { BellOutlined } from '@ant-design/icons';
import { App, Badge, Button, Empty, Popover } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocketEvent } from '../realtime/socket';

interface NotificationPayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

interface Item extends NotificationPayload {
  id: number;
  at: number;
  read: boolean;
}

const KEEP = 20;
let seq = 0;

/** Shaxsiy bildirishnomalar (yangi murojaat, javob qaytarildi): real vaqtda toast + ro'yxat. */
export default function NotificationBell() {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const go = (link?: string) => {
    if (!link) return;
    setOpen(false);
    navigate(link);
  };

  useSocketEvent<NotificationPayload>('notification', (n) => {
    setItems((list) => [{ ...n, id: ++seq, at: Date.now(), read: false }, ...list].slice(0, KEEP));
    notification.info({
      message: n.title,
      description: n.body,
      onClick: () => go(n.link),
      style: { cursor: n.link ? 'pointer' : 'default' },
    });
  });

  const unread = items.filter((i) => !i.read).length;

  const content = (
    <div className="bell-panel">
      <div className="bell-head">
        <span className="softphone-panel-title">Bildirishnomalar</span>
        <Button type="link" size="small" disabled={!unread} onClick={() => setItems((list) => list.map((i) => ({ ...i, read: true })))}>
          Hammasini o'qildi deb belgilash
        </Button>
      </div>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Yangi bildirishnoma yo'q" />
      ) : (
        <ul className="bell-list">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="bell-item"
                onClick={() => {
                  setItems((list) => list.map((x) => (x.id === i.id ? { ...x, read: true } : x)));
                  go(i.link);
                }}
              >
                <span className="bell-dot" style={{ visibility: i.read ? 'hidden' : 'visible' }} />
                <span className="bell-text">
                  <span className="bell-title">{i.title}</span>
                  {i.body && <span className="bell-body">{i.body}</span>}
                  <span className="bell-time">{dayjs(i.at).format('HH:mm')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" arrow={false} open={open} onOpenChange={setOpen} content={content}>
      <Badge count={unread} size="small" offset={[-6, 6]}>
        <Button className="icon-btn" icon={<BellOutlined />} aria-label={unread ? `Bildirishnomalar: ${unread} ta yangi` : 'Bildirishnomalar'} />
      </Badge>
    </Popover>
  );
}
