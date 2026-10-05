/**
 * Qo'ng'iroqlar yuklamasi prognozi va shtat hisobi (F-AI-06): har bir soat uchun o'tgan haftalarning shu kuni
 * va shu soatidagi qo'ng'iroqlar (yaqin haftalar og'irroq), keyin Erlang C bo'yicha xizmat darajasiga yetish
 * uchun kerakli operatorlar soni.
 */

/** Haftalar og'irligi: o'tgan hafta 1, undan oldingisi 0.8, … */
const DECAY = 0.8;

/**
 * history[k] — k+1 hafta oldingi shu kun va soatdagi qo'ng'iroqlar (null — ma'lumot yo'q, masalan tizim hali ishlamagan).
 */
export function weightedForecast(history: (number | null)[]): number {
  let sum = 0;
  let weights = 0;
  history.forEach((v, k) => {
    if (v === null) return;
    const w = DECAY ** k;
    sum += v * w;
    weights += w;
  });
  return weights ? Math.round((sum / weights) * 10) / 10 : 0;
}

/** Erlang C: chaqiruv kutishga tushish ehtimoli (N operator, A erlang yuklama). */
export function erlangC(agents: number, traffic: number): number {
  if (traffic <= 0) return 0;
  if (agents <= traffic) return 1;
  // Erlang B rekursiv (sonli barqaror), so'ng C ga o'tkaziladi
  let b = 1;
  for (let k = 1; k <= agents; k++) b = (traffic * b) / (k + traffic * b);
  return b / (1 - (traffic / agents) * (1 - b));
}

/** T soniya ichida javob berilganlar ulushi. */
export function serviceLevel(agents: number, traffic: number, ahtSeconds: number, targetSeconds: number): number {
  if (traffic <= 0) return 1;
  if (agents <= traffic) return 0;
  return 1 - erlangC(agents, traffic) * Math.exp((-(agents - traffic) * targetSeconds) / ahtSeconds);
}

export interface StaffingInput {
  callsPerHour: number;
  ahtSeconds: number;
  targetSeconds: number;
  /** 0..1, masalan 0.8 */
  targetLevel: number;
  /** Tanaffus, o'qish va boshqa telefondan tashqari vaqt ulushi (0..0.9) */
  shrinkage: number;
}

export interface Staffing {
  traffic: number;
  agents: number;
  scheduled: number;
  serviceLevel: number;
}

/** Xizmat darajasiga yetadigan eng kam operatorlar soni va smenada bo'lishi kerak bo'lganlar (shrinkage bilan). */
export function staffing(input: StaffingInput): Staffing {
  const traffic = (input.callsPerHour * input.ahtSeconds) / 3600;
  if (traffic <= 0) return { traffic: 0, agents: 0, scheduled: 0, serviceLevel: 1 };
  let agents = Math.max(1, Math.floor(traffic) + 1);
  while (serviceLevel(agents, traffic, input.ahtSeconds, input.targetSeconds) < input.targetLevel && agents < 1000) agents++;
  const level = serviceLevel(agents, traffic, input.ahtSeconds, input.targetSeconds);
  return {
    traffic: Math.round(traffic * 100) / 100,
    agents,
    scheduled: Math.ceil(agents / (1 - Math.min(0.9, Math.max(0, input.shrinkage)))),
    serviceLevel: Math.round(level * 1000) / 10,
  };
}
