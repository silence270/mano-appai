/* Lapas — ką galima pažymėti.
 *
 * Vienas šaltinis: id, emoji ir abu vertimai. Pridedant naują simptomą
 * užtenka vienos eilutės — UI, statistika ir eksportas pasiima automatiškai.
 * ID niekada nekeičiami: pagal juos surišti seni įrašai ir eksportuoti failai.
 */

'use strict';

export const FLOW_LEVELS = [
  { v: 0, e: '·',  lt: 'Nėra',      en: 'None' },
  { v: 1, e: '🩸', lt: 'Lašeliai',  en: 'Spotting' },
  { v: 2, e: '🩸', lt: 'Lengvas',   en: 'Light' },
  { v: 3, e: '🩸', lt: 'Vidutinis', en: 'Medium' },
  { v: 4, e: '🩸', lt: 'Gausus',    en: 'Heavy' },
];

export const MOODS = [
  { id: 'calm',     e: '😌', lt: 'Rami',        en: 'Calm' },
  { id: 'happy',    e: '😊', lt: 'Laiminga',    en: 'Happy' },
  { id: 'energetic',e: '⚡️', lt: 'Energinga',   en: 'Energetic' },
  { id: 'confident',e: '✨', lt: 'Pasitikinti', en: 'Confident' },
  { id: 'sensitive',e: '🥺', lt: 'Jautri',      en: 'Sensitive' },
  { id: 'irritable',e: '😤', lt: 'Dirgli',      en: 'Irritable' },
  { id: 'angry',    e: '😠', lt: 'Pikta',       en: 'Angry' },
  { id: 'sad',      e: '😔', lt: 'Liūdna',      en: 'Sad' },
  { id: 'anxious',  e: '😰', lt: 'Nerimastinga',en: 'Anxious' },
  { id: 'tearful',  e: '😢', lt: 'Verksminga',  en: 'Tearful' },
  { id: 'apathetic',e: '😐', lt: 'Apatiška',    en: 'Apathetic' },
  { id: 'foggy',    e: '🌫', lt: 'Miglota galva',en: 'Brain fog' },
];

export const SYMPTOM_GROUPS = [
  {
    id: 'pain', lt: 'Skausmas', en: 'Pain', e: '🌡',
    items: [
      { id: 'cramps',    e: '🌀', lt: 'Mėšlungis',        en: 'Cramps' },
      { id: 'backache',  e: '🪑', lt: 'Nugaros skausmas', en: 'Backache' },
      { id: 'breast',    e: '🫂', lt: 'Krūtų jautrumas',  en: 'Tender breasts' },
      { id: 'headache',  e: '🤕', lt: 'Galvos skausmas',  en: 'Headache' },
      { id: 'migraine',  e: '⚡️', lt: 'Migrena',          en: 'Migraine' },
      { id: 'joints',    e: '🦴', lt: 'Sąnarių skausmas', en: 'Joint pain' },
      { id: 'ovulation_pain', e: '📍', lt: 'Ovuliacijos dūris', en: 'Ovulation pain' },
    ],
  },
  {
    id: 'belly', lt: 'Pilvas ir virškinimas', en: 'Belly & digestion', e: '🫄',
    items: [
      { id: 'bloating',  e: '🎈', lt: 'Pūtimas',            en: 'Bloating' },
      { id: 'nausea',    e: '🤢', lt: 'Pykinimas',          en: 'Nausea' },
      { id: 'constipation', e: '🧱', lt: 'Užkietėjimas',    en: 'Constipation' },
      { id: 'diarrhea',  e: '💧', lt: 'Viduriavimas',       en: 'Diarrhea' },
      { id: 'appetite_up', e: '🍽', lt: 'Padidėjęs apetitas', en: 'Increased appetite' },
      { id: 'appetite_down', e: '🥄', lt: 'Nėra apetito',   en: 'No appetite' },
      { id: 'cravings',  e: '🍫', lt: 'Traukia saldumynus', en: 'Cravings' },
    ],
  },
  {
    id: 'energy', lt: 'Energija ir miegas', en: 'Energy & sleep', e: '🌙',
    items: [
      { id: 'fatigue',   e: '🪫', lt: 'Nuovargis',        en: 'Fatigue' },
      { id: 'insomnia',  e: '👁', lt: 'Nemiga',           en: 'Insomnia' },
      { id: 'oversleep', e: '😴', lt: 'Miegu daug',       en: 'Sleeping a lot' },
      { id: 'dizzy',     e: '💫', lt: 'Svaigsta galva',   en: 'Dizziness' },
      { id: 'hot_flash', e: '🔥', lt: 'Karščio bangos',   en: 'Hot flashes' },
      { id: 'night_sweat', e: '💦', lt: 'Naktinis prakaitavimas', en: 'Night sweats' },
    ],
  },
  {
    id: 'skin', lt: 'Oda ir kūnas', en: 'Skin & body', e: '🫧',
    items: [
      { id: 'acne',      e: '🔴', lt: 'Spuogai',          en: 'Acne' },
      { id: 'dry_skin',  e: '🏜', lt: 'Sausa oda',        en: 'Dry skin' },
      { id: 'oily_hair', e: '💇', lt: 'Riebūs plaukai',   en: 'Oily hair' },
      { id: 'swelling',  e: '🫧', lt: 'Tinimas',          en: 'Swelling' },
      { id: 'frequent_urination', e: '🚻', lt: 'Dažnas šlapinimasis', en: 'Frequent urination' },
      { id: 'itching',   e: '🌿', lt: 'Niežulys',         en: 'Itching' },
    ],
  },
];

export const ALL_SYMPTOMS = SYMPTOM_GROUPS.flatMap(g => g.items);

export const MUCUS = [
  { id: 'dry',      e: '🏜', lt: 'Sausa',            en: 'Dry',       fertile: false },
  { id: 'sticky',   e: '🧷', lt: 'Lipni',            en: 'Sticky',    fertile: false },
  { id: 'creamy',   e: '🥛', lt: 'Kreminė',          en: 'Creamy',    fertile: false },
  { id: 'watery',   e: '💧', lt: 'Vandeninga',       en: 'Watery',    fertile: true },
  { id: 'eggwhite', e: '🥚', lt: 'Kiaušinio baltymo',en: 'Egg white', fertile: true },
  { id: 'atypical', e: '⚠️', lt: 'Netipinė',         en: 'Unusual',   fertile: false },
];

export const SEX = [
  { id: 'unprotected', e: '💗', lt: 'Be apsaugos',   en: 'Unprotected' },
  { id: 'protected',   e: '🛡', lt: 'Su apsauga',    en: 'Protected' },
  { id: 'solo',        e: '🌸', lt: 'Vienai',        en: 'Solo' },
  { id: 'high_libido', e: '🔥', lt: 'Stiprus noras', en: 'High sex drive' },
  { id: 'low_libido',  e: '🌘', lt: 'Nėra noro',     en: 'Low sex drive' },
  { id: 'orgasm',      e: '⭐️', lt: 'Orgazmas',      en: 'Orgasm' },
];

export const TESTS = [
  { id: 'lh_neg',   e: '➖', lt: 'LH testas neigiamas',      en: 'LH test negative' },
  { id: 'lh_pos',   e: '➕', lt: 'LH testas teigiamas',      en: 'LH test positive' },
  { id: 'preg_neg', e: '➖', lt: 'Nėštumo testas neigiamas', en: 'Pregnancy test negative' },
  { id: 'preg_pos', e: '➕', lt: 'Nėštumo testas teigiamas', en: 'Pregnancy test positive' },
];

export const MEDS = [
  { id: 'pill_taken',  e: '💊', lt: 'Tabletė išgerta',  en: 'Pill taken' },
  { id: 'pill_missed', e: '❗️', lt: 'Tabletė praleista',en: 'Pill missed' },
  { id: 'vitamins',    e: '🟡', lt: 'Vitaminai',        en: 'Vitamins' },
  { id: 'painkiller',  e: '🩹', lt: 'Skausmą malšinantys', en: 'Painkillers' },
];

/** Vardo paieška bet kuriam id — statistikai ir eksporto lentelėms. */
const INDEX = new Map();
for (const x of [...MOODS, ...ALL_SYMPTOMS, ...MUCUS, ...SEX, ...TESTS, ...MEDS]) INDEX.set(x.id, x);
export function labelOf(id, lang) {
  const raw = String(id).replace(/^mood:/, '');
  const x = INDEX.get(raw);
  return x ? `${x.e} ${lang === 'en' ? x.en : x.lt}` : raw;
}
export function itemOf(id) { return INDEX.get(String(id).replace(/^mood:/, '')) || null; }
