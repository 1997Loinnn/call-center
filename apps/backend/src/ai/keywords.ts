import { normalizeText } from './text-classifier';

/**
 * Kalit so'z ogohlantirishlari (F-AI-04): murojaat matnida korrupsiya belgisi, tahdid yoki shikoyatni yuqoriga
 * olib chiqish niyati bo'lsa — belgi qo'yiladi va mas'ullarga xabar boradi. So'zlar so'z boshidan qidiriladi,
 * qo'shimchalar bilan ham topiladi ("pora" → "poraxo'rlik", "porani").
 */

export interface KeywordGroup {
  key: string;
  label: string;
  words: string[];
  /** Kimga xabar beriladi: korrupsiyaga qarshi bo'lim yoki supervisorlar */
  notify: 'confidential' | 'supervisors' | 'none';
}

export const DEFAULT_KEYWORD_GROUPS: KeywordGroup[] = [
  {
    key: 'corruption',
    label: 'Korrupsiya belgisi',
    words: ['pora', 'tama qil', "tamagir", 'korrupsiya', "pul so'ra", 'pul talab', "qo'shimcha pul", 'konvert', 'otkat', "tanish-bilish", 'взятк'],
    notify: 'confidential',
  },
  {
    key: 'threat',
    label: 'Tahdid yoki favqulodda holat',
    words: ["o'z joniga", "o'zimni o'ldir", "o'ldiraman", 'yoqib yubor', 'portlat', "zo'ravonlik", 'qasos ol'],
    notify: 'supervisors',
  },
  {
    key: 'escalation',
    label: 'Yuqori idoraga shikoyat niyati',
    words: ['prokuratura', 'sudga', 'prezident', 'virtual qabulxona', 'jurnalist', 'telegram kanal', 'ommaviy axborot'],
    notify: 'none',
  },
];

export interface KeywordHit {
  key: string;
  label: string;
  words: string[];
}

export function scanKeywords(text: string, groups: KeywordGroup[]): KeywordHit[] {
  const norm = ` ${normalizeText(text)}`;
  const hits: KeywordHit[] = [];
  for (const group of groups) {
    const found = group.words.filter((w) => {
      const word = normalizeText(w);
      return word.length >= 3 && norm.includes(` ${word}`);
    });
    if (found.length) hits.push({ key: group.key, label: group.label, words: found });
  }
  return hits;
}
