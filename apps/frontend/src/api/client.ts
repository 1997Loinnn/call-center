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

/** Content-Disposition sarlavhasidan fayl nomi (RFC 5987 "filename*" ustun). */
function fileNameOf(header: string | undefined, fallback: string): string {
  const star = header && /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]);
  const plain = header && /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

/** Faylni yuklab oladi (eksport va hisobotlar). Xato bo'lsa, backend xabari bilan Error tashlaydi. */
export async function downloadFile(path: string, params: object, fallbackName: string): Promise<void> {
  try {
    const res = await api.get<Blob>(path, { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameOf(res.headers['content-disposition'] as string | undefined, fallbackName);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    // responseType: 'blob' bo'lganda xato javobi ham Blob bo'lib keladi: JSON xabarini o'qib olamiz
    if (err instanceof AxiosError && err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {
        /* JSON emas — umumiy xabar ishlatiladi */
      }
    }
    throw new Error(errorMessage(err));
  }
}
