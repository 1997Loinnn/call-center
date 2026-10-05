/** Audit yozuvidagi o'zgarishlar: { maydon: { from, to } }. Audit jurnalida "O'zgarish" jadvali bo'lib chiqadi. */
export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** after'da berilgan (undefined emas) va qiymati o'zgargan maydonlar. */
export function diffFields<T extends object>(before: T, after: Partial<T>, fields: readonly (keyof T)[]): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of fields) {
    const next = after[field];
    if (next === undefined || same(before[field], next)) continue;
    changes[String(field)] = { from: before[field] ?? null, to: next ?? null };
  }
  return changes;
}
