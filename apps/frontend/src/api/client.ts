import axios, { AxiosError } from 'axios';

/** Barcha so'rovlar /api orqali; JWT httpOnly cookie'da, brauzer uni o'zi yuboradi. */
export const api = axios.create({ baseURL: '/api', withCredentials: true });

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const message = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;
    if (err.response?.status === 403) return "Bu amal uchun ruxsat yo'q";
    if (err.response?.status === 429) return "So'rovlar juda ko'p, birozdan keyin urinib ko'ring";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
