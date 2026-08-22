# Lapas 🍃

Ciklo sekimo app'as, kuris **nesiunčia nieko niekur**. Nėra paskyros, nėra serverio,
nėra tinklo užklausų. Viskas guli telefone (IndexedDB) ir išeina tik tada, kai pati
paspaudi „Atsisiųsti kopiją" arba perkeli QR kodais.

## Kuo skiriasi nuo Flo ir panašių

| | Flo | Lapas |
|---|---|---|
| Duomenys | jų serveriuose | tik telefone |
| Paskyra | privaloma | nėra |
| Tinklas | nuolat | 0 užklausų |
| Perkėlimas | per jų debesį | failas arba QR |
| Kaina | prenumerata | — |

## Kaip veikia prognozė

Ne „28 dienos minus 14" — ta taisyklė tinka 13 % ciklų. Variklis (`js/predict.js`)
yra log-normalus hierarchinis Bajeso modelis, kuris mokosi iš tavo pačios ciklų:

- **Šaltas startas iš populiacijos**, bet su kiekvienu ciklu populiacijos svoris krenta
  (po 4 ciklų ~27 %, po 12 — ~11 %). Nurodžius savo įprastą ciklą, prior centras — jis.
- **Prior priklauso nuo amžiaus**: ciklas trumpėja ~0,18 d. per metus, o po 45 m.
  kintamumas šoka aukštyn.
- **Prognozė yra intervalas, ne diena.** Stjudento t posterior prediktyvusis skirstinys.
  Kuo netaisyklingesni ciklai, tuo platesnis langas.
- **Ciklui vykstant prognozė atsinaujina** — skirstinys nupjaunamas ties šiandiena.
  Būtent čia modelis nurungia paprastą vidurkį.
- **Anomalūs ciklai nusveriami, ne šalinami** (Huber su MAD masteliu): šalinimas
  dirbtinai susiaurintų intervalą, o tai pavojingiausias gedimo būdas.
- **Trendas trumpina atmintį** — po gimdymo ar perimenopauzėje ciklai nuosekliai kinta,
  ir sena istorija tik trukdo.
- **Ovuliacija imama iš Johnson 2018 LH lentelės**, o ne atimtimi. Kūno požymiai
  (BBT, LH, gleivės) viršija kalendorių.
- **Kai duomenų nepakanka, taškinė diena nerodoma.** Vietoj jos — langas ir priežastis.
- **App'as matuoja savo paklaidą** ir rodo ją: „paskutinės 7 prognozės: vidutiniškai
  suklydome 1,2 d."

Kiekvienos konstantos šaltinis — [MOKSLAS.md](MOKSLAS.md).

## Perkėlimas į kitą telefoną

Be interneto: senas telefonas rodo animuotą QR srautą, naujas nuskaito kamera.

- Duomenys **suspaudžiami (gzip), tada šifruojami** — ne atvirkščiai. Metų duomenys
  telpa į kelis kadrus vietoj kelių dešimčių.
- Kadrai rodomi kas ratą kita tvarka — kitaip kamera, praleidžianti kas antrą kadrą,
  amžinai praleistų tuos pačius gabalus.
- Header neša gabalo dydį, tad sugadintas kadras atmetamas iškart, o ne sugriūna
  surenkant pabaigoje.
- Perdavimas užšifruotas 6 skaitmenų kodu (AES-GCM, PBKDF2 310k).

## Struktūra

```
lapas/
├── index.html  styles.css  sw.js  manifest.json
├── js/
│   ├── predict.js    ← Bajeso prognozės matematika (gryna, testuojama node'e)
│   ├── cycle.js      ← ciklai, fazės, kalendorius, duomenų kokybė
│   ├── db.js         ← IndexedDB, pasirenkamas šifravimas PIN'u
│   ├── crypto.js     ← PBKDF2 + AES-GCM
│   ├── transfer.js   ← eksportas, importas, QR srautas
│   ├── i18n.js       ← LT/EN, lietuviški skaičiuotiniai linksniai
│   ├── catalog.js    ← simptomai, nuotaikos (vienas šaltinis abiem kalbom)
│   └── ui/           ← ekranai
├── lib/              ← qrcode-generator (MIT), jsQR (Apache 2.0)
├── test/             ← node --test
└── tools/            ← kūrimo įrankiai (gyvai neveikia)
```

## Kūrimas

```bash
node tools/dev-server.mjs 8132     # serveris be cache
open http://localhost:8132/lapas/tools/preview.html   # visų ekranų stendas
open http://localhost:8132/lapas/tools/seed.html      # testiniai duomenys
npm test                            # 74 testai
```

Ikonos pergeneruojamos: `node tools/make-icons.mjs`

## Ko šis app'as nedaro

- **Nesiunčia push priminimų.** iOS PWA to negali be serverio, o serverio čia nėra.
- **Nėra kontracepcijos priemonė.** Jokia prognozė — nei ši, nei Flo — nesaugo nuo nėštumo.
- **Neturi atsarginės kopijos debesyje.** Pametei telefoną be eksporto — duomenys dingo.
  Todėl app'as pats primena pasidaryti kopiją.
