import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../api/client';
import type { AuthUser } from '../api/types';
import { closeSocket } from '../realtime/socket';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Kirish javobi: foydalanuvchi bo'lsa sessiya ochiladi; ikkinchi bosqich kerak bo'lsa — challenge qaytadi */
  completeLogin: (response: LoginResponse) => MfaStep | null;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  /** Massiv: ruxsatlardan kamida bittasi bo'lsa yetarli */
  canAny: (permission: string | string[]) => boolean;
}

/** Ikkinchi bosqich: challenge (5 daqiqa) va ilova hali ulanmaganmi (setup) */
export interface MfaStep {
  challenge: string;
  setup: boolean;
}

export type LoginResponse = { user: AuthUser } | { mfa: MfaStep };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      closeSocket();
      setUser(null);
    });
    // Fuqaro uchun ochiq veb-chat: xodim sessiyasi tekshirilmaydi
    if (window.location.pathname.startsWith('/webchat')) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const completeLogin = useCallback((response: LoginResponse): MfaStep | null => {
    if ('user' in response) {
      setUser(response.user);
      return null;
    }
    return response.mfa;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    closeSocket();
    setUser(null);
  }, []);

  const can = useCallback((permission: string) => !!user?.permissions.includes(permission), [user]);
  const canAny = useCallback(
    (permission: string | string[]) => (Array.isArray(permission) ? permission.some(can) : can(permission)),
    [can],
  );

  const value = useMemo(() => ({ user, loading, completeLogin, logout, can, canAny }), [user, loading, completeLogin, logout, can, canAny]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlatiladi');
  return ctx;
}
