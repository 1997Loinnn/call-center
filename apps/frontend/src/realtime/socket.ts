import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Real vaqt kanali (backend: /ws). Autentifikatsiya httpOnly cookie orqali. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/ws', { withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Komponent yashagan davrda socket hodisasiga obuna bo'ladi. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}
