/** JWT httpOnly cookie nomi: frontend tokenga JavaScript orqali kira olmaydi. */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** TZ 9-bo'lim: 5 marta noto'g'ri parol kiritilsa, hisob vaqtincha bloklanadi. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export interface JwtPayload {
  sub: number;
  username: string;
}
