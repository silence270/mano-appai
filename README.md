# Mano app'ai 📱

Asmeninių app'ų paleidiklis. **Visiškai atskira** nuo VDU STEAM serverio —
čia tik tavo įrankiai, statiniai failai, be jokio serverio kodo.

```
mano-appai/
├── index.html        ← paleidiklis (plytelės)
├── sturmanas/        ← 🏁 Ralio šturmanas (Kaunas + Kauno r.)
├── augalai/          ← 🌿 Žaliasis dienoraštis
├── manifest.json  sw.js  icons/
```

## Kaip paleisti į internetą (reikia HTTPS — be jo neveiks GPS)

### Variantas A — Cloudflare Pages (rekomenduoju, tu jau naudoji)

1. **GitHub Desktop** → `File ▸ Add Local Repository…` → pasirink `~/mano-appai`
2. `Publish repository` → pavadinimas `mano-appai` → **Keep this code private** ✓
3. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → `Create` → **Pages**
   → `Connect to Git` → pasirink `mano-appai`
4. Nustatymai: **Framework preset: None**, *Build command:* **(tuščia)**,
   *Build output directory:* **`/`** → `Save and Deploy`
5. Po ~1 min gausi adresą: `https://mano-appai.pages.dev`

Toliau — kiekvienas `git push` automatiškai atnaujina.

### Variantas B — GitHub Pages
Po 1–2 žingsnio: repo → `Settings ▸ Pages` → *Source:* `Deploy from a branch`,
*Branch:* `main` / `root` → `Save`. Adresas: `https://<vardas>.github.io/mano-appai/`
(privačiam repo reikia GitHub Pro).

## Įsidėti į iPhone

Safari → tavo adresas → **Dalintis □↑** → **Įtraukti į pagrindinį ekraną**.
Galima įsidėti ir kiekvieną app'ą atskirai (pvz. `…/sturmanas/`) — tada atsidaro
tiesiai jis, be paleidiklio.

## Pridėti naują app'ą

1. Nukopijuok jo failus į naują aplanką, pvz. `mano-appai/naujas/`
2. `index.html` faile, `APPS` masyve — viena eilutė:

```js
{ name:'Naujas', url:'naujas/', icon:'naujas/icons/icon-192.png',
  desc:'Ką jis daro.' },
```

Nėra ikonos? Naudok `emoji:'🎯', bg:'#2a2f3d'` vietoj `icon`.

## Šturmano duomenų atnaujinimas

Kelių duomenys (kameros, kalneliai) — 2026-07 OSM kopija. Atnaujinti:

```bash
cd ~/sturmanas
python3 tools/1-fetch.py --force && python3 tools/2-build.py && python3 tools/3-graph.py
cp -R app/* ~/mano-appai/sturmanas/
```

Pilna Šturmano dokumentacija: `~/sturmanas/README.md`.

---

**Svarbu:** VDU STEAM serveris (`~/Desktop/fotoakademija-server`, `steam.vdu.lt`) —
atskiras projektas, čia nieko iš jo nėra ir atvirkščiai.
