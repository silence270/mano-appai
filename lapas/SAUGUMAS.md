# Saugumas

Šis failas — kad po metų būtų aišku, nuo ko app'as gina, nuo ko ne, ir kodėl
kiekvienas sprendimas būtent toks.

## Nuo ko ginamasi

| Scenarijus | Kas ginа |
|---|---|
| Kas nors paima telefoną ir naršo po app'us | PIN užraktas; app'as užsirakina vos perėjus į foną |
| Kas nors žiūri app'ų perjungiklį | Turinys uždengiamas **prieš** iOS ekrano nuotrauką |
| Telefonas pavagiamas, ištraukiamas disko vaizdas | Viskas AES-GCM-256; rakto diske nėra |
| Kas nors prijungia telefoną prie kompiuterio ir atidaro saugyklos inspektorių | Vardai neutralūs (`appdata`, raktai a–e), turinys — dvejetainis triukšmas |
| Kas nors verčia atrakinti | PIN atvirkščiai atveria tuščią app'ą, atrodantį kaip ką tik įdiegtas |
| Kas nors spėlioja PIN | Auganti delsa, išliekanti perkrovus |
| Į app'ą įterpiamas kodas | CSP `connect-src 'none'` — išsiųsti duomenų fiziškai neįmanoma |
| Eksporto failas patenka svetimoms rankoms | Šifravimas įjungtas iš anksto; vardas — tik data |
| QR perdavimas nufilmuojamas | Srautas užšifruotas 6 skaitmenų kodu |

## Raktų schema

```
duomenys ──AES-GCM──> šifrograma
   ▲
  DEK (atsitiktinis 256 bitų raktas)
   ▲            ▲            ▲
 PIN         atkūrimo      Face ID
              kodas      (WebAuthn PRF)
```

DEK yra vienas, o būdų jį atrakinti — trys. Todėl PIN keičiamas neperšifruojant
duomenų, o pamiršus jį duomenys nedingsta.

Kiekvienas raktų kelias diske užima **fiksuotus 60 baitų**, ir visi trys yra
visada. Nenaudotoje vietoje guli atsitiktiniai baitai, todėl iš disko neįmanoma
pasakyti, ar Face ID įjungtas ar atkūrimo kodas apskritai egzistuoja.

**KDF:** PBKDF2-SHA256, 310 000 iteracijų (OWASP 2023), 16 baitų druska.
**Šifras:** AES-GCM-256, 12 baitų IV, naujas kiekvienam įrašymui.

## Du skyriai

Skyriai yra **du ir vienodi**: po 256 KB, fiksuoto dydžio, abu atrodo kaip
atsitiktiniai baitai. Vieną atrakina PIN, kitą — tas pats PIN atvirkščiai.

Dydis fiksuotas sąmoningai. Jei tikrasis skyrius augtų, tektų perdydinti ir
paslėptąjį — o jo rakto neturime, kol jis neatrakintas. Taip pat elgiasi
paslėpti diskų tomai: paslėptoji dalis turi dydį, nustatytą kūrimo metu.
256 KB po suspaudimo — daugiau nei dešimtmetis kasdienių įrašų.

Jei PIN skaitomas vienodai į abi puses (1221), atvirkštinio nėra — tada antrame
skyriuje lieka triukšmas, ir iš disko tai neatskiriama.

### Ką verta žinoti apie atvirkštinį PIN

Atvirkštinis PIN patogus — nereikia atsiminti antro. Bet jis **nuspėjamas iš
tikrojo**: kas matė, kaip įvedi `4821`, gali pabandyti `1284`. Todėl
nustatymuose galima pasirinkti nesusijusį kodą; tada ryšio nebelieka.

## Atkūrimo kodas

120 bitų, Crockford base32 be `I`, `L`, `O`, `U` (kad perrašant nesupainiotum).
Rodomas **vieną kartą**. Naują galima pasidaryti tik įvedus PIN — kad to
negalėtų padaryti kas nors, kam telefonas pateko į rankas atrakintas.

**Kodėl ne atkūrimas el. paštu.** Laiškui reikėtų serverio. Serveris žinotų el.
paštą, atrakinimo laiką ir IP. Svarbiau: kodas iš laiško duomenų neatrakintų —
raktas išvestas iš PIN, serveris jo neturi. Kad veiktų, raktą reikėtų laikyti
serveryje, o tada serveris gali skaityti ciklo duomenis. Tai priešinga visam
app'o pažadui.

## Face ID

WebAuthn PRF plėtinys grąžina 32 baitus, kuriuos gali gauti tik tas pats
įrenginys po biometrinės patikros. Iš jų išvedamas raktas, kuriuo užrakinamas
tas pats DEK. Paskyra vietinė (discoverable credential) — serverio nėra,
niekas niekur nesiunčiama, app'as jokios veido informacijos negauna.

Reikia iOS 18+. Kur nepalaikoma — sąžiningai nesiūloma.

## Spėliojimo lėtinimas

| Klaidų | Pauzė |
|---|---|
| 1–4 | nėra |
| 5–9 | 30 s |
| 10–14 | 5 min |
| 15+ | 1 val. |

Pauzė saugoma diske, tad perkrovimas jos neapeina. Riba nesikeičia ir ties 1 val.:
duomenų app'as netrina ir savininkės nuo jų neatkerta.

## Ko app'as NEGALI

Šitai svarbu ne mažiau už tai, ką gali:

- **Neapsaugo nuo telefono su stebėjimo programa.** Jei kas nors mato ekraną ar
  klavišus, šifravimas nieko neduoda.
- **Neapsaugo nuo žvilgsnio per petį** — nei įvedant PIN, nei naudojant.
- **Jei kas nors žino PIN, jis mato viską.** Priverstinis atskleidimas sprendžiamas
  tik paslėptu skyriumi, o ir tas turi aukščiau aprašytą trūkumą.
- **4 skaitmenų PIN yra 10 000 variantų.** Delsa daro spėliojimą nepraktišką
  telefone, bet ne tada, kai saugykla nukopijuojama ir spėliojama atskirai —
  ten gina tik PBKDF2 kaina. Ilgesnis PIN gerokai stipresnis.
- **Atsarginė kopija saugi tiek, kiek vieta, kur ją padėsi.**
- **Ekrano nuotraukų PWA blokuoti negali.**
- **Duomenų atkūrimo nėra**, jei pamesti ir PIN, ir atkūrimo kodas, ir kopija.
  Tai ne trūkumas, o kaina už tai, kad niekas kitas jų neturi.

## Kas tikrinama automatiškai

`test/vault.test.js` (30 testų) tikrina ne tik „ar veikia", bet ir ko **nematyti**:

- diske nėra nė vieno atviro teksto gabalo;
- saugyklos ir raktų vardai nieko nesako;
- abu skyriai vienodo dydžio ir po įrašymo lieka lygūs;
- panikos skyrius neatidaromas pagrindiniu PIN, o rašymas jame nepaliečia tikrojo;
- senas PIN po keitimo nustoja veikti, atkūrimo kodas — lieka;
- delsa auga ir išlieka „perkrovus";
- ištrynus diske nelieka nieko.
