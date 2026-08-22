# Kuo remiasi prognozė

Kiekvienas skaičius `js/predict.js` ir `js/cycle.js` faile ateina iš recenzuoto
šaltinio. Šis failas — kad po metų būtų aišku, kodėl būtent tokia konstanta.

## Kodėl ne „28 dienos minus 14"

| Prielaida | Kiek ji teisinga | Šaltinis |
|---|---|---|
| Ciklas 28 d. | tik **13 % ciklų** / 16,3 % moterų | Bull 2019 (612 613 ciklų); Grieger 2020 (1,58 mln. moterų) |
| Liuteininė fazė 14 d. | iš tikrųjų **12,4 ± 2,4 d.** | Bull 2019 |
| Ovuliacija 14-ą dieną | 28 d. ciklui tikimiausia **16-a** (21 %); 14-a tik ketvirta (14 %) | Johnson 2018 (949 moterys, kasdienis LH) |
| Ovuliacija ciklo viduryje | tik **~24 %** ovuliacijų 14–15 d. | Symul 2019 (109 161 ciklas) |
| Vaisingas langas 10–17 d. | telpa tik **~30 %** moterų | Wilcox 2000 (696 ciklai) |

Todėl `predict.js` turi **Johnson 2018 lentelę** (`OVU`), o ne atimtį. Trumpiems
ciklams skirtumas didelis: 24 d. ciklui „minus 14" duotų 10-ą dieną, o iš tikrųjų
ovuliacija ~13,2 d. — klaida 3 dienos, tiesiai per vaisingą langą.

## Modelis

`predict.js` — log-normalus hierarchinis Bajeso modelis su Normal-Inverse-Gamma prior.

| Sprendimas | Kodėl | Šaltinis |
|---|---|---|
| Log skalė, ne normali | ciklo ilgio pasiskirstymas dešiniojo šleifo | SkipTrack 2025; Symul 2019 |
| `kappa0 = 1.5` | NIG modelyje SD(μ) = σ/√κ₀ turi atspindėti **tarpasmeninį** kintamumą (~4,5 d.), ne vidinį (2,6 d.) | Bull 2019: populiacijos SD 5,2, vidinis 2,6 |
| Prior vidurkis pagal amžių | ciklas trumpėja **−0,176 d./metus** (R² = 0,994) | Bull 2019 |
| Prior SD pagal amžių | asmeninis SD: 2,9 (18–24) … **2,3 (35–39)** … 3,5 (45+) | Bull 2019 |
| Eksponentinė atmintis ρ = 0,85–0,95 | n_eff ≈ 6–19 ciklų; publikuoti modeliai mokosi iš ~10 | Li 2021 |
| Atmintis trumpinama esant **trendui** | ciklai nuosekliai kinta po gimdymo, perimenopauzėje, nutraukus kontraceptikus; CLD trendo nemato | Treloar 1967; STRAW+10 |
| Huber su MAD masteliu | anomalūs ciklai nusveriami, **ne šalinami**: šalinimas dirbtinai susiaurintų intervalą | Sci Rep 2021 (26 % ciklų „overdispersed") |
| Stjudento t intervalas | posterior prediktyvusis skirstinys NIG modelyje | standartinė Bajeso išvada |
| Sąlyginė prognozė ciklui vykstant | čia modelis nurungia vidurkį: RMSE 11,8 vs 21,9 (40-ą dieną) | Li 2021 (JAMIA) |

Neuroninio tinklo nėra sąmoningai: Li 2021 parodė, kad CNN/RNN/LSTM ciklo pradžios
prognozėje **nenurungia paprasto vidurkio** (8,03 / 7,76 / 7,40 vs 7,50 RMSE).

## Kūno požymiai viršija kalendorių

Prioritetas `ovulationFor()` funkcijoje:

| Požymis | Tikslumas | Kada rodo |
|---|---|---|
| **BBT** „3 virš 6" | sutampa su LH ±1 d. tik **22 %** atvejų; jautrumas 0,23 | tik retrospektyviai, 3 d. po ovuliacijos |
| **LH testas** | ovuliacija po **33,9 val.** (22–56 val.) | prognozuoja parą į priekį |
| **Gleivių peak day** | **97,8 %** per ±4 d.; ovuliacija vidutiniškai +0,9 d. | prognozuoja |
| Kalendorius | jokio app'o tikslumas neviršija **21 %** | atsarginis variantas |

BBT naudojama ne ovuliacijai prognozuoti, o **asmeninei liuteininei fazei išmokti**
(`lutealLength`) — jos vidinis kintamumas 3,0 d., perpus mažesnis nei folikulinės (5,2 d.),
todėl po kelių ciklų ji tampa geriausiai žinomu parametru.

## Kada sakoma „nežinau"

`dataQuality()` blokuoja taškinę prognozę, kai:

| Priežastis | Riba | Šaltinis |
|---|---|---|
| per mažai ciklų | < 3 | AWHS ribojo analizę ≥ 3 ciklais |
| netaisyklingi | median(CLD) ≥ 6 d. | 31 % moterų (Grieger 2020) |
| už normos ribų | ≥ 2 ciklai < 21 d. arba > 38 d. | FIGO; FDA precaution |
| perimenopauzė | ≥ 45 m. ir CLD ≥ 7 d. | STRAW+10; netaisyklingumo OR 4,75 (45–49 m.) |
| po hormonų | < 60 d. nuo nutraukimo | FDA DEN170052; Nassaralla 2011 |
| galimas praleidimas | ciklas > mediana + CLD + 15 d. | AWHS (taip pažymėta 3,9 % ciklų) |
| labai ilgas | > 90 d. | ne prognozės, o gydytojos klausimas |

## Ko app'as nežada

- **Ne kontracepcija.** Kalendorinis metodas: **24 %** nesėkmės per metus (typical use).
  Net Natural Cycles su kasdiene BBT ir LH: Pearl Index **6,9**. Todėl „saugių dienų"
  nerodoma niekada, ir tai užrašyta ekrane.
- **Ne diagnozė.** Rodomas stebėjimas („ciklai svyravo 9 d."), ne išvada.
- ES teisėje app'as, kurio paskirtis — išvengti nėštumo, yra **IIb klasės medicinos
  prietaisas** (MDR Rule 15). Riba nustatoma UI formuluotėmis, ne kodu.

## Savikontrolė

`calibration()` retrospektyviai perskaičiuoja kiekvieno ciklo prognozę tik iš
ankstesnių ciklų ir lygina su faktu. Vartotoja mato tikrą savo paklaidą
(„paskutinės 7 prognozės: vidutiniškai suklydome 1,2 d.") — vienintelis sąžiningas
būdas komunikuoti tikslumą. Testai tikrina, kad 80 % langas Monte Carlo simuliacijoje
dengia 75–90 % tikrų ciklų.

## Šaltiniai

- Bull JR et al. Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles. *npj Digit Med* 2019;2:83. https://www.nature.com/articles/s41746-019-0152-7
- Johnson S, Marriott L, Zinaman M. Can apps and calendar methods predict ovulation with accuracy? *Curr Med Res Opin* 2018;34(9):1587–1595.
- Symul L et al. Assessment of menstrual health status and evolution through mobile apps. *npj Digit Med* 2019;2:64.
- Li K et al. A generative, predictive model for menstrual cycle lengths. *JAMIA* 2022;29(1):3–11. https://arxiv.org/abs/2102.12439
- Wilcox AJ, Dunson D, Baird DD. The timing of the "fertile window". *BMJ* 2000;321:1259–1262.
- Wilcox AJ, Weinberg CR, Baird DD. Timing of sexual intercourse in relation to ovulation. *NEJM* 1995;333:1517–1521.
- Grieger JA, Norman RJ. Menstrual cycle length and patterns in a global cohort. *J Med Internet Res* 2020;22(6):e17109.
- Wang Z et al. Menstrual cycle length variation — Apple Women's Health Study. *npj Digit Med* 2023;6:100.
- Fehring RJ, Schneider M, Raviele K. Variability in the phases of the menstrual cycle. *JOGNN* 2006;35(3):376–384.
- Prospective 1-year assessment of within-woman variability of follicular and luteal phase lengths. *Hum Reprod* 2024;39(11):2565.
- Su HW et al. Detection of ovulation, a review of currently available methods. *Bioeng Transl Med* 2017;2(3):238–246.
- The LH surge and ovulation re-visited: systematic review and meta-analysis. *Hum Reprod Update* 2022.
- Berglund Scherwitzl E et al. Perfect-use and typical-use Pearl Index of a contraceptive mobile app. *Contraception* 2017;96(6):420–425.
- FDA De Novo DEN170052 (Natural Cycles), 21 CFR 884.5370.
- Modelling menstrual cycle length in athletes using state-space models. *Sci Rep* 2021;11:16972.
- Duttweiler L et al. SkipTrack: Bayesian hierarchical model for self-tracked cycle length. https://arxiv.org/pdf/2508.05845
