# Module « Potentiel de secteur » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à ImmoProspect une vue « Potentiel de secteur » : un score 0-100 par commune (et IRIS) combinant volume DVF, turn-over, concurrence SIRENE, indice 3D INSEE et valeur unitaire, restitué sur une carte choroplèthe avec détail des facteurs.

**Architecture:** Tables pré-calculées (`iris_potentiel`, `commune_potentiel`) remplies par des scripts d'ingestion (DVF 2025, INSEE IRIS, SIRENE, CSV locaux) puis un script de calcul de score réutilisant les fonctions `normaliser()` et `fiabilite()` existantes de `database.js`. Une route API sert les données ; une nouvelle page React affiche la carte + le panneau détail. On suit les patterns existants (`ingest-dpe.js`, `irisRoutes.js`, `CartePage.jsx`).

**Tech Stack:** Node + Express + better-sqlite3 ; React + Vite + Leaflet/react-leaflet + recharts ; Tailwind (charte quai-navy/quai-gold) ; icônes Lucide via `Icon.jsx`. Aucun emoji.

**Répertoire de travail :** `/Users/loickferrucci/Desktop/immo-prospect/`

**Convention de commit :** terminer chaque message par
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Contexte technique réutilisé (lire avant de commencer)

Ces éléments EXISTENT déjà et doivent être réutilisés, pas réécrits :

- **`server/src/database.js`** exporte `{ db, recalculerScores, calculerCommission }`.
  - `db` : instance better-sqlite3 (mode WAL).
  - Contient une fonction interne `normaliser(rows, champ, pct=0.95)` : normalise un indicateur
    0-100 avec écrêtage au 95e percentile (robuste aux outliers). **On la rend exportable** (Task 2).
  - Contient `fiabilite(nb)` : facteur 0-1 atténuant les petits effectifs (log²). **On la rend exportable** (Task 2).
  - La table `ponderations(cle TEXT PRIMARY KEY, valeur REAL)` stocke les poids façon `module.facteur`.
- **`server/src/ingest/ingest-dpe.js`** : pattern d'ingestion CSV (lecture fichier local, parse, transaction, stats finales). À copier pour les nouveaux scripts.
- **`server/src/routes/irisRoutes.js`** : pattern de route GeoJSON protégée par `requireAuth`. À copier.
- **`client/src/pages/CartePage.jsx`** + **`client/src/components/CarteIris.jsx`** : pattern carte Leaflet + panneau. À copier pour la vue Potentiel.
- **`client/src/components/AppHeader.jsx`** : navigation à 4 onglets. On y ajoute l'accès à la nouvelle vue.
- DVF brut déjà présent : `data/sources/dvf/38_2021.csv.gz` … `38_2024.csv.gz` (colonnes connues : `id_mutation, date_mutation, nature_mutation, valeur_fonciere, code_commune, longitude, latitude, type_local, surface_reelle_bati`).
- CSV locaux fourni : `~/Downloads/communes-locaux-adresses-2024.csv` (colonnes `code_commune,nom_commune,population,nb_locaux,nb_adresses_locaux`). On le copie dans `data/sources/locaux/`.

**Règle de score (rappel spec) :** `score = 0,35·volume + 0,20·rotation + 0,20·concurrence_inv + 0,15·indice3d + 0,10·valeur`, chaque facteur normalisé 0-100 via `normaliser()`, score final atténué par `fiabilite(nb_logements)`. Poids dans `ponderations` sous clés `potentiel.*`.

---

## Structure des fichiers

**Créés :**
- `server/src/ingest/ingest-locaux.js` — charge le CSV locaux → table `commune_locaux`.
- `server/src/ingest/ingest-dvf2025.js` — télécharge + ajoute DVF 2025 aux comptages → table `dvf_mutations`.
- `server/src/ingest/ingest-insee3d.js` — télécharge bases INSEE IRIS → colonnes 3D sur `iris_potentiel`.
- `server/src/ingest/ingest-sirene.js` — interroge l'API entreprises → table `commune_agences`.
- `server/src/ingest/calcul-potentiel.js` — calcule scores, remplit `iris_potentiel` + `commune_potentiel`.
- `server/src/routes/potentielRoutes.js` — API `GET /api/potentiel`, `/api/potentiel/:code`.
- `server/src/lib/dvf.js` — helper partagé : comptage des mutations DVF (dédup `id_mutation`).
- `client/src/pages/PotentielPage.jsx` — page de la vue.
- `client/src/components/CartePotentiel.jsx` — carte choroplèthe.
- `client/src/components/PotentielPanel.jsx` — panneau détail des facteurs.

**Modifiés :**
- `server/src/database.js` — nouvelles tables, export `normaliser`/`fiabilite`, poids `potentiel.*`.
- `server/src/index.js` — branchement de la route potentiel.
- `package.json` — scripts npm d'ingestion.
- `client/src/components/AppHeader.jsx` — accès à la vue Potentiel.
- `client/src/App.jsx` (ou routeur) — route `/potentiel`.

---

## Task 1 : Schéma DB — nouvelles tables + poids

**Files:**
- Modify: `server/src/database.js`
- Test: `server/test/schema.test.js` (créé)

- [ ] **Step 1: Écrire le test de schéma**

Créer `server/test/schema.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

// Tables créées
['commune_locaux','dvf_mutations','commune_agences','iris_potentiel','commune_potentiel']
  .forEach(t => assert.ok(tableExists(t), `table ${t} manquante`));

// Poids potentiel.* présents et sommant à 1
const poids = db.prepare("SELECT cle, valeur FROM ponderations WHERE cle LIKE 'potentiel.%' AND cle NOT LIKE 'potentiel.3d.%'").all();
const cles = poids.map(p => p.cle).sort();
assert.deepStrictEqual(cles,
  ['potentiel.concurrence','potentiel.indice3d','potentiel.rotation','potentiel.valeur','potentiel.volume'],
  'clés de poids potentiel incorrectes');
const somme = poids.reduce((s,p) => s + p.valeur, 0);
assert.ok(Math.abs(somme - 1) < 1e-9, `somme des poids = ${somme}, attendu 1`);

// Sous-poids 3D somment à 1
const p3d = db.prepare("SELECT valeur FROM ponderations WHERE cle LIKE 'potentiel.3d.%'").all();
assert.ok(Math.abs(p3d.reduce((s,p)=>s+p.valeur,0) - 1) < 1e-9, 'sous-poids 3D != 1');

console.log('schema.test OK');
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `node server/test/schema.test.js`
Expected: AssertionError « table commune_locaux manquante ».

- [ ] **Step 3: Ajouter les tables au bloc `db.exec` de database.js**

Dans `server/src/database.js`, à la fin du gros `db.exec(\`…\`)` (juste avant la backtick fermante `\`);` ligne ~130), ajouter :

```sql
  CREATE TABLE IF NOT EXISTS commune_locaux (
    code_commune TEXT PRIMARY KEY,
    nom_commune TEXT,
    population INTEGER DEFAULT 0,
    nb_locaux INTEGER DEFAULT 0,
    nb_adresses INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS dvf_mutations (
    id_mutation TEXT,
    date_mutation TEXT,
    code_commune TEXT,
    code_iris TEXT,
    type_local TEXT,
    valeur_fonciere REAL,
    surface_reelle_bati REAL,
    lon REAL, lat REAL,
    PRIMARY KEY (id_mutation, code_commune)
  );
  CREATE INDEX IF NOT EXISTS idx_dvf_commune ON dvf_mutations(code_commune);
  CREATE INDEX IF NOT EXISTS idx_dvf_iris ON dvf_mutations(code_iris);
  CREATE INDEX IF NOT EXISTS idx_dvf_date ON dvf_mutations(date_mutation);
  CREATE TABLE IF NOT EXISTS commune_agences (
    code_commune TEXT PRIMARY KEY,
    nom_commune TEXT,
    nb_agences INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS iris_potentiel (
    code_iris TEXT PRIMARY KEY,
    code_commune TEXT,
    nb_logements INTEGER DEFAULT 0,
    n_ventes INTEGER DEFAULT 0,
    volume REAL DEFAULT 0,
    rotation REAL DEFAULT 0,
    prix_m2_median REAL DEFAULT 0,
    pct_mobilite REAL DEFAULT 0,
    pct_prop_ages REAL DEFAULT 0,
    pct_monoparental REAL DEFAULT 0,
    indice3d REAL DEFAULT 0,
    score INTEGER DEFAULT 0,
    fiabilite TEXT DEFAULT 'C',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_irispot_commune ON iris_potentiel(code_commune);
  CREATE TABLE IF NOT EXISTS commune_potentiel (
    code_commune TEXT PRIMARY KEY,
    nom_commune TEXT,
    geometry TEXT,
    nb_logements INTEGER DEFAULT 0,
    n_ventes INTEGER DEFAULT 0,
    volume REAL DEFAULT 0,
    rotation REAL DEFAULT 0,
    prix_m2_median REAL DEFAULT 0,
    nb_agences INTEGER DEFAULT 0,
    indice3d REAL DEFAULT 0,
    score INTEGER DEFAULT 0,
    score_volume INTEGER DEFAULT 0,
    score_rotation INTEGER DEFAULT 0,
    score_concurrence INTEGER DEFAULT 0,
    score_indice3d INTEGER DEFAULT 0,
    score_valeur INTEGER DEFAULT 0,
    fiabilite TEXT DEFAULT 'C',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_commpot_score ON commune_potentiel(score DESC);
```

- [ ] **Step 4: Ajouter les poids par défaut `potentiel.*`**

Dans `database.js`, après la ligne `db.prepare("INSERT OR IGNORE INTO ponderations (cle, valeur) VALUES ('apporteurs.taux_defaut', 10)").run();` (~ligne 175), ajouter :

```js
// Pondérations du module "potentiel de secteur" (5 critères, somme = 1)
const DEFAULT_POIDS_POTENTIEL = {
  'potentiel.volume': 0.35,
  'potentiel.rotation': 0.20,
  'potentiel.concurrence': 0.20, // INVERSÉ : moins d'agences = meilleur score
  'potentiel.indice3d': 0.15,
  'potentiel.valeur': 0.10,
  // sous-poids internes de l'indice 3D (somme = 1)
  'potentiel.3d.mobilite': 0.50,
  'potentiel.3d.prop_ages': 0.30,
  'potentiel.3d.monoparental': 0.20,
  // taux d'intermédiation (paramètre, défaut 0,65)
  'potentiel.intermediation': 0.65,
};
Object.entries(DEFAULT_POIDS_POTENTIEL).forEach(([k, v]) => insP.run(k, v));
```

(`insP` est le prepared statement `INSERT OR IGNORE INTO ponderations` déjà défini plus haut dans le fichier.)

- [ ] **Step 5: Lancer le test pour le voir passer**

Run: `node server/test/schema.test.js`
Expected: `schema.test OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/database.js server/test/schema.test.js
git commit -m "$(printf 'feat(potentiel): schema DB + ponderations\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2 : Exporter `normaliser` et `fiabilite`

**Files:**
- Modify: `server/src/database.js:293` (ligne `module.exports`)
- Test: `server/test/exports.test.js` (créé)

- [ ] **Step 1: Écrire le test**

Créer `server/test/exports.test.js` :

```js
const assert = require('assert');
const { normaliser, fiabilite } = require('../src/database');

assert.strictEqual(typeof normaliser, 'function', 'normaliser non exporté');
assert.strictEqual(typeof fiabilite, 'function', 'fiabilite non exporté');

// normaliser : la plus grande valeur (sous le cap) tend vers 100, la plus petite vers 0
const rows = [{code_iris:'a',x:0},{code_iris:'b',x:50},{code_iris:'c',x:100}];
const n = normaliser(rows, 'x');
assert.ok(n['a'] === 0, 'min doit valoir 0');
assert.ok(n['c'] >= 99, 'max doit approcher 100');

// fiabilite : croissante, bornée à 1
assert.ok(fiabilite(3) < fiabilite(100), 'fiabilite doit croître');
assert.ok(fiabilite(1000) === 1, 'fiabilite plafonne à 1');
assert.ok(fiabilite(0) === 0, 'fiabilite(0) = 0');

console.log('exports.test OK');
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `node server/test/exports.test.js`
Expected: `normaliser non exporté`.

- [ ] **Step 3: Ajouter les deux fonctions à l'export**

Dans `server/src/database.js`, remplacer la ligne :

```js
module.exports = { db, recalculerScores, calculerCommission };
```

par :

```js
module.exports = { db, recalculerScores, calculerCommission, normaliser, fiabilite };
```

- [ ] **Step 4: Lancer pour voir passer**

Run: `node server/test/exports.test.js`
Expected: `exports.test OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/database.js server/test/exports.test.js
git commit -m "$(printf 'refactor(db): exporter normaliser et fiabilite\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3 : Ingestion CSV locaux

**Files:**
- Create: `server/src/ingest/ingest-locaux.js`
- Modify: `package.json` (scripts)
- Test: `server/test/ingest-locaux.test.js` (créé)

- [ ] **Step 1: Copier le fichier source dans le dépôt**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
mkdir -p data/sources/locaux
cp ~/Downloads/communes-locaux-adresses-2024.csv data/sources/locaux/
```

- [ ] **Step 2: Écrire le script d'ingestion**

Créer `server/src/ingest/ingest-locaux.js` :

```js
/**
 * Ingestion du CSV "communes-locaux-adresses-2024" (national) FILTRÉ sur l'Isère (38xxx)
 * dans la table `commune_locaux`. Colonnes source :
 *   code_commune,nom_commune,population,nb_locaux,nb_adresses_locaux
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../database');

const F = path.join(__dirname, '..', '..', '..', 'data', 'sources', 'locaux', 'communes-locaux-adresses-2024.csv');

function main() {
  const lines = fs.readFileSync(F, 'utf8').split(/\r?\n/);
  const header = lines[0].split(',');
  const I = (c) => header.indexOf(c);
  const iCode=I('code_commune'), iNom=I('nom_commune'), iPop=I('population'),
        iLoc=I('nb_locaux'), iAdr=I('nb_adresses_locaux');

  db.prepare('DELETE FROM commune_locaux').run();
  const ins = db.prepare('INSERT OR REPLACE INTO commune_locaux (code_commune,nom_commune,population,nb_locaux,nb_adresses) VALUES (?,?,?,?,?)');
  let n = 0;
  const tx = db.transaction(() => {
    for (let k = 1; k < lines.length; k++) {
      if (!lines[k]) continue;
      const c = lines[k].split(',');
      if (!c[iCode] || !c[iCode].startsWith('38')) continue; // Isère uniquement
      ins.run(c[iCode], c[iNom] || null,
        parseInt(c[iPop]) || 0, parseInt(c[iLoc]) || 0, parseInt(c[iAdr]) || 0);
      n++;
    }
  });
  tx();
  const tot = db.prepare('SELECT SUM(nb_locaux) s FROM commune_locaux').get().s;
  console.log(`commune_locaux: ${n} communes Isère, ${tot} locaux au total.`);
  process.exit(0);
}
main();
```

- [ ] **Step 3: Ajouter le script npm**

Dans `package.json`, dans `"scripts"`, ajouter après `"ingest:dpe"` :

```json
    "ingest:locaux": "node server/src/ingest/ingest-locaux.js",
```

- [ ] **Step 4: Exécuter l'ingestion**

Run: `npm run ingest:locaux`
Expected: `commune_locaux: 512 communes Isère, 776378 locaux au total.` (ordres de grandeur ; 512 ±20 communes, ~776k locaux).

- [ ] **Step 5: Écrire le test de vérification**

Créer `server/test/ingest-locaux.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');
const n = db.prepare('SELECT COUNT(*) c FROM commune_locaux').get().c;
assert.ok(n >= 480 && n <= 540, `nb communes = ${n}, attendu ~512`);
const tot = db.prepare('SELECT SUM(nb_locaux) s FROM commune_locaux').get().s;
assert.ok(tot > 700000 && tot < 850000, `total locaux = ${tot}, attendu ~776k`);
assert.ok(db.prepare("SELECT 1 FROM commune_locaux WHERE code_commune='38185'").get(), 'Grenoble (38185) absente');
console.log('ingest-locaux.test OK');
```

- [ ] **Step 6: Lancer le test**

Run: `node server/test/ingest-locaux.test.js`
Expected: `ingest-locaux.test OK`

- [ ] **Step 7: Commit**

```bash
git add server/src/ingest/ingest-locaux.js server/test/ingest-locaux.test.js package.json data/sources/locaux/.gitignore 2>/dev/null
git add server/src/ingest/ingest-locaux.js server/test/ingest-locaux.test.js package.json
git commit -m "$(printf 'feat(potentiel): ingestion CSV locaux par commune\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

(Note : `data/sources/` est gitignoré ; le CSV n'est pas committé, seul le script l'est.)

---

## Task 4 : Helper DVF partagé + ingestion DVF (2021-2025) dans `dvf_mutations`

**Files:**
- Create: `server/src/lib/dvf.js`
- Create: `server/src/ingest/ingest-dvf2025.js`
- Modify: `package.json`
- Test: `server/test/dvf.test.js` (créé)

- [ ] **Step 1: Écrire le helper de parsing DVF**

Créer `server/src/lib/dvf.js` :

```js
/**
 * Helper de lecture des fichiers DVF (geo-dvf, format CSV gzippé).
 * Renvoie les mutations de type "Vente" portant sur un logement (Maison/Appartement),
 * DÉDUPLIQUÉES par id_mutation (une vente multi-lots = 1 transaction).
 */
const fs = require('fs');
const zlib = require('zlib');

const COLS = ['id_mutation','date_mutation','nature_mutation','valeur_fonciere',
  'code_commune','type_local','surface_reelle_bati','longitude','latitude'];

// Lit un .csv.gz DVF, renvoie un Map id_mutation -> mutation logement dédupliquée.
function lireFichierDvf(cheminGz, accMap) {
  const raw = zlib.gunzipSync(fs.readFileSync(cheminGz)).toString('utf8');
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = {}; COLS.forEach(c => idx[c] = header.indexOf(c));
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue;
    const c = lines[k].split(',');
    if (c[idx.nature_mutation] !== 'Vente') continue;
    const tl = c[idx.type_local];
    if (tl !== 'Maison' && tl !== 'Appartement') continue;
    const id = c[idx.id_mutation];
    if (!id) continue;
    // dédup : on garde la 1re occurrence (le logement principal de la mutation)
    if (accMap.has(id)) continue;
    const surf = parseFloat(c[idx.surface_reelle_bati]);
    const val = parseFloat(c[idx.valeur_fonciere]);
    accMap.set(id, {
      id_mutation: id,
      date_mutation: c[idx.date_mutation] || null,
      code_commune: c[idx.code_commune] || null,
      type_local: tl,
      valeur_fonciere: isNaN(val) ? null : val,
      surface_reelle_bati: isNaN(surf) ? null : surf,
      lon: parseFloat(c[idx.longitude]) || null,
      lat: parseFloat(c[idx.latitude]) || null,
    });
  }
  return accMap;
}

module.exports = { lireFichierDvf };
```

- [ ] **Step 2: Écrire le test du helper**

Créer `server/test/dvf.test.js` :

```js
const assert = require('assert');
const path = require('path');
const { lireFichierDvf } = require('../src/lib/dvf');

const f = path.join(__dirname,'..','..','data','sources','dvf','38_2024.csv.gz');
const map = lireFichierDvf(f, new Map());
assert.ok(map.size > 3000, `mutations 2024 = ${map.size}, attendu >3000`);
const m = [...map.values()][0];
assert.ok(['Maison','Appartement'].includes(m.type_local), 'type_local filtré');
assert.ok(m.code_commune && m.code_commune.startsWith('38'), 'code_commune Isère');
assert.ok(m.id_mutation, 'id_mutation présent');
console.log('dvf.test OK (' + map.size + ' mutations 2024)');
```

- [ ] **Step 3: Lancer le test (doit passer avec les fichiers existants)**

Run: `node server/test/dvf.test.js`
Expected: `dvf.test OK (NNNN mutations 2024)` avec NNNN > 3000.

- [ ] **Step 4: Écrire le script d'ingestion DVF (télécharge 2025, ingère 2021-2025)**

Créer `server/src/ingest/ingest-dvf2025.js` :

```js
/**
 * Remplit la table `dvf_mutations` à partir des fichiers DVF 2021-2025 (logements vendus).
 * Le millésime 2025 est TÉLÉCHARGÉ depuis geo-dvf s'il n'est pas déjà présent localement.
 * Rattachement IRIS : on rapproche chaque mutation de l'IRIS via la table adresses
 * (commune + proximité) — approche simple : code_iris laissé NULL ici, rempli au calcul
 * par jointure spatiale approximative (commune). Pour le V1 on agrège surtout à la commune.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { db } = require('../database');
const { lireFichierDvf } = require('../lib/dvf');

const DVF_DIR = path.join(__dirname, '..', '..', '..', 'data', 'sources', 'dvf');
const URL_2025 = 'https://files.data.gouv.fr/geo-dvf/latest/csv/2025/departements/38.csv.gz';
const F_2025 = path.join(DVF_DIR, '38_2025.csv.gz');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

async function main() {
  if (!fs.existsSync(F_2025)) {
    console.log('Téléchargement DVF 2025…');
    try { await download(URL_2025, F_2025); }
    catch (e) { console.warn('DVF 2025 non téléchargé (' + e.message + '), on continue sans.'); }
  }
  const annees = ['2021','2022','2023','2024','2025'];
  const map = new Map();
  for (const a of annees) {
    const f = path.join(DVF_DIR, `38_${a}.csv.gz`);
    if (!fs.existsSync(f)) { console.warn(`millésime ${a} absent, ignoré`); continue; }
    lireFichierDvf(f, map);
    console.log(`  ${a} cumulé: ${map.size} mutations`);
  }
  db.prepare('DELETE FROM dvf_mutations').run();
  const ins = db.prepare(`INSERT OR REPLACE INTO dvf_mutations
    (id_mutation,date_mutation,code_commune,code_iris,type_local,valeur_fonciere,surface_reelle_bati,lon,lat)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const m of map.values()) {
      ins.run(m.id_mutation, m.date_mutation, m.code_commune, null,
        m.type_local, m.valeur_fonciere, m.surface_reelle_bati, m.lon, m.lat);
    }
  });
  tx();
  const tot = db.prepare('SELECT COUNT(*) c FROM dvf_mutations').get().c;
  console.log(`dvf_mutations: ${tot} mutations logement 2021-2025.`);
  process.exit(0);
}
main();
```

- [ ] **Step 5: Ajouter le script npm**

Dans `package.json`, après `"ingest:locaux"` :

```json
    "ingest:dvf2025": "node server/src/ingest/ingest-dvf2025.js",
```

- [ ] **Step 6: Exécuter (nécessite réseau pour 2025 ; dégrade proprement sinon)**

Run: `npm run ingest:dvf2025`
Expected: lignes de cumul par année, puis `dvf_mutations: NNNNN mutations logement 2021-2025.` (NNNNN de l'ordre de 60 000-90 000).

- [ ] **Step 7: Test de vérification**

Créer `server/test/ingest-dvf.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');
const tot = db.prepare('SELECT COUNT(*) c FROM dvf_mutations').get().c;
assert.ok(tot > 40000, `mutations totales = ${tot}, attendu >40000`);
const dup = db.prepare('SELECT id_mutation, COUNT(*) n FROM dvf_mutations GROUP BY id_mutation, code_commune HAVING n>1 LIMIT 1').get();
assert.ok(!dup, 'doublon id_mutation détecté');
const gren = db.prepare("SELECT COUNT(*) c FROM dvf_mutations WHERE code_commune='38185'").get().c;
assert.ok(gren > 1000, `ventes Grenoble = ${gren}, attendu >1000 sur 4-5 ans`);
console.log('ingest-dvf.test OK ('+tot+' mutations)');
```

Run: `node server/test/ingest-dvf.test.js`
Expected: `ingest-dvf.test OK (NNNNN mutations)`

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/dvf.js server/src/ingest/ingest-dvf2025.js server/test/dvf.test.js server/test/ingest-dvf.test.js package.json
git commit -m "$(printf 'feat(potentiel): ingestion DVF 2021-2025 dedupliquee\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5 : Ingestion concurrence SIRENE

**Files:**
- Create: `server/src/ingest/ingest-sirene.js`
- Modify: `package.json`
- Test: `server/test/ingest-sirene.test.js` (créé)

- [ ] **Step 1: Écrire le script SIRENE**

L'API `recherche-entreprises.api.gouv.fr` est open (sans clé). On compte les ÉTABLISSEMENTS
ouverts d'APE 68.31Z (agences + mandataires) par commune Isère via le paramètre
`code_commune` (un appel par commune connue de `commune_locaux`), en lisant
`nombre_etablissements_ouverts` filtré sur la commune via le bloc `matching_etablissements`.

Approche robuste retenue : paginer la recherche `activite_principale=68.31Z&departement=38`
et compter les établissements ouverts par `code_commune` de leur adresse.

Créer `server/src/ingest/ingest-sirene.js` :

```js
/**
 * Compte les établissements actifs d'agences/mandataires immobiliers (APE 68.31Z)
 * par commune de l'Isère, via l'API publique recherche-entreprises.api.gouv.fr.
 * Remplit la table `commune_agences`. Pas de clé API requise.
 */
const https = require('https');
const { db } = require('../database');

const BASE = 'https://recherche-entreprises.api.gouv.fr/search';
const PARAMS = 'activite_principale=68.31Z&departement=38&etat_administratif=A&per_page=25';

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const compte = {}; // code_commune -> nb établissements ouverts
  let page = 1, totalPages = 1;
  do {
    const url = `${BASE}?${PARAMS}&page=${page}`;
    let j;
    try { j = await getJson(url); }
    catch (e) { console.warn(`page ${page} échec (${e.message})`); break; }
    totalPages = j.total_pages || 1;
    for (const ent of (j.results || [])) {
      for (const et of (ent.matching_etablissements || [])) {
        if (et.etat_administratif && et.etat_administratif !== 'A') continue;
        const cc = et.commune; // code commune INSEE de l'établissement
        if (!cc || !cc.startsWith('38')) continue;
        compte[cc] = (compte[cc] || 0) + 1;
      }
    }
    page++;
    await new Promise(r => setTimeout(r, 120)); // throttle léger
  } while (page <= totalPages);

  db.prepare('DELETE FROM commune_agences').run();
  const ins = db.prepare('INSERT OR REPLACE INTO commune_agences (code_commune,nom_commune,nb_agences) VALUES (?,?,?)');
  const nomDe = db.prepare('SELECT nom_commune FROM commune_locaux WHERE code_commune=?');
  const tx = db.transaction(() => {
    for (const [cc, nb] of Object.entries(compte)) {
      const nom = nomDe.get(cc)?.nom_commune || null;
      ins.run(cc, nom, nb);
    }
  });
  tx();
  const tot = db.prepare('SELECT SUM(nb_agences) s, COUNT(*) c FROM commune_agences').get();
  console.log(`commune_agences: ${tot.s} établissements 68.31Z répartis sur ${tot.c} communes.`);
  process.exit(0);
}
main();
```

- [ ] **Step 2: Ajouter le script npm**

Dans `package.json`, après `"ingest:dvf2025"` :

```json
    "ingest:sirene": "node server/src/ingest/ingest-sirene.js",
```

- [ ] **Step 3: Exécuter (nécessite réseau)**

Run: `npm run ingest:sirene`
Expected: `commune_agences: NNN établissements 68.31Z répartis sur MM communes.` (Isère : ordre de grandeur quelques centaines d'établissements, Grenoble en tête).

- [ ] **Step 4: Test de vérification**

Créer `server/test/ingest-sirene.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');
const tot = db.prepare('SELECT SUM(nb_agences) s, COUNT(*) c FROM commune_agences').get();
assert.ok(tot.c >= 1, 'aucune commune avec agence');
assert.ok(tot.s >= 50, `total agences = ${tot.s}, attendu >=50 pour l'Isère`);
const gren = db.prepare("SELECT nb_agences FROM commune_agences WHERE code_commune='38185'").get();
assert.ok(gren && gren.nb_agences > 5, 'Grenoble devrait avoir plusieurs agences');
console.log('ingest-sirene.test OK ('+tot.s+' agences)');
```

Run: `node server/test/ingest-sirene.test.js`
Expected: `ingest-sirene.test OK (NNN agences)`

Note : si l'API est indisponible au moment de l'exécution, ce test échoue faute de données.
Dans ce cas, relancer `npm run ingest:sirene` plus tard avant de poursuivre Task 6.

- [ ] **Step 5: Commit**

```bash
git add server/src/ingest/ingest-sirene.js server/test/ingest-sirene.test.js package.json
git commit -m "$(printf 'feat(potentiel): ingestion concurrence SIRENE 68.31Z\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6 : Ingestion INSEE 3D + calcul de l'indice 3D par IRIS

**Files:**
- Create: `server/src/ingest/ingest-insee3d.js`
- Modify: `package.json`
- Test: `server/test/ingest-insee3d.test.js` (créé)

- [ ] **Step 1: Documenter et écrire le script INSEE**

Les bases INSEE IRIS 2022 (Logement, Population, Couples-Familles) sont volumineuses et leurs
URLs directes changent. Stratégie : URL directe avec fallback fichier local déposé dans
`data/sources/insee/`. Le script remplit/initialise les lignes `iris_potentiel` avec
`pct_mobilite`, `pct_prop_ages`, `pct_monoparental` puis calcule `indice3d`.

Pour le V1, dériver les 3 proxys depuis les colonnes DÉJÀ présentes dans la table `iris`
quand elles existent (`pct_prop_ages` y est déjà), et compléter par les bases INSEE pour
mobilité et monoparental. **Approche minimale fiable :** réutiliser `iris.pct_prop_ages`
(succession) ; pour mobilité et monoparental, charger les 2 fichiers INSEE.

Créer `server/src/ingest/ingest-insee3d.js` :

```js
/**
 * Initialise iris_potentiel (1 ligne par IRIS de la table `iris`) et calcule les 3 proxys "3D" :
 *   - pct_mobilite     : part des ménages emménagés depuis <2 ans (base INSEE Logement IRIS 2022)
 *   - pct_prop_ages    : réutilisé depuis iris.pct_prop_ages (proxy décès/succession)
 *   - pct_monoparental : part des familles monoparentales (base INSEE Couples-Familles IRIS 2022)
 * Puis indice3d = 0.5*mobilite_n + 0.3*prop_ages_n + 0.2*monoparental_n (normalisés au calcul, Task 7).
 *
 * Les bases INSEE sont lues depuis data/sources/insee/*.csv si présentes. Les colonnes exactes
 * dépendent du millésime ; le script détecte les colonnes par mots-clés. Si un fichier manque,
 * le proxy correspondant est laissé à 0 (et signalé), sans bloquer.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../database');

const INSEE_DIR = path.join(__dirname, '..', '..', '..', 'data', 'sources', 'insee');

// Cherche un CSV dont le nom contient `motif`, renvoie son chemin ou null.
function trouver(motif) {
  if (!fs.existsSync(INSEE_DIR)) return null;
  const f = fs.readdirSync(INSEE_DIR).find(n => n.toLowerCase().includes(motif) && n.endsWith('.csv'));
  return f ? path.join(INSEE_DIR, f) : null;
}

// Lit un CSV INSEE (séparateur ';' usuel), renvoie {code_iris -> valeur} = num/den par ligne.
function ratioParIris(chemin, colCodeKeys, colNumKeys, colDenKeys) {
  const out = {};
  if (!chemin) return out;
  const lines = fs.readFileSync(chemin, 'utf8').split(/\r?\n/);
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map(h => h.trim());
  const find = (keys) => header.findIndex(h => keys.some(k => h.toUpperCase().includes(k)));
  const iCode = find(colCodeKeys), iNum = find(colNumKeys), iDen = find(colDenKeys);
  if (iCode < 0 || iNum < 0 || iDen < 0) return out;
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue;
    const c = lines[k].split(sep);
    const code = (c[iCode] || '').trim().replace(/"/g,'');
    if (!code.startsWith('38')) continue;
    const num = parseFloat((c[iNum]||'').replace(',','.')) || 0;
    const den = parseFloat((c[iDen]||'').replace(',','.')) || 0;
    out[code] = den > 0 ? (num / den) * 100 : 0;
  }
  return out;
}

function main() {
  const irisRows = db.prepare('SELECT code_iris, code_commune, nb_logements, pct_prop_ages FROM iris').all();

  // mobilité : emménagés <2 ans / total ménages (base Logement)
  const mob = ratioParIris(trouver('logement'),
    ['IRIS','CODGEO'], ['EMM','ANEM','INF2','MOINS'], ['MEN','RP','TOT']);
  // monoparental : familles monoparentales / total familles (base couples/familles)
  const mono = ratioParIris(trouver('famille') || trouver('couple'),
    ['IRIS','CODGEO'], ['MONO'], ['FAM','TOT']);

  db.prepare('DELETE FROM iris_potentiel').run();
  const ins = db.prepare(`INSERT OR REPLACE INTO iris_potentiel
    (code_iris, code_commune, nb_logements, pct_mobilite, pct_prop_ages, pct_monoparental)
    VALUES (?,?,?,?,?,?)`);
  let avecMob = 0, avecMono = 0;
  const tx = db.transaction(() => {
    for (const r of irisRows) {
      const m = mob[r.code_iris] || 0, mo = mono[r.code_iris] || 0;
      if (m > 0) avecMob++; if (mo > 0) avecMono++;
      ins.run(r.code_iris, r.code_commune, r.nb_logements || 0, m, r.pct_prop_ages || 0, mo);
    }
  });
  tx();
  console.log(`iris_potentiel initialisé: ${irisRows.length} IRIS (${avecMob} avec mobilité, ${avecMono} avec monoparental).`);
  if (avecMob === 0) console.warn('  ⚠ Aucune donnée mobilité — déposer la base INSEE Logement IRIS dans data/sources/insee/');
  if (avecMono === 0) console.warn('  ⚠ Aucune donnée monoparental — déposer la base INSEE Couples-Familles IRIS dans data/sources/insee/');
  process.exit(0);
}
main();
```

- [ ] **Step 2: Ajouter le script npm**

Dans `package.json`, après `"ingest:sirene"` :

```json
    "ingest:insee3d": "node server/src/ingest/ingest-insee3d.js",
```

- [ ] **Step 3: Exécuter**

Run: `npm run ingest:insee3d`
Expected: `iris_potentiel initialisé: 749 IRIS (...)`. Si les fichiers INSEE ne sont pas
déposés, les avertissements ⚠ s'affichent mais le script réussit (proxys mobilité/monoparental
à 0, prop_ages réutilisé). Le score restera calculable (indice3d dégradé).

- [ ] **Step 4: Test de vérification**

Créer `server/test/ingest-insee3d.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');
const n = db.prepare('SELECT COUNT(*) c FROM iris_potentiel').get().c;
assert.strictEqual(n, db.prepare('SELECT COUNT(*) c FROM iris').get().c, 'iris_potentiel doit avoir 1 ligne par IRIS');
// prop_ages réutilisé depuis iris : au moins quelques valeurs > 0
const propOk = db.prepare('SELECT COUNT(*) c FROM iris_potentiel WHERE pct_prop_ages > 0').get().c;
assert.ok(propOk > 100, `pct_prop_ages devrait être renseigné (${propOk} IRIS)`);
console.log('ingest-insee3d.test OK ('+n+' IRIS)');
```

Run: `node server/test/ingest-insee3d.test.js`
Expected: `ingest-insee3d.test OK (749 IRIS)`

- [ ] **Step 5: Commit**

```bash
git add server/src/ingest/ingest-insee3d.js server/test/ingest-insee3d.test.js package.json
git commit -m "$(printf 'feat(potentiel): ingestion proxys 3D INSEE par IRIS\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7 : Calcul du score + agrégation commune

**Files:**
- Create: `server/src/ingest/calcul-potentiel.js`
- Modify: `package.json`
- Test: `server/test/calcul-potentiel.test.js` (créé)

- [ ] **Step 1: Écrire le script de calcul**

Réutilise `normaliser` et `fiabilite` exportés (Task 2). Étapes :
1. agrège les ventes DVF (12 mois glissants + volume 5 ans) par IRIS (via commune→IRIS pondéré
   par logements, car `dvf_mutations.code_iris` est NULL en V1) et par commune ;
2. calcule rotation, prix médian, indice3d normalisé ;
3. normalise les 5 facteurs, applique poids + fiabilité, écrit `iris_potentiel.score` ;
4. agrège tout à la commune (`commune_potentiel`), avec contour dissous des IRIS et classe fiabilité.

Créer `server/src/ingest/calcul-potentiel.js` :

```js
/**
 * Calcule le score "potentiel de secteur" (0-100) par IRIS et par commune.
 * Facteurs (normalisés via normaliser(), poids depuis ponderations 'potentiel.*') :
 *   volume (35) + rotation (20) + concurrence_inv (20) + indice3d (15) + valeur (10),
 *   score final atténué par fiabilite(nb_logements).
 */
const { db, normaliser, fiabilite } = require('../database');

const CLASSE = (n) => n >= 30 ? 'A' : n >= 10 ? 'B' : 'C';

function medianeSurf(rows) { // prix m² médian d'une liste de mutations
  const px = rows.map(m => (m.valeur_fonciere && m.surface_reelle_bati > 9)
    ? m.valeur_fonciere / m.surface_reelle_bati : null).filter(x => x && x > 200 && x < 20000).sort((a,b)=>a-b);
  return px.length ? px[Math.floor(px.length/2)] : 0;
}

function main() {
  const poids = {};
  db.prepare('SELECT cle, valeur FROM ponderations').all().forEach(r => poids[r.cle] = r.valeur);

  // --- Agrégats DVF par commune ---
  const mutations = db.prepare('SELECT id_mutation, date_mutation, code_commune, valeur_fonciere, surface_reelle_bati FROM dvf_mutations').all();
  // fenêtre 12 mois glissants = derniers 365 jours présents dans les données
  const dates = mutations.map(m => m.date_mutation).filter(Boolean).sort();
  const dMax = dates[dates.length - 1] || '2025-12-31';
  const d12 = new Date(new Date(dMax).getTime() - 365*864e5).toISOString().slice(0,10);
  const anneesSpan = 5; // 2021-2025

  const parCommune = {}; // code_commune -> { n12, total, muts:[] }
  for (const m of mutations) {
    const cc = m.code_commune; if (!cc) continue;
    const g = parCommune[cc] || (parCommune[cc] = { n12:0, total:0, muts:[] });
    g.total++; g.muts.push(m);
    if (m.date_mutation && m.date_mutation >= d12) g.n12++;
  }

  // --- Construire les lignes commune ---
  const communes = db.prepare('SELECT code_commune, nom_commune, SUM(nb_logements) nb_logements FROM iris GROUP BY code_commune').all();
  const locaux = {}; db.prepare('SELECT code_commune, nb_locaux FROM commune_locaux').all().forEach(r => locaux[r.code_commune] = r.nb_locaux);
  const agences = {}; db.prepare('SELECT code_commune, nb_agences FROM commune_agences').all().forEach(r => agences[r.code_commune] = r.nb_agences);
  const i3dByComm = {}; db.prepare(`SELECT code_commune,
      AVG(pct_mobilite) mob, AVG(pct_prop_ages) age, AVG(pct_monoparental) mono
      FROM iris_potentiel GROUP BY code_commune`).all()
      .forEach(r => i3dByComm[r.code_commune] = r);

  const inter = poids['potentiel.intermediation'] || 0.65;
  const rows = communes.map(c => {
    const g = parCommune[c.code_commune] || { n12:0, total:0, muts:[] };
    const stock = locaux[c.code_commune] || c.nb_logements || 0;
    const volume = (g.total / anneesSpan) * inter;        // transactions/an intermédiables
    const rotation = stock > 0 ? (g.n12 / stock) * 1000 : 0; // ‰ sur 12 mois
    const nbAg = agences[c.code_commune] || 0;
    // concurrence inversée : ventes captables par acteur (plus c'est haut, mieux c'est)
    const concurrence = (nbAg + 1) > 0 ? (g.n12 * inter) / (nbAg + 1) : 0;
    const i3 = i3dByComm[c.code_commune] || { mob:0, age:0, mono:0 };
    const prixMed = medianeSurf(g.muts);
    return {
      code_commune: c.code_commune, nom_commune: c.nom_commune,
      nb_logements: stock, n_ventes: g.total,
      volume, rotation, prix_m2_median: prixMed, nb_agences: nbAg,
      _mob: i3.mob, _age: i3.age, _mono: i3.mono, concurrence,
    };
  });

  // indice3d (normalisé en interne puis pondéré)
  const Nmob = normaliser(rows.map(r=>({code_iris:r.code_commune,x:r._mob})),'x');
  const Nage = normaliser(rows.map(r=>({code_iris:r.code_commune,x:r._age})),'x');
  const Nmono= normaliser(rows.map(r=>({code_iris:r.code_commune,x:r._mono})),'x');
  rows.forEach(r => {
    r.indice3d = poids['potentiel.3d.mobilite']*Nmob[r.code_commune]
               + poids['potentiel.3d.prop_ages']*Nage[r.code_commune]
               + poids['potentiel.3d.monoparental']*Nmono[r.code_commune];
  });

  // normaliser les 5 facteurs (clé = code_commune)
  const key = r => ({ code_iris: r.code_commune });
  const Nvol = normaliser(rows.map(r=>({...key(r),x:r.volume})),'x');
  const Nrot = normaliser(rows.map(r=>({...key(r),x:r.rotation})),'x');
  const Ncon = normaliser(rows.map(r=>({...key(r),x:r.concurrence})),'x');
  const Ni3d = normaliser(rows.map(r=>({...key(r),x:r.indice3d})),'x');
  const Nval = normaliser(rows.map(r=>({...key(r),x:r.prix_m2_median})),'x');

  // contours dissous (union naïve des géométries IRIS = MultiPolygon concaténé)
  const geomByComm = {};
  db.prepare('SELECT code_commune, geometry FROM iris WHERE geometry IS NOT NULL').all().forEach(r => {
    try {
      const g = JSON.parse(r.geometry);
      const polys = g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []);
      (geomByComm[r.code_commune] || (geomByComm[r.code_commune] = [])).push(...polys);
    } catch {}
  });

  db.prepare('DELETE FROM commune_potentiel').run();
  const insC = db.prepare(`INSERT OR REPLACE INTO commune_potentiel
    (code_commune,nom_commune,geometry,nb_logements,n_ventes,volume,rotation,prix_m2_median,nb_agences,
     indice3d,score,score_volume,score_rotation,score_concurrence,score_indice3d,score_valeur,fiabilite)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    for (const r of rows) {
      const c = r.code_commune;
      const sv = Math.round(Nvol[c]), sr = Math.round(Nrot[c]),
            sc = Math.round(Ncon[c]), s3 = Math.round(Ni3d[c]), sval = Math.round(Nval[c]);
      const f = fiabilite(r.nb_logements);
      const brut = poids['potentiel.volume']*Nvol[c] + poids['potentiel.rotation']*Nrot[c]
                 + poids['potentiel.concurrence']*Ncon[c] + poids['potentiel.indice3d']*Ni3d[c]
                 + poids['potentiel.valeur']*Nval[c];
      const score = Math.max(0, Math.min(100, Math.round(brut * f)));
      const polys = geomByComm[c] || [];
      const geom = polys.length ? JSON.stringify({ type:'MultiPolygon', coordinates: polys }) : null;
      insC.run(c, r.nom_commune, geom, r.nb_logements, r.n_ventes, r.volume, r.rotation,
        r.prix_m2_median, r.nb_agences, r.indice3d, score, sv, sr, sc, s3, sval, CLASSE(r.n_ventes));
    }
  });
  tx();

  const top = db.prepare('SELECT nom_commune, score, n_ventes, fiabilite FROM commune_potentiel ORDER BY score DESC LIMIT 5').all();
  console.log('commune_potentiel calculé. Top 5 :');
  top.forEach(t => console.log(`  ${t.nom_commune}: ${t.score} (n=${t.n_ventes}, fiab ${t.fiabilite})`));
  process.exit(0);
}
main();
```

- [ ] **Step 2: Ajouter le script npm + un script `potentiel` chaînant tout**

Dans `package.json`, après `"ingest:insee3d"` :

```json
    "calcul:potentiel": "node server/src/ingest/calcul-potentiel.js",
    "potentiel": "npm run ingest:locaux && npm run ingest:dvf2025 && npm run ingest:sirene && npm run ingest:insee3d && npm run calcul:potentiel",
```

- [ ] **Step 3: Exécuter le calcul**

Run: `npm run calcul:potentiel`
Expected: `commune_potentiel calculé. Top 5 :` suivi de 5 communes avec scores. Grenoble/Bourgoin/Vienne attendues haut (gros volume).

- [ ] **Step 4: Test de vérification**

Créer `server/test/calcul-potentiel.test.js` :

```js
const assert = require('assert');
const { db } = require('../src/database');
const rows = db.prepare('SELECT * FROM commune_potentiel').all();
assert.ok(rows.length > 400, `communes scorées = ${rows.length}, attendu >400`);
for (const r of rows) {
  assert.ok(r.score >= 0 && r.score <= 100, `score hors bornes: ${r.nom_commune}=${r.score}`);
  assert.ok(['A','B','C'].includes(r.fiabilite), `fiabilité invalide: ${r.fiabilite}`);
}
// une grande ville à fort volume doit avoir un score élevé
const gren = db.prepare("SELECT score FROM commune_potentiel WHERE code_commune='38185'").get();
assert.ok(gren && gren.score >= 50, `Grenoble score=${gren && gren.score}, attendu >=50`);
console.log('calcul-potentiel.test OK ('+rows.length+' communes)');
```

Run: `node server/test/calcul-potentiel.test.js`
Expected: `calcul-potentiel.test OK (NNN communes)`

- [ ] **Step 5: Commit**

```bash
git add server/src/ingest/calcul-potentiel.js server/test/calcul-potentiel.test.js package.json
git commit -m "$(printf 'feat(potentiel): calcul du score + agregation commune\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8 : Route API `/api/potentiel`

**Files:**
- Create: `server/src/routes/potentielRoutes.js`
- Modify: `server/src/index.js`
- Test: `server/test/api-potentiel.test.js` (créé)

- [ ] **Step 1: Écrire la route (copier le pattern d'irisRoutes.js)**

Créer `server/src/routes/potentielRoutes.js` :

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

// FeatureCollection des communes (score = couleur). ?light=1 pour omettre la géométrie.
router.get('/', (req, res) => {
  const light = req.query.light === '1';
  const cols = light
    ? 'code_commune,nom_commune,score,fiabilite,n_ventes'
    : '*';
  const rows = db.prepare(`SELECT ${cols} FROM commune_potentiel ORDER BY score DESC`).all();
  if (light) return res.json(rows);
  const features = rows.map(r => {
    let geometry = null;
    try { geometry = r.geometry ? JSON.parse(r.geometry) : null; } catch { geometry = null; }
    const { geometry: _g, ...props } = r;
    return { type:'Feature', geometry, properties: props };
  });
  res.json({ type:'FeatureCollection', features });
});

// Détail d'une commune (tous les sous-facteurs, sans géométrie)
router.get('/:code', (req, res) => {
  const r = db.prepare('SELECT * FROM commune_potentiel WHERE code_commune = ?').get(req.params.code);
  if (!r) return res.status(404).json({ error: 'Commune non trouvée' });
  const { geometry, ...rest } = r;
  res.json(rest);
});

module.exports = router;
```

- [ ] **Step 2: Brancher la route dans index.js**

Dans `server/src/index.js`, repérer les lignes `app.use('/api/iris', …)` et ajouter à côté :

```js
app.use('/api/potentiel', require('./routes/potentielRoutes'));
```

- [ ] **Step 3: Écrire le test API**

Créer `server/test/api-potentiel.test.js` :

```js
const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev';
const app = require('../src/index');

const token = jwt.sign({ id:1, role:'admin' }, process.env.JWT_SECRET);
function get(path) {
  return new Promise((resolve) => {
    const req = http.request({ method:'GET', host:'127.0.0.1', port: app.address().port, path,
      headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let d=''; res.on('data',x=>d+=x); res.on('end',()=>resolve({status:res.statusCode, body: JSON.parse(d||'{}')}));
    }); req.end();
  });
}

(async () => {
  const light = await get('/api/potentiel?light=1');
  assert.strictEqual(light.status, 200);
  assert.ok(Array.isArray(light.body) && light.body.length > 400, 'liste light trop courte');
  assert.ok(light.body[0].score >= light.body[1].score, 'pas trié par score décroissant');

  const fc = await get('/api/potentiel');
  assert.strictEqual(fc.body.type, 'FeatureCollection');

  const det = await get('/api/potentiel/38185');
  assert.strictEqual(det.status, 200);
  assert.ok('score_volume' in det.body, 'sous-facteurs manquants');

  const ko = await get('/api/potentiel/00000');
  assert.strictEqual(ko.status, 404);

  console.log('api-potentiel.test OK');
  process.exit(0);
})();
```

**Pré-requis :** `server/src/index.js` doit exporter un serveur écoutant (déjà le cas si
`module.exports = app.listen(...)`). Si `index.js` n'exporte pas le serveur, ajouter en fin de
fichier : `module.exports = server;` (où `server` est le retour de `app.listen`). Vérifier le
fichier et adapter avant de lancer le test.

- [ ] **Step 4: Lancer le test**

Run: `JWT_SECRET=dev node server/test/api-potentiel.test.js`
Expected: `api-potentiel.test OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/potentielRoutes.js server/src/index.js server/test/api-potentiel.test.js
git commit -m "$(printf 'feat(potentiel): route API /api/potentiel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9 : Page React — carte choroplèthe + panneau détail

**Files:**
- Create: `client/src/pages/PotentielPage.jsx`
- Create: `client/src/components/CartePotentiel.jsx`
- Create: `client/src/components/PotentielPanel.jsx`
- Modify: `client/src/components/AppHeader.jsx`
- Modify: routeur (`client/src/App.jsx`)

- [ ] **Step 1: Lire les patterns existants à copier**

Lire `client/src/pages/CartePage.jsx`, `client/src/components/CarteIris.jsx`,
`client/src/components/ZonePanel.jsx`, `client/src/components/ScoreLegend.jsx`,
`client/src/components/AppHeader.jsx`, `client/src/components/ui/Icon.jsx`, et le routeur
(`client/src/App.jsx`) pour réutiliser exactement : appel API authentifié (hook/fetch wrapper),
composant carte Leaflet, dégradé de couleur quai-navy→quai-gold, et règle `z-[1100]` des panneaux.

- [ ] **Step 2: Écrire `CartePotentiel.jsx`**

Composant carte Leaflet choroplèthe. Charge `/api/potentiel` (FeatureCollection), colore chaque
commune selon `properties.score` (échelle quai-navy clair → quai-gold), au clic appelle
`onSelect(code_commune)`. Copier la structure de `CarteIris.jsx` en remplaçant la source et la
clé de couleur (`score`). Réutiliser le même calcul de couleur que `ScoreLegend`/`CarteIris`
(extraire la fonction `couleurScore(score)` si elle existe déjà, sinon la dupliquer localement
avec le même dégradé).

```jsx
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api'; // adapter au wrapper réel repéré au Step 1

function couleurScore(s) {
  // dégradé quai-navy (#1f2a44) -> quai-gold (#c8a24a) ; reprendre l'échelle existante
  const t = Math.max(0, Math.min(100, s)) / 100;
  const lerp = (a,b)=>Math.round(a+(b-a)*t);
  const r=lerp(31,200), g=lerp(42,162), b=lerp(68,74);
  return `rgb(${r},${g},${b})`;
}

export default function CartePotentiel({ onSelect }) {
  const [fc, setFc] = useState(null);
  useEffect(() => { apiGet('/api/potentiel').then(setFc); }, []);
  if (!fc) return <div className="p-4 text-quai-navy">Chargement…</div>;
  return (
    <MapContainer center={[45.18, 5.72]} zoom={9} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <GeoJSON
        data={fc}
        style={(f) => ({
          fillColor: couleurScore(f.properties.score),
          fillOpacity: 0.7, color: '#fff', weight: 1,
        })}
        onEachFeature={(f, layer) => {
          layer.on('click', () => onSelect && onSelect(f.properties.code_commune));
          layer.bindTooltip(`${f.properties.nom_commune} — ${f.properties.score}/100`);
        }}
      />
    </MapContainer>
  );
}
```

- [ ] **Step 3: Écrire `PotentielPanel.jsx`**

Panneau latéral détail (au clic commune). Charge `/api/potentiel/:code`, affiche score global +
jauge, puis les 5 sous-facteurs (`score_volume`, `score_rotation`, `score_concurrence`,
`score_indice3d`, `score_valeur`) avec leur valeur brute (`volume`, `rotation`, `nb_agences`,
`indice3d`, `prix_m2_median`), et la classe de fiabilité A/B/C + `n_ventes`. Icônes Lucide via
`Icon.jsx`. **Panneau en `z-[1100]`** (au-dessus de Leaflet). Aucun emoji.

```jsx
import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api';
import Icon from './ui/Icon';

const FACTEURS = [
  { cle:'score_volume', label:'Volume de marché', brut:'n_ventes', unite:'ventes (5 ans)', ic:'TrendingUp' },
  { cle:'score_rotation', label:'Turn-over', brut:'rotation', unite:'‰ /an', ic:'RefreshCw' },
  { cle:'score_concurrence', label:'Concurrence', brut:'nb_agences', unite:'agences', ic:'Users' },
  { cle:'score_indice3d', label:'Indice 3D', brut:'indice3d', unite:'', ic:'Home' },
  { cle:'score_valeur', label:'Valeur unitaire', brut:'prix_m2_median', unite:'€/m²', ic:'Euro' },
];

export default function PotentielPanel({ code, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (code) apiGet(`/api/potentiel/${code}`).then(setD); }, [code]);
  if (!code) return null;
  return (
    <div className="absolute top-4 right-4 z-[1100] w-80 bg-white rounded-xl shadow-xl p-5 border border-quai-navy/10">
      {!d ? <div>Chargement…</div> : (<>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-quai-navy">{d.nom_commune}</h3>
          <button onClick={onClose} aria-label="Fermer"><Icon name="X" className="w-4 h-4" /></button>
        </div>
        <div className="text-3xl font-bold text-quai-gold mb-1">{d.score}<span className="text-base text-quai-navy/50">/100</span></div>
        <div className="text-xs text-quai-navy/60 mb-4">Fiabilité {d.fiabilite} · {d.n_ventes} ventes analysées</div>
        <ul className="space-y-2">
          {FACTEURS.map(f => (
            <li key={f.cle} className="flex items-center gap-2 text-sm">
              <Icon name={f.ic} className="w-4 h-4 text-quai-navy/60" />
              <span className="flex-1">{f.label}</span>
              <span className="text-quai-navy/50 text-xs">{Math.round(d[f.brut])} {f.unite}</span>
              <span className="font-semibold w-8 text-right">{d[f.cle]}</span>
            </li>
          ))}
        </ul>
      </>)}
    </div>
  );
}
```

- [ ] **Step 4: Écrire `PotentielPage.jsx`**

```jsx
import { useState } from 'react';
import AppHeader from '../components/AppHeader';
import CartePotentiel from '../components/CartePotentiel';
import PotentielPanel from '../components/PotentielPanel';

export default function PotentielPage() {
  const [code, setCode] = useState(null);
  return (
    <div className="h-screen flex flex-col">
      <AppHeader />
      <div className="relative flex-1">
        <CartePotentiel onSelect={setCode} />
        <PotentielPanel code={code} onClose={() => setCode(null)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Ajouter la route et l'onglet de navigation**

Dans le routeur (`client/src/App.jsx`), ajouter la route `/potentiel` → `PotentielPage`
(copier la forme des routes existantes). Dans `AppHeader.jsx`, ajouter un lien/onglet
« Potentiel » (icône Lucide, ex. `Gauge`) pointant vers `/potentiel`, en suivant exactement le
style des onglets existants.

- [ ] **Step 6: Build du client**

Run: `npm --prefix client run build`
Expected: build réussi, aucune erreur d'import. Corriger les chemins d'import (`apiGet`, `Icon`)
selon ce qui a été repéré au Step 1.

- [ ] **Step 7: Vérification live navigateur (OBLIGATOIRE — pas seulement "élément présent")**

Lancer l'app (`npm start` côté serveur + servir le client buildé, ou le dev server), se connecter
(`admin@lequai-immobilier.com` / `admin123`), aller sur `/potentiel`. Vérifier visuellement :
- la carte rend avec un dégradé de couleur lisible par commune ;
- un clic sur une commune ouvre le panneau **AU-DESSUS** de la carte (z-index correct, leçon du
  bug précédent — un panneau derrière Leaflet = échec) ;
- les 5 facteurs + la classe de fiabilité s'affichent ;
- aucun emoji nulle part, charte quai-navy/quai-gold respectée.

Utiliser le preview navigateur (screenshot) pour confirmer, pas seulement l'inspecteur DOM.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/PotentielPage.jsx client/src/components/CartePotentiel.jsx client/src/components/PotentielPanel.jsx client/src/components/AppHeader.jsx client/src/App.jsx
git commit -m "$(printf 'feat(potentiel): vue carte + panneau detail des facteurs\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10 : Finalisation — recompression DB + déploiement

**Files:**
- Modify: `server/data/prospect.db.gz`
- Modify: `REPRISE.md`

- [ ] **Step 1: Checkpoint WAL et recompression de la base**

Toutes les données pré-calculées (`commune_potentiel`, `iris_potentiel`, etc.) doivent partir
en prod. Suivre le rituel habituel :

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const {db}=require('./server/src/database'); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"
gzip -9 -c server/data/prospect.db > server/data/prospect.db.gz
ls -lh server/data/prospect.db.gz
```

Expected: `prospect.db.gz` régénéré (taille de l'ordre de 24-30 Mo, légèrement plus que les 23 Mo
précédents vu les nouvelles tables).

- [ ] **Step 2: Mettre à jour REPRISE.md**

Dans `/Users/loickferrucci/Desktop/immo-prospect/REPRISE.md`, déplacer le module « Potentiel de
secteur » de la section « CE QUI RESTE À FAIRE » vers « modules EN PRODUCTION », en résumant :
score 0-100 par commune (volume DVF 2021-2025, turn-over, concurrence SIRENE 68.31Z, indice 3D
INSEE, valeur), garde-fous (normaliser/fiabilité, classe A/B/C), vue carte choroplèthe. Noter les
hors-périmètre reportés (délai de vente, nécrologies, calibration régression).

- [ ] **Step 3: Lancer TOUTE la suite de tests une dernière fois**

```bash
for t in server/test/*.test.js; do echo "== $t =="; node "$t" || exit 1; done
```

Expected: chaque test affiche son `... OK`, aucun échec.

- [ ] **Step 4: Commit + push (déclenche le redéploiement Railway)**

```bash
git add server/data/prospect.db.gz REPRISE.md
git commit -m "$(printf 'feat(potentiel): donnees pre-calculees + maj REPRISE\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git push origin main
```

- [ ] **Step 5: Vérifier la prod**

Après redéploiement Railway, ouvrir https://immo-prospect-production.up.railway.app/potentiel,
se connecter, confirmer que la carte et le panneau fonctionnent en production (HTTP 200, carte
qui rend, panneau au-dessus de la carte).

---

## Notes de vérification finale (self-review du plan)

- **Couverture spec :** volume(T7) · turn-over(T7) · concurrence SIRENE(T5,T7) · indice 3D INSEE(T6,T7) ·
  valeur(T7) · normalisation rang-percentile→réutilise `normaliser()`(T2,T7) · garde-fou petits
  effectifs→`fiabilite()` + classe A/B/C(T1,T7) · maille commune+IRIS(T1,T6,T7) · poids ajustables
  en base(T1) · vue carte + détail facteurs(T9) · délai de vente exclu (non implémenté, conforme
  à la spec §8). ✅ Tous les points de la spec ont une tâche.
- **Adaptation assumée vs spec :** la spec mentionnait un « lissage bayésien » ; le codebase a déjà
  `fiabilite()` (atténuation log² des petits effectifs) qui remplit le même rôle. On réutilise
  l'existant (DRY) plutôt que d'introduire un 2e mécanisme. Le rattachement DVF→IRIS fin est
  reporté : en V1, l'agrégation se fait à la commune (maille principale demandée) ; `iris_potentiel`
  porte les proxys 3D par IRIS pour usage futur. À signaler au contrôleur entre Task 7 et Task 8.
- **Cohérence des noms :** `normaliser`/`fiabilite` (T2) utilisés tels quels en T7 ; clés
  `potentiel.*` définies en T1 et lues en T7 ; colonnes `score_volume…score_valeur` définies en T1,
  écrites en T7, lues en T9. ✅
```
