/**
 * Mahalliy matn klassifikatori (F-AI-02): murojaat tavsifidan mavzuni taklif qiladi. Tashqi xizmatsiz —
 * multinomial Naive Bayes, o'zbek matni uchun soddalashtirilgan tokenizatsiya va prefiks-o'zak (agglyutinativ
 * qo'shimchalar: "arizasi", "arizani", "arizalar" → "ariza").
 */

const STOPWORDS = new Set([
  'va', 'bilan', 'uchun', 'bu', 'shu', 'u', 'ham', 'esa', 'lekin', 'ammo', 'yoki', 'qanday', 'qaysi', 'qachon', 'nima', 'nega',
  'bo\'yicha', 'haqida', 'kerak', 'edi', 'emas', 'bor', 'yo\'q', 'fuqaro', 'fuqaroning', 'so\'radi', 'so\'raldi', 'bilmoqchi',
  'iltimos', 'raqamli', 'raqami', 'manzilidagi', 'uy', 'xonadon', 'ko\'chasi', 'tumani', 'shahri', 'viloyati', 'mening', 'menga',
  'и', 'в', 'на', 'по', 'не', 'что', 'как', 'для', 'с',
]);

const STEM = 6;

/** Matnni normallashtiradi: kichik harf, o'zbek tutuq belgilari bitta ko'rinishda. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w))
    .map((w) => (w.length > STEM ? w.slice(0, STEM) : w));
}

export interface TrainingDoc {
  label: number;
  text: string;
}

export interface Prediction {
  label: number;
  probability: number;
}

export interface ClassifierModel {
  labels: number[];
  docCount: Map<number, number>;
  wordCount: Map<number, Map<string, number>>;
  totalWords: Map<number, number>;
  vocabulary: number;
  docs: number;
}

export function train(docs: TrainingDoc[]): ClassifierModel {
  const docCount = new Map<number, number>();
  const wordCount = new Map<number, Map<string, number>>();
  const totalWords = new Map<number, number>();
  const vocab = new Set<string>();
  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    if (!tokens.length) continue;
    docCount.set(doc.label, (docCount.get(doc.label) ?? 0) + 1);
    let words = wordCount.get(doc.label);
    if (!words) wordCount.set(doc.label, (words = new Map()));
    for (const t of tokens) {
      words.set(t, (words.get(t) ?? 0) + 1);
      vocab.add(t);
    }
    totalWords.set(doc.label, (totalWords.get(doc.label) ?? 0) + tokens.length);
  }
  const labels = [...docCount.keys()];
  return { labels, docCount, wordCount, totalWords, vocabulary: vocab.size, docs: [...docCount.values()].reduce((a, b) => a + b, 0) };
}

/**
 * Eng ehtimolli mavzular. Ma'lum so'z bo'lmasa (lug'atdan tashqari) — bo'sh ro'yxat: tasodifiy taklif bermaslik uchun.
 */
export function predict(model: ClassifierModel, text: string, top = 3): Prediction[] {
  const tokens = tokenize(text);
  const known = tokens.filter((t) => model.labels.some((l) => model.wordCount.get(l)?.has(t)));
  if (!known.length || !model.docs) return [];
  const V = model.vocabulary + 1;
  const scores = model.labels.map((label) => {
    const words = model.wordCount.get(label)!;
    const total = model.totalWords.get(label) ?? 0;
    let score = Math.log((model.docCount.get(label) ?? 0) / model.docs);
    for (const t of known) score += Math.log(((words.get(t) ?? 0) + 1) / (total + V));
    return { label, score };
  });
  const max = Math.max(...scores.map((s) => s.score));
  const exp = scores.map((s) => ({ label: s.label, e: Math.exp(s.score - max) }));
  const sum = exp.reduce((a, b) => a + b.e, 0);
  return exp
    .map((s) => ({ label: s.label, probability: Math.round((s.e / sum) * 1000) / 1000 }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, top);
}

/** Matnda tilga olingan joy nomi: "Baliqchi tumani" → nomi o'zakka mos keladigan birinchi yozuv. */
export function findPlace<T extends { id: number; name: string; exact?: boolean }>(text: string, places: T[]): T | null {
  const norm = ` ${normalizeText(text)} `;
  let best: T | null = null;
  let bestLen = 0;
  for (const place of places) {
    // "Farg'ona viloyati" → "farg'ona"; exact — viloyat nomi bilan bir xil tuman/shahar ("Farg'ona shahri") to'liq nomi bilan
    const full = normalizeText(place.name);
    const key = place.exact ? full : full.replace(/\s+(viloyati|tumani|shahri|respublikasi)$/, '');
    if (key.length < 4) continue;
    const re = new RegExp(`[\\s(]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (re.test(norm) && key.length > bestLen) {
      best = place;
      bestLen = key.length;
    }
  }
  return best;
}
