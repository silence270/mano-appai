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

Ne „28 dienos minus 14". Variklis (`js/cycle.js`) mokosi iš tavo pačios ciklų:

- **Svertinė mediana** — naujesni ciklai sveria daugiau (`DECAY = 0.85`), tad vienas
  60 dienų ciklas po ligos nesugriauna prognozės.
- **Robustiška sklaida** (MAD × 1.4826) → prognozė rodoma kaip **diapazonas**,
  ne kaip viena diena. Kuo netaisyklingesni ciklai, tuo platesnis langas ir žemesnis
  `confidence` — geriau pasakyti „nežinau tiksliai" nei meluoti.
- **Ovuliacija skaičiuojama atgal** nuo kitų mėnesinių per liuteininę fazę, kuri yra
  stabilesnė už folikulinę. Asmeninė liuteininės fazės trukmė išmokstama iš patvirtintų
  ovuliacijų (`lutealLength`).
- **Kūnas viršija kalendorių**: BBT „3 virš 6" taisyklė > LH testas > gleivių peak day >
  kalendorinis spėjimas.
- **Nutrūkęs žymėjimas** (`stale`) rodomas kaip nutrūkęs, o ne „vėluoja 200 dienų".

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
│   ├── cycle.js      ← prognozės variklis (grynas, be DOM — testuojamas node'e)
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
npm test                            # 42 testai
```

Ikonos pergeneruojamos: `node tools/make-icons.mjs`

## Ko šis app'as nedaro

- **Nesiunčia push priminimų.** iOS PWA to negali be serverio, o serverio čia nėra.
- **Nėra kontracepcijos priemonė.** Jokia prognozė — nei ši, nei Flo — nesaugo nuo nėštumo.
- **Neturi atsarginės kopijos debesyje.** Pametei telefoną be eksporto — duomenys dingo.
  Todėl app'as pats primena pasidaryti kopiją.
