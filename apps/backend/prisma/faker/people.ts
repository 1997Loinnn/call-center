import { Random } from './random';

// Soxta shaxslar: ism-familiyalar keng tarqalganlaridan tasodifiy yig'iladi, haqiqiy odamga bog'lanmaydi.

const MALE = [
  'Abdulla', 'Abror', 'Akbar', 'Akmal', 'Alisher', 'Anvar', 'Azamat', 'Aziz', 'Bahodir', 'Baxtiyor', 'Bekzod', 'Bobur',
  'Botir', 'Davron', 'Dilshod', 'Doston', 'Elbek', 'Eldor', 'Erkin', 'Farhod', 'Farrux', "G'ayrat", 'Hamid', 'Husan',
  'Ibrohim', 'Ilhom', 'Islom', 'Jahongir', 'Jamshid', 'Jasur', 'Javohir', 'Kamol', 'Komil', 'Laziz', 'Lochin', 'Mansur',
  'Mirjalol', 'Murod', 'Nodir', 'Nurbek', 'Odil', 'Otabek', 'Oybek', 'Qahramon', 'Ravshan', 'Rustam', 'Sanjar', 'Sardor',
  'Sarvar', 'Shavkat', 'Sherzod', 'Shoxrux', 'Shuhrat', 'Sobir', 'Temur', 'Tohir', "To'lqin", "Ulug'bek", 'Umid',
  'Xurshid', 'Yorqin', 'Yusuf', 'Zafar', 'Zokir',
];

const FEMALE = [
  'Aziza', 'Barno', 'Charos', 'Dildora', 'Dilfuza', 'Dilnoza', 'Dilorom', 'Durdona', 'Feruza', 'Gavhar', 'Gulchehra',
  'Gulnora', 'Hilola', 'Iroda', 'Kamola', 'Kumush', 'Laylo', 'Lola', 'Madina', 'Maftuna', 'Mahliyo', 'Malika', 'Marjona',
  'Mavluda', 'Mohira', 'Muattar', 'Mukaddas', 'Munisa', 'Nargiza', 'Nasiba', 'Nigora', 'Nilufar', 'Nodira', 'Oydin',
  'Ozoda', 'Rayhona', 'Robiya', 'Sabina', 'Saida', 'Sevara', 'Shahnoza', 'Shahzoda', 'Shoira', 'Sitora', 'Umida',
  'Xurshida', 'Yulduz', 'Zarina', 'Zebo', 'Zuhra',
];

// Erkak shakli; ayol shakli oxiriga "a" qo'shiladi (Karimov → Karimova)
const SURNAMES = [
  'Abdullayev', 'Ahmedov', 'Akbarov', 'Aliyev', 'Azimov', 'Bakirov', 'Boboyev', 'Davletov', 'Ergashev', 'Erkinov',
  'Eshonqulov', 'Fayzullayev', "G'aniyev", 'Hamidov', 'Haydarov', 'Holiqov', 'Ibragimov', 'Islomov', 'Ismoilov',
  "Jo'rayev", 'Jalolov', 'Kamolov', 'Karimov', 'Komilov', 'Latipov', 'Mahmudov', 'Mamatov', 'Mansurov', 'Mirzayev',
  'Muminov', 'Murodov', 'Nazarov', 'Nematov', 'Normatov', 'Norqulov', 'Nurmatov', 'Obidov', 'Olimov', 'Otajonov',
  "Po'latov", 'Qodirov', 'Qosimov', 'Qurbonov', 'Rahimov', 'Rajabov', 'Rasulov', 'Rustamov', 'Safarov', 'Saidov',
  'Salimov', 'Sharipov', 'Shodiyev', 'Sobirov', 'Sultonov', 'Tojiyev', 'Toshmatov', "To'xtayev", 'Tursunov', 'Umarov',
  'Usmonov', 'Valiyev', 'Xasanov', 'Xolmatov', 'Xudoyberdiyev', "Yo'ldoshev", 'Yoqubov', 'Yusupov', 'Zaripov', 'Zokirov',
];

// Otasining ismi (rasmiy hujjatlardagi "-ovich / -ovna" shakli)
const PATRONYMIC_BASES = [
  'Akmal', 'Akbar', 'Anvar', 'Azamat', 'Bahodir', 'Baxtiyor', 'Botir', 'Dilshod', 'Erkin', 'Farhod', 'Hamid', 'Ilhom',
  'Jamshid', 'Kamol', 'Komil', 'Mansur', 'Murod', 'Nodir', 'Odil', 'Rashid', 'Ravshan', 'Rustam', 'Sanjar', 'Shavkat',
  'Shuhrat', 'Sobir', 'Tohir', 'Umid', 'Xurshid', 'Zafar', 'Zokir',
];

// Rus tilida murojaat qiluvchilar uchun
const RU_MALE = ['Aleksandr', 'Andrey', 'Dmitriy', 'Igor', 'Sergey', 'Vladimir', 'Oleg', 'Pavel', 'Yuriy', 'Viktor'];
const RU_FEMALE = ['Yelena', 'Irina', 'Natalya', 'Olga', 'Svetlana', 'Tatyana', 'Marina', 'Lyudmila', 'Galina', 'Anna'];
const RU_SURNAMES = ['Ivanov', 'Petrov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Morozov', 'Volkov', 'Kim', 'Pak', 'Li', 'Tsoy'];
const RU_PATRONYMIC = ['Sergeyev', 'Aleksandrov', 'Vladimirov', 'Nikolayev', 'Viktorov', 'Igorev', 'Petrov', 'Mixaylov'];

export type Gender = 'M' | 'F';

export interface PersonName {
  first: string;
  last: string;
  patronymic?: string;
  gender: Gender;
}

const feminine = (surname: string) => (/(ov|ev|in)$/.test(surname) ? `${surname}a` : surname);

export function randomName(rnd: Random, opts: { gender?: Gender; russian?: boolean } = {}): PersonName {
  const gender = opts.gender ?? (rnd.chance(0.5) ? 'M' : 'F');
  if (opts.russian) {
    const last = rnd.pick(RU_SURNAMES);
    const base = rnd.pick(RU_PATRONYMIC);
    return {
      gender,
      first: rnd.pick(gender === 'M' ? RU_MALE : RU_FEMALE),
      last: gender === 'M' ? last : feminine(last),
      patronymic: gender === 'M' ? `${base}ich` : `${base}na`,
    };
  }
  const last = rnd.pick(SURNAMES);
  const base = rnd.pick(PATRONYMIC_BASES);
  return {
    gender,
    first: rnd.pick(gender === 'M' ? MALE : FEMALE),
    last: gender === 'M' ? last : feminine(last),
    patronymic: gender === 'M' ? `${base}ovich` : `${base}ovna`,
  };
}

/** Fuqaro kartasi uchun: "Familiya Ism Otasining ismi" (ba'zan otasining ismisiz) */
export const citizenFullName = (n: PersonName, withPatronymic: boolean) =>
  [n.last, n.first, withPatronymic ? n.patronymic : undefined].filter(Boolean).join(' ');

/** Xodimlar ro'yxati uchun: "Ism Familiya" (prototipdagi kabi) */
export const staffFullName = (n: PersonName) => `${n.first} ${n.last}`;

/** Lotin harflaridagi login: "d.karimova" */
export function usernameOf(n: PersonName): string {
  const ascii = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return `${ascii(n.first)[0]}.${ascii(n.last)}`;
}

export const initials = (n: PersonName) => `${n.first[0]}${n.last[0]}`;

// O'zbekiston mobil operatorlari kodlari (taxminiy ulushlar bilan)
const MOBILE_CODES: (readonly [string, number])[] = [
  ['90', 14], ['91', 9], ['93', 12], ['94', 9], ['95', 5], ['97', 13], ['98', 6], ['99', 12], ['33', 8], ['88', 7],
  ['77', 3], ['50', 2], ['20', 1],
];

export function randomMobile(rnd: Random): string {
  return `+998${rnd.weighted(MOBILE_CODES)}${rnd.digits(7)}`;
}

/** Toshkent shahar telefoni: +998 71 2xx-xx-xx */
export function randomLandline(rnd: Random): string {
  return `+998712${rnd.digits(6)}`;
}

const STREETS = [
  'Amir Temur', 'Mustaqillik', 'Alisher Navoiy', 'Bobur', 'Bunyodkor', 'Ibn Sino', "Mirzo Ulug'bek", 'Furqat',
  "Bog'ishamol", 'Yangi hayot', "Do'stlik", "Ipak yo'li", "Navro'z", 'Sharq', 'Guliston', 'Olmazor', 'Paxtakor',
  'Tinchlik', 'Universitet', 'Mehnat', 'Istiqlol', 'Bahor', 'Shodlik', 'Gulzor', 'Nurafshon', 'Sohil', 'Zarafshon',
  'Beruniy', 'Muqimiy', "Cho'lpon", 'Abdulla Qodiriy', 'Oybek', "G'afur G'ulom", 'Turon', 'Yoshlik',
];

const MAHALLAS = [
  'Navbahor', "Bog'bon", 'Yangiobod', 'Tinchlik', "Do'stlik", 'Obod', 'Nurafshon', 'Gulzor', 'Bunyodkor', 'Mehnatobod',
  'Istiqlol', 'Birlik', 'Chinor', 'Guliston', 'Oqtepa', 'Qorasuv', 'Sharq yulduzi', 'Yangi davr',
];

export const randomMahalla = (rnd: Random) => rnd.pick(MAHALLAS);

export function randomAddress(rnd: Random, district: string | null): string {
  const place = district ? `${district}, ` : '';
  if (rnd.chance(0.45)) {
    return `${place}${rnd.pick(STREETS)} ko'chasi, ${rnd.int(1, 120)}-uy, ${rnd.int(1, 96)}-xonadon`;
  }
  return `${place}${rnd.pick(MAHALLAS)} MFY, ${rnd.pick(STREETS)} ko'chasi, ${rnd.int(1, 240)}-uy`;
}

/** Kadastr raqami ko'rinishi: "11:01:02:03:0012:0001" (soxta) */
export function randomCadastreNumber(rnd: Random, regionSoato: string): string {
  const region = regionSoato.slice(2, 4);
  const p = (n: number, len: number) => String(n).padStart(len, '0');
  return `${region}:${p(rnd.int(1, 16), 2)}:${p(rnd.int(1, 40), 2)}:${p(rnd.int(1, 60), 2)}:${p(rnd.int(1, 9999), 4)}:${p(rnd.int(1, 120), 4)}`;
}

export const randomApplicationNumber = (rnd: Random) => `${rnd.int(1, 9)}${rnd.digits(8)}`;
