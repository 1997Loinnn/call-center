const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const;

/** Ilova ishga tushishidan oldin muhit o'zgaruvchilarini tekshiradi. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Muhit o'zgaruvchilari berilmagan: ${missing.join(', ')}`);
  }
  if (String(config.JWT_SECRET).length < 32) {
    throw new Error("JWT_SECRET kamida 32 belgidan iborat bo'lishi kerak");
  }
  const driver = config.PBX_DRIVER ?? 'mock';
  if (driver !== 'mock' && driver !== 'ucm6510') {
    throw new Error(`PBX_DRIVER noto'g'ri: ${String(driver)} (mock | ucm6510)`);
  }
  const sms = String(config.SMS_DRIVER ?? 'off');
  if (!['off', 'log', 'eskiz', 'http'].includes(sms)) {
    throw new Error(`SMS_DRIVER noto'g'ri: ${sms} (off | log | eskiz | http)`);
  }
  if (sms === 'log' && config.NODE_ENV === 'production') {
    throw new Error("SMS_DRIVER=log faqat ishlab chiqish uchun: ishlab chiqarishda eskiz yoki http qo'ying");
  }
  return config;
}
