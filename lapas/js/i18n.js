/* Lapas — kalbos. Lietuvių ir anglų, perjungiama nustatymuose.
 * Trūkstamas vertimas krenta atgal į lietuvių, o ne į tuščią vietą.
 */

'use strict';

export const LANGS = [
  { id: 'lt', label: 'Lietuvių' },
  { id: 'en', label: 'English' },
];

const LT = {
  app: 'Lapas',
  // navigacija
  nav_today: 'Šiandien', nav_calendar: 'Kalendorius', nav_insights: 'Įžvalgos', nav_settings: 'Nustatymai',
  // fazės
  phase_menstrual: 'Mėnesinės', phase_follicular: 'Folikulinė fazė', phase_fertile: 'Vaisingos dienos',
  phase_ovulation: 'Ovuliacija', phase_luteal: 'Liuteininė fazė', phase_pms: 'Prieš mėnesines',
  phase_pregnant: 'Nėštumas', phase_unknown: 'Nežinoma',
  phase_menstrual_note: 'Kūnas dirba. Šilta, ramu, be skubos.',
  phase_follicular_note: 'Energija kyla — geras metas naujiems darbams.',
  phase_fertile_note: 'Didžiausia tikimybė pastoti.',
  phase_ovulation_note: 'Kiaušinėlis išsiskyrė (arba tuoj išsiskirs).',
  phase_luteal_note: 'Progesteronas kyla, energija po truputį leidžiasi.',
  phase_pms_note: 'Mėnesinės netoli — jautrumas normalus.',
  // šiandien
  day_of_cycle: 'Ciklo diena', cycle_day_short: 'diena',
  until_period: 'Iki mėnesinių', period_in_days: 'Mėnesinės po {n} d.',
  period_today: 'Mėnesinės šiandien', period_tomorrow: 'Mėnesinės rytoj',
  late_by: 'Vėluoja {n} d.', probably: 'Tikėtina', between: '{a}–{b}',
  log_today: 'Žymėti šiandien', log_day: 'Žymėti dieną', edit_day: 'Keisti įrašą',
  quick_period: 'Prasidėjo mėnesinės', quick_period_end: 'Mėnesinės baigėsi',
  no_data_yet: 'Dar nėra duomenų', start_hint: 'Pažymėk pirmą mėnesinių dieną — nuo jos prasidės viskas.',
  stale_title: 'Žymėjimas nutrūkęs',
  stale_note: 'Paskutinis įrašas per senas, kad prognozė būtų prasminga. Pažymėk paskutines mėnesines.',
  confidence_high: 'prognozė tiksli', confidence_medium: 'prognozė apytikslė', confidence_low: 'prognozė apytikrė',
  based_on_cycles: 'pagal {c}', based_on_default: 'pagal numatytą {n} d. ciklą',
  suggest_test: 'Vėluoja daugiau nei savaitę. Jei yra tikimybė — verta pasidaryti testą.',
  // kalendorius
  legend_period: 'Mėnesinės', legend_predicted: 'Prognozė', legend_fertile: 'Vaisingos',
  legend_ovulation: 'Ovuliacija', legend_window: 'Galimos dienos', legend_logged: 'Yra įrašas',
  months: ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis','Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis'],
  weekdays: ['S','P','A','T','K','P','Š'],   // 0 = sekmadienis (Date.getUTCDay tvarka)
  today: 'Šiandien', future_note: 'Ateities dienos nežymimos.',
  // žymėjimas
  log_flow: 'Srautas', log_mood: 'Nuotaika', log_symptoms: 'Simptomai',
  log_mucus: 'Išskyros', log_sex: 'Lytinis gyvenimas', log_tests: 'Testai',
  log_meds: 'Vaistai', log_bbt: 'Bazinė temperatūra', log_weight: 'Svoris', log_notes: 'Užrašai',
  log_energy: 'Energija', log_sleep: 'Miegas',
  bbt_hint: 'Matuok iškart po miego, tuo pačiu laiku, nekeldama galvos.',
  notes_placeholder: 'Ką nori prisiminti apie šią dieną…',
  save: 'Išsaugoti', cancel: 'Atšaukti', delete: 'Ištrinti', done: 'Gerai', close: 'Uždaryti',
  clear_day: 'Išvalyti dieną', hours: 'val.',
  // įžvalgos
  ins_overview: 'Apžvalga', ins_avg_cycle: 'Vidutinis ciklas', ins_avg_period: 'Mėnesinių trukmė',
  ins_regularity: 'Reguliarumas', ins_luteal: 'Liuteininė fazė', ins_days: 'd.',
  reg_regular: 'Taisyklingas', reg_variable: 'Kintantis', reg_irregular: 'Netaisyklingas', reg_unknown: 'Per mažai duomenų',
  reg_regular_note: 'Ciklai skiriasi ne daugiau kaip 4 dienomis.',
  reg_variable_note: 'Ciklai svyruoja {n} d. ribose — dažnas, bet prognozė platesnė.',
  reg_irregular_note: 'Ciklai svyruoja {n} d. Jei tai naujas dalykas, verta paminėti gydytojai.',
  reg_unknown_note: 'Reikia bent 3 pilnų ciklų.',
  ins_history: 'Ciklų istorija', ins_bbt: 'Temperatūros kreivė', ins_patterns: 'Simptomų dėsningumai',
  ins_no_patterns: 'Kai pažymėsi simptomus per kelis ciklus, čia matysis, kurioje fazėje jie kartojasi.',
  pattern_line: '{sym} — dažniausiai: {phase} ({n} k.)',
  ins_coverline: 'Riba', ins_confirmed_ov: 'Patvirtinta ovuliacija',
  ins_bbt_empty: 'Įrašyk bent 9 rytų temperatūras — tada matysis ovuliacijos šuolis.',
  ins_cycles_empty: 'Kai bus bent 2 pilni ciklai, čia atsiras juostos.',
  ins_outlier: 'neįskaičiuota',
  of_times: 'iš {n} k.',
  // režimai
  mode: 'Režimas', mode_track: 'Sekimas', mode_ttc: 'Bandau pastoti',
  mode_pregnancy: 'Nėštumas', mode_contraception: 'Kontracepcija',
  mode_track_note: 'Ciklas, simptomai, prognozė.',
  mode_ttc_note: 'Papildomai — vaisingos dienos, LH, temperatūra.',
  mode_pregnancy_note: 'Savaitės, terminas, nėštumo simptomai.',
  mode_contraception_note: 'Tablečių žymėjimas ir ciklas.',
  preg_week: '{n} savaitė', preg_day_of_week: '{n} d.', preg_due: 'Terminas',
  preg_left: 'Liko {n} d.', preg_trimester: '{n} trimestras', preg_start: 'Paskutinių mėnesinių pradžia',
  preg_size: 'Vaisius maždaug kaip', preg_end: 'Baigti nėštumo režimą',
  // režimų kortelės
  ttc_title: 'Vaisingumas',
  ttc_fertile_now: 'Šiandien vaisinga diena',
  ttc_ovulation_today: 'Ovuliacija — šiandien',
  ttc_days_to_ov: 'Iki ovuliacijos {n} d.',
  ttc_after_ov: 'Ovuliacija praėjo prieš {n} d.',
  ttc_confirmed: 'Patvirtinta temperatūra',
  ttc_predicted: 'Spėjama pagal ciklą',
  ttc_by_lh: 'Pagal LH testą', ttc_by_mucus: 'Pagal gleives',
  ttc_tip_bbt: 'Matuok temperatūrą rytais — po kelių ciklų ovuliacija bus matoma tiksliai.',
  ttc_tip_lh: 'Artėja vaisingos dienos — laikas LH testams.',
  ttc_tip_wait: 'Iki kitų vaisingų dienų dar toli. Ramybė irgi dalis proceso.',
  pill_title: 'Kontracepcija',
  pill_taken_today: 'Šiandien išgerta',
  pill_not_yet: 'Šiandien dar nepažymėta',
  pill_take: 'Išgėriau',
  pill_streak: '{n} d. iš eilės',
  pill_missed_recent: 'Per 30 d. praleista: {n}',
  // nustatymai
  set_language: 'Kalba', set_theme: 'Išvaizda', theme_auto: 'Kaip telefone', theme_light: 'Šviesi', theme_dark: 'Tamsi',
  set_privacy: 'Privatumas', set_pin: 'PIN užraktas', set_pin_on: 'Įjungtas', set_pin_off: 'Išjungtas',
  set_pin_new: 'Naujas PIN (bent 4 skaitmenys)', set_pin_repeat: 'Pakartok PIN',
  set_pin_wrong: 'Neteisingas PIN', set_pin_mismatch: 'PIN nesutampa', set_pin_short: 'Per trumpas',
  set_pin_note: 'Su PIN\u2019u duomenys telefone laikomi užšifruoti. Pamiršus PIN — atkurti neįmanoma.',
  set_pin_remove: 'Išjungti PIN',
  unlock_title: 'Įvesk PIN', unlock_sub: 'Lapas',
  set_data: 'Duomenys', set_export: 'Atsisiųsti kopiją', set_import: 'Įkelti kopiją',
  set_qr: 'Perkelti į kitą telefoną', set_wipe: 'Ištrinti viską',
  set_cycle_defaults: 'Numatytieji', set_avg_cycle: 'Ciklo ilgis', set_avg_period: 'Mėnesinių trukmė',
  set_week_start: 'Savaitė prasideda', week_mon: 'Pirmadienį', week_sun: 'Sekmadienį',
  set_about: 'Apie', set_storage: 'Užima {n}',
  set_persist_on: 'Naršyklė pažadėjo duomenų netrinti.',
  set_persist_off: 'Paspausk, kad naršyklė duomenų netrintų automatiškai.',
  set_persist_btn: 'Apsaugoti saugyklą',
  wipe_confirm: 'Ištrinti visus duomenis? Atkurti nebus galima.',
  wipe_confirm_yes: 'Taip, ištrinti viską', wiped: 'Ištrinta.',
  // duomenys
  export_title: 'Atsisiųsti kopiją',
  export_note: 'Failas nukeliaus į „Failai" (arba Atsisiuntimus). Perkelk jį į iCloud, kompiuterį ar bet kur — tai vienintelė tavo atsarginė kopija.',
  export_encrypt: 'Užšifruoti slaptažodžiu', export_password: 'Slaptažodis failui',
  export_plain_warn: 'Neužšifruotą failą perskaitys bet kas, kam jis pateks.',
  export_do: 'Atsisiųsti', exported: 'Kopija paruošta.',
  import_title: 'Įkelti kopiją', import_choose: 'Pasirinkti failą',
  import_password: 'Failo slaptažodis', import_wrong_pass: 'Neteisingas slaptažodis',
  import_bad_file: 'Failas netinkamas arba sugadintas',
  import_mode: 'Ką daryti su esamais duomenimis',
  import_merge: 'Sujungti', import_merge_note: 'Esami įrašai lieka, nauji pridedami.',
  import_replace: 'Pakeisti', import_replace_note: 'Viskas telefone pakeičiama failo turiniu.',
  import_do: 'Įkelti', imported: 'Įkelta {n} dienų įrašų.',
  // QR
  qr_title: 'Perkelti į kitą telefoną',
  qr_intro: 'Be interneto, be debesies: senas telefonas rodo kodus, naujas nuskaito kamera.',
  qr_send: 'Siųsti iš šio telefono', qr_receive: 'Priimti į šį telefoną',
  qr_sending: 'Rodyk šį ekraną kitam telefonui', qr_frame: 'Kadras {i} iš {n}',
  qr_hold: 'Laikyk telefonus 15–25 cm atstumu, kol užsipildys juosta.',
  qr_receiving: 'Nukreipk kamerą į kito telefono ekraną',
  qr_progress: 'Surinkta {n}%', qr_done: 'Perkelta! {n} dienų įrašų.',
  qr_camera_denied: 'Kamera neleista. Nustatymai → Safari → Kamera.',
  qr_camera_none: 'Kameros nepavyko įjungti.',
  qr_lib_fail: 'Nepavyko įkelti QR dalies. Atidaryk programėlę iš naujo.',
  qr_speed: 'Įprastai', qr_slower: 'Lėčiau', qr_faster: 'Greičiau',
  qr_stop: 'Baigti', qr_encrypted_note: 'Perdavimas užšifruotas — reikės to paties kodo abiejuose telefonuose.',
  qr_code_label: 'Perdavimo kodas', qr_code_enter: 'Įvesk kodą iš kito telefono',
  // pradžia
  onb_welcome: 'Sveika',
  onb_intro: 'Šis app\u2019as neturi paskyros, neturi serverio ir nesijungia prie interneto. Viskas, ką čia įrašysi, lieka šiame telefone.',
  onb_last_period: 'Kada prasidėjo paskutinės mėnesinės?',
  onb_last_period_skip: 'Nepamenu — pažymėsiu vėliau',
  onb_cycle_len: 'Koks tavo įprastas ciklas?',
  onb_dont_know: 'Nežinau', onb_start: 'Pradėti',
  onb_backup: 'Kadangi duomenys tik čia, kartą per mėnesį pasidaryk kopiją — Nustatymai → Atsisiųsti kopiją.',
  // bendra
  disclaimer_short: 'Prognozė — ne kontracepcija.',
  disclaimer: 'Prognozės remiasi tavo įrašais ir gali nesutapti. Tai ne medicininė priemonė ir ne apsaugos nuo nėštumo būdas.',
  backup_nudge: 'Seniai darei kopiją. Duomenys yra tik šiame telefone.',
  backup_now: 'Pasidaryti kopiją', later: 'Vėliau',
  yes: 'Taip', no: 'Ne', on: 'Įjungta', off: 'Išjungta', none: 'Nėra',
  days_short: 'd.', add: 'Pridėti', more: 'Daugiau', less: 'Mažiau',
};

const EN = {
  app: 'Leaf',
  nav_today: 'Today', nav_calendar: 'Calendar', nav_insights: 'Insights', nav_settings: 'Settings',
  phase_menstrual: 'Period', phase_follicular: 'Follicular phase', phase_fertile: 'Fertile days',
  phase_ovulation: 'Ovulation', phase_luteal: 'Luteal phase', phase_pms: 'Before period',
  phase_pregnant: 'Pregnancy', phase_unknown: 'Unknown',
  phase_menstrual_note: 'Your body is working. Warmth, rest, no rush.',
  phase_follicular_note: 'Energy is rising — a good time to start things.',
  phase_fertile_note: 'Highest chance of conceiving.',
  phase_ovulation_note: 'The egg has been released (or is about to be).',
  phase_luteal_note: 'Progesterone rises, energy slowly settles.',
  phase_pms_note: 'Period is near — feeling tender is normal.',
  day_of_cycle: 'Cycle day', cycle_day_short: 'day',
  until_period: 'Until period', period_in_days: 'Period in {n} days',
  period_today: 'Period expected today', period_tomorrow: 'Period expected tomorrow',
  late_by: '{n} days late', probably: 'Likely', between: '{a}–{b}',
  log_today: 'Log today', log_day: 'Log this day', edit_day: 'Edit entry',
  quick_period: 'Period started', quick_period_end: 'Period ended',
  no_data_yet: 'No data yet', start_hint: 'Mark the first day of your period — everything starts from there.',
  stale_title: 'Tracking has a gap',
  stale_note: 'The last entry is too old for a meaningful prediction. Mark your latest period.',
  confidence_high: 'prediction is tight', confidence_medium: 'prediction is approximate', confidence_low: 'prediction is rough',
  based_on_cycles: 'from {c}', based_on_default: 'from a default {n}-day cycle',
  suggest_test: 'More than a week late. If there is a chance, a test is worth taking.',
  legend_period: 'Period', legend_predicted: 'Predicted', legend_fertile: 'Fertile',
  legend_ovulation: 'Ovulation', legend_window: 'Possible days', legend_logged: 'Has entry',
  months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  weekdays: ['S','M','T','W','T','F','S'],   // 0 = Sunday
  today: 'Today', future_note: 'Future days cannot be logged.',
  log_flow: 'Flow', log_mood: 'Mood', log_symptoms: 'Symptoms',
  log_mucus: 'Discharge', log_sex: 'Sex life', log_tests: 'Tests',
  log_meds: 'Medication', log_bbt: 'Basal temperature', log_weight: 'Weight', log_notes: 'Notes',
  log_energy: 'Energy', log_sleep: 'Sleep',
  bbt_hint: 'Measure right after waking, same time, before lifting your head.',
  notes_placeholder: 'Anything worth remembering about today…',
  save: 'Save', cancel: 'Cancel', delete: 'Delete', done: 'Done', close: 'Close',
  clear_day: 'Clear day', hours: 'h',
  ins_overview: 'Overview', ins_avg_cycle: 'Average cycle', ins_avg_period: 'Period length',
  ins_regularity: 'Regularity', ins_luteal: 'Luteal phase', ins_days: 'days',
  reg_regular: 'Regular', reg_variable: 'Variable', reg_irregular: 'Irregular', reg_unknown: 'Not enough data',
  reg_regular_note: 'Cycles vary by no more than 4 days.',
  reg_variable_note: 'Cycles vary within {n} days — common, but predictions are wider.',
  reg_irregular_note: 'Cycles vary by {n} days. If this is new for you, worth mentioning to a doctor.',
  reg_unknown_note: 'At least 3 full cycles needed.',
  ins_history: 'Cycle history', ins_bbt: 'Temperature curve', ins_patterns: 'Symptom patterns',
  ins_no_patterns: 'Once you log symptoms across a few cycles, the phase they cluster in shows up here.',
  pattern_line: '{sym} — most often: {phase} ({n}×)',
  ins_coverline: 'Coverline', ins_confirmed_ov: 'Confirmed ovulation',
  ins_bbt_empty: 'Log at least 9 morning temperatures — then the ovulation shift becomes visible.',
  ins_cycles_empty: 'Bars appear once there are 2 complete cycles.',
  ins_outlier: 'not counted',
  of_times: 'of {n}',
  mode: 'Mode', mode_track: 'Tracking', mode_ttc: 'Trying to conceive',
  mode_pregnancy: 'Pregnancy', mode_contraception: 'Contraception',
  mode_track_note: 'Cycle, symptoms, predictions.',
  mode_ttc_note: 'Adds fertile days, LH tests, temperature.',
  mode_pregnancy_note: 'Weeks, due date, pregnancy symptoms.',
  mode_contraception_note: 'Pill tracking and cycle.',
  preg_week: 'Week {n}', preg_day_of_week: 'day {n}', preg_due: 'Due date',
  preg_left: '{n} days to go', preg_trimester: 'Trimester {n}', preg_start: 'First day of last period',
  preg_size: 'Baby is about the size of', preg_end: 'End pregnancy mode',
  ttc_title: 'Fertility',
  ttc_fertile_now: 'Today is a fertile day',
  ttc_ovulation_today: 'Ovulation — today',
  ttc_days_to_ov: '{n} days to ovulation',
  ttc_after_ov: 'Ovulation was {n} days ago',
  ttc_confirmed: 'Confirmed by temperature',
  ttc_predicted: 'Estimated from your cycle',
  ttc_by_lh: 'From LH test', ttc_by_mucus: 'From cervical mucus',
  ttc_tip_bbt: 'Take your temperature each morning — after a few cycles ovulation becomes exact.',
  ttc_tip_lh: 'Fertile days are near — time for LH tests.',
  ttc_tip_wait: 'The next fertile days are still far off. Rest is part of it too.',
  pill_title: 'Contraception',
  pill_taken_today: 'Taken today',
  pill_not_yet: 'Not marked yet today',
  pill_take: 'Taken',
  pill_streak: '{n} days in a row',
  pill_missed_recent: 'Missed in 30 days: {n}',
  set_language: 'Language', set_theme: 'Appearance', theme_auto: 'Match phone', theme_light: 'Light', theme_dark: 'Dark',
  set_privacy: 'Privacy', set_pin: 'PIN lock', set_pin_on: 'On', set_pin_off: 'Off',
  set_pin_new: 'New PIN (at least 4 digits)', set_pin_repeat: 'Repeat PIN',
  set_pin_wrong: 'Wrong PIN', set_pin_mismatch: 'PINs do not match', set_pin_short: 'Too short',
  set_pin_note: 'With a PIN your data is stored encrypted on this phone. Forget the PIN and it cannot be recovered.',
  set_pin_remove: 'Turn off PIN',
  unlock_title: 'Enter PIN', unlock_sub: 'Leaf',
  set_data: 'Data', set_export: 'Download a copy', set_import: 'Restore from a copy',
  set_qr: 'Move to another phone', set_wipe: 'Erase everything',
  set_cycle_defaults: 'Defaults', set_avg_cycle: 'Cycle length', set_avg_period: 'Period length',
  set_week_start: 'Week starts on', week_mon: 'Monday', week_sun: 'Sunday',
  set_about: 'About', set_storage: 'Using {n}',
  set_persist_on: 'The browser promised not to clear your data.',
  set_persist_off: 'Tap so the browser will not clear your data automatically.',
  set_persist_btn: 'Protect storage',
  wipe_confirm: 'Erase all data? This cannot be undone.',
  wipe_confirm_yes: 'Yes, erase everything', wiped: 'Erased.',
  export_title: 'Download a copy',
  export_note: 'The file goes to Files (or Downloads). Move it to iCloud, a computer, anywhere — it is your only backup.',
  export_encrypt: 'Encrypt with a password', export_password: 'Password for the file',
  export_plain_warn: 'An unencrypted file can be read by anyone who gets it.',
  export_do: 'Download', exported: 'Copy ready.',
  import_title: 'Restore from a copy', import_choose: 'Choose file',
  import_password: 'File password', import_wrong_pass: 'Wrong password',
  import_bad_file: 'File is not valid or is damaged',
  import_mode: 'What to do with existing data',
  import_merge: 'Merge', import_merge_note: 'Existing entries stay, new ones are added.',
  import_replace: 'Replace', import_replace_note: 'Everything on this phone is replaced by the file.',
  import_do: 'Restore', imported: 'Restored {n} daily entries.',
  qr_title: 'Move to another phone',
  qr_intro: 'No internet, no cloud: the old phone shows codes, the new one reads them with the camera.',
  qr_send: 'Send from this phone', qr_receive: 'Receive on this phone',
  qr_sending: 'Show this screen to the other phone', qr_frame: 'Frame {i} of {n}',
  qr_hold: 'Hold the phones 15–25 cm apart until the bar fills.',
  qr_receiving: 'Point the camera at the other phone screen',
  qr_progress: '{n}% collected', qr_done: 'Transferred! {n} daily entries.',
  qr_camera_denied: 'Camera not allowed. Settings → Safari → Camera.',
  qr_camera_none: 'Could not start the camera.',
  qr_lib_fail: 'Could not load the QR part. Reopen the app.',
  qr_speed: 'Normal', qr_slower: 'Slower', qr_faster: 'Faster',
  qr_stop: 'Stop', qr_encrypted_note: 'The transfer is encrypted — the same code is needed on both phones.',
  qr_code_label: 'Transfer code', qr_code_enter: 'Enter the code from the other phone',
  onb_welcome: 'Hello',
  onb_intro: 'This app has no account, no server and never goes online. Everything you write stays on this phone.',
  onb_last_period: 'When did your last period start?',
  onb_last_period_skip: 'Not sure — I will mark it later',
  onb_cycle_len: 'How long is your usual cycle?',
  onb_dont_know: 'I do not know', onb_start: 'Start',
  onb_backup: 'Since the data lives only here, download a copy once a month — Settings → Download a copy.',
  disclaimer_short: 'Predictions are not contraception.',
  disclaimer: 'Predictions come from your own entries and can be wrong. This is not a medical device and not a method of birth control.',
  backup_nudge: 'It has been a while since your last backup. The data lives only on this phone.',
  backup_now: 'Back up now', later: 'Later',
  yes: 'Yes', no: 'No', on: 'On', off: 'Off', none: 'None',
  days_short: 'd', add: 'Add', more: 'More', less: 'Less',
};

const DICT = { lt: LT, en: EN };

/** Atviras žodynas — kalbų vientisumo testui. */
export const dictionaries = DICT;

let current = 'lt';

export function detectLang() {
  const n = (navigator.language || 'lt').toLowerCase();
  return n.startsWith('lt') ? 'lt' : 'en';
}

export function setLang(lang) {
  current = DICT[lang] ? lang : 'lt';
  document.documentElement.lang = current;
  return current;
}

export function getLang() { return current; }

/** Lietuviškas daiktavardžio linksnis prie skaičiaus: 1 ciklą, 3 ciklus, 11 ciklų. */
export function plural(n, one, few, many) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 9 && !(dd >= 11 && dd <= 19)) return few;
  return many;
}

/** t('period_in_days', {n: 3}) → „Mėnesinės po 3 d." */
export function t(key, vars) {
  let s = DICT[current]?.[key] ?? LT[key] ?? key;
  if (vars && typeof s === 'string') {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

/** „1 ciklą" / „4 ciklus" / „11 ciklų" — arba „4 cycles". */
export function cycleCount(n) {
  if (current === 'en') return `${n} cycle${n === 1 ? '' : 's'}`;
  return `${n} ${plural(n, 'ciklą', 'ciklus', 'ciklų')}`;
}

/** „3 dienos" / „21 diena" / „11 dienų" — LT skaičiuotiniai linksniai. */
export function dayCount(n) {
  if (current === 'en') return `${n} day${n === 1 ? '' : 's'}`;
  return `${n} ${plural(n, 'diena', 'dienos', 'dienų')}`;
}

/** Katalogo elemento pavadinimas dabartine kalba. */
export function name(item) { return item ? `${current === 'en' ? item.en : item.lt}` : ''; }

export function monthName(i) { return t('months')[i]; }

/** „rugpjūčio 22 d." / „22 August" */
export function formatDate(isoStr, opts = {}) {
  const [y, m, d] = isoStr.split('-').map(Number);
  const mn = t('months')[m - 1];
  if (current === 'lt') {
    const gen = mn.replace(/is$|as$|ė$/, s => ({ is: 'io', as: 'o', 'ė': 'ės' }[s]));
    return opts.year ? `${y} m. ${gen} ${d} d.` : `${gen} ${d} d.`;
  }
  return opts.year ? `${d} ${mn} ${y}` : `${d} ${mn}`;
}

/** Trumpai: „08-22" */
export function formatShort(isoStr) { return isoStr.slice(5).replace('-', '-'); }
