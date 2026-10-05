/**
 * Takrorlanadigan tasodifiy sonlar (mulberry32): bir xil FAKER_SEED — bir xil ma'lumotlar.
 * Math.random ishlatilmaydi, shuning uchun xato topilsa uni aynan qayta hosil qilish mumkin.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) oralig'ida */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] butun son (ikkala chegara kiradi) */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** [qiymat, og'irlik] juftliklaridan og'irlikka mutanosib tanlaydi */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return items[items.length - 1][0];
  }

  /** Normal taqsimot (Box–Muller) */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal: suhbat va ijro davomiyligi uchun (median atrofida, o'ngga cho'zilgan) */
  logNormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }

  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }

  digits(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) out += String(this.int(0, 9));
    return out;
  }

  hex(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) out += this.int(0, 15).toString(16);
    return out;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, count));
  }
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
