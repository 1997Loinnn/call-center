import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { AlertCounts, OmniCounts } from '../api/types';
import { useSocketEvent } from '../realtime/socket';

const REFRESH_MS = 60_000;

/**
 * Menyu nishonlari: amal kutayotgan murojaatlar, faol ogohlantirishlar va javob kutayotgan
 * omnikanal yozishmalari (har daqiqada va o'zgarganda).
 */
export function useMenuBadges(tickets: boolean, alerts: boolean, omni: boolean): { tickets: number; alerts: number; omni: number } {
  const [counts, setCounts] = useState({ tickets: 0, alerts: 0, omni: 0 });
  const omniTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadAlerts = useCallback(() => {
    if (!alerts) return;
    api
      .get<AlertCounts>('/alerts/counts')
      .then((r) => setCounts((c) => ({ ...c, alerts: r.data.active })))
      .catch(() => undefined);
  }, [alerts]);

  const loadTickets = useCallback(() => {
    if (!tickets) return;
    api
      .get<{ count: number }>('/tickets/inbox-count')
      .then((r) => setCounts((c) => ({ ...c, tickets: r.data.count })))
      .catch(() => undefined);
  }, [tickets]);

  const loadOmni = useCallback(() => {
    if (!omni) return;
    api
      .get<OmniCounts>('/omni/counts')
      .then((r) => setCounts((c) => ({ ...c, omni: r.data.attention })))
      .catch(() => undefined);
  }, [omni]);

  useEffect(() => {
    loadAlerts();
    loadTickets();
    loadOmni();
    const timer = setInterval(() => {
      loadAlerts();
      loadTickets();
      loadOmni();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadAlerts, loadTickets, loadOmni]);

  useSocketEvent('alerts.changed', loadAlerts);
  useSocketEvent('notification', loadTickets);
  // Yozishmalar tez-tez o'zgaradi: bir nechta hodisa bitta so'rovga birlashtiriladi
  useSocketEvent('omni.changed', () => {
    clearTimeout(omniTimer.current);
    omniTimer.current = setTimeout(loadOmni, 800);
  });

  return counts;
}
