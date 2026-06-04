# Module ImmoRadar — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet « Radar » à ImmoProspect qui suit les biens en vente en Isère (via une API de flux, indépendamment du fournisseur), détecte nouveautés/baisses/retraits, calcule le délai de dénonciation, et les envoie en cibles de boîtage dans Terrain.

**Architecture:** 3 couches étanches — un **adaptateur** (seul à connaître Fluximmo) traduit le format fournisseur vers un **format normalisé maison** ; un **moteur** (ignore le fournisseur) stocke/compare/détecte ; un **affichage** (onglet Radar + pont Terrain). Tables pré-stockées SQLite. La clé API vit dans une variable d'environnement.

**Tech Stack:** Node + Express + better-sqlite3 ; React + Vite + Tailwind + Leaflet. Vérification : tests scripts node (`node server/test/*.test.js`) + vérif live navigateur. API Fluximmo validée en réel (clé d'essai).

**Répertoire :** `/Users/loickferrucci/Desktop/immo-prospect/`
**Commit :** terminer chaque message par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Contexte réutilisé (lire avant de commencer)

- **`server/src/database.js`** exporte `{ db, recalculerScores, calculerCommission, normaliser, fiabilite, enregistrerSource }`.
  Tables créées dans un gros `db.exec(\`...\`)`. Migrations idempotentes via `PRAGMA table_info` plus bas.
  `enregistrerSource(cle, libelle, periode, note)` trace une source dans `sources_data`.
- **Pattern de route protégée** : `server/src/routes/potentielRoutes.js` (`const { requireAuth } = require('../auth'); router.use(requireAuth);`). Montée dans `server/src/index.js` via `app.use('/api/xxx', require('./routes/xxxRoutes'))`.
- **Pattern d'ingestion** : `server/src/ingest/ingest-dvf2025.js` (téléchargement https + transaction + stats). `package.json` scripts.
- **Pont Ciblage→Terrain (à RÉUTILISER)** : `POST /api/secteurs` body `{ nom, iris_codes:[...] }` → renvoie `{ id }`. Côté front, `CartePage.jsx` appelle `api.post('/secteurs', {...})` puis `onOpenSecteur(r.data.id)`. `App.jsx` passe `onOpenSecteur={(id)=>{ setSecteurActif(id); setPage('terrain') }}`.
- **Trouver l'IRIS d'un point lat/lon** : on a 427 824 adresses géocodées avec `code_iris`. Pour un bien, on prend le `code_iris` de l'ADRESSE LA PLUS PROCHE (pas de point-in-polygon nécessaire).
- **Score potentiel commune** : table `commune_potentiel(code_commune, score)`.
- **Frontend** : `client/src/utils/api.js` (axios, `import api from '../utils/api'`, baseURL `/api`, token auto). `import Icon from './ui/Icon'` (`<Icon name="kebab" size="sm|md|lg" />`, Lucide). Routeur par ÉTAT dans `App.jsx` (`page` + cascade de `if`). Onglets dans `AppHeader.jsx` (tableau `TABS` `{id,label,icon,page}`) + `BottomTabBar` mobile. Cartes : pattern `CartePotentiel.jsx`/`CarteIris.jsx`. Panneaux flottants desktop / bottom sheet mobile (ZonePanel/PotentielPanel) en `z-[1400] md:z-[...]`.
- Charte : quai-navy `#0D0D2B` / quai-gold `#C9A96E`, Playfair (titres), Montserrat (corps), icônes Lucide, **AUCUN emoji**.
- **Clé API d'essai (dev)** : `trial_default_loick-ferrucci_1bce0d7b-c79e-4014-b1a6-f4666ee12eb7` (temporaire, 1 semaine). À mettre dans la variable d'env `FLUXIMMO_API_KEY`.

### Format normalisé d'annonce (LE contrat entre les couches)
```js
{
  ref_source: String, source: String, type_vendeur: 'particulier'|'agence'|'reseau',
  nom_vendeur: String|null, siren_vendeur: String|null,
  type_bien: 'maison'|'appartement'|'programme'|'immeuble'|'autre',
  prix: Number|null, surface: Number|null, pieces: Number|null,
  lat: Number|null, lon: Number|null, code_insee: String|null, commune: String|null,
  code_postal: String|null, adresse_texte: String|null,
  url: String|null, titre: String|null, description: String|null, photos: [String],
  date_premiere_pub: String|null, date_derniere_vue: String|null, en_ligne: 1
}
```

### Mapping Fluximmo → normalisé (vérifié sur l'API réelle)
- `flxId` → `ref_source` ; `source.website` → `source` ; `source.url` → `url`
- `seller.type`: SELLER_TYPE_AGENCY→`agence`, SELLER_TYPE_NETWORK→`reseau`, sinon si `isPro===false`→`particulier`, sinon `agence`
- `seller.name`→`nom_vendeur` ; `seller.siren`→`siren_vendeur`
- `type`: CLASS_HOUSE→`maison`, CLASS_FLAT→`appartement`, CLASS_PROGRAM→`programme`, CLASS_BUILDING→`immeuble`, autre→`autre`
- `currentPrice.value`→`prix` ; `habitation.surface.total`→`surface` ; `habitation.roomCount`→`pieces`
- `location.locationCoordinate.location` = `[lon, lat]` → `lon`,`lat` ; `location.inseeCode`→`code_insee` ; `location.city`→`commune` ; `location.postalCode`→`code_postal`
- `firstSeenAt`→`date_premiere_pub` ; `lastSeenAt`→`date_derniere_vue` ; `isOnline`→`en_ligne`
- `title`→`titre` ; `description`→`description` ; `medias.images[].url`→`photos`

---

## Structure des fichiers

**Créés :**
- `server/src/radar/normalize.js` — type de bien/vendeur helpers + validation du format normalisé (pur, testable).
- `server/src/radar/fluximmo-adapter.js` — SEUL fichier qui connaît Fluximmo : appelle l'API, mappe → normalisé.
- `server/src/radar/radar-sync.js` — moteur : orchestre l'adaptateur, compare en base, détecte évolutions, écrit.
- `server/src/routes/radarRoutes.js` — API `/api/radar`.
- `client/src/pages/RadarPage.jsx`, `client/src/components/CarteRadar.jsx`, `client/src/components/RadarPanel.jsx`.

**Modifiés :**
- `server/src/database.js` (tables radar), `server/src/index.js` (route), `package.json` (script `radar:sync`),
  `client/src/components/AppHeader.jsx` (onglet), `client/src/App.jsx` (page + pont Terrain).

---

## Task 1 : Schéma DB (tables radar)

**Files:** Modify `server/src/database.js` · Test `server/test/radar-schema.test.js`

- [ ] **Step 1 : Test (échoue)**

Créer `server/test/radar-schema.test.js` :
```js
const assert = require('assert');
const { db } = require('../src/database');
const has = (t) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
assert.ok(has('radar_annonces'), 'radar_annonces manquante');
assert.ok(has('radar_prix_historique'), 'radar_prix_historique manquante');
const cols = db.prepare("PRAGMA table_info(radar_annonces)").all().map(c=>c.name);
['ref_source','source','type_vendeur','type_bien','prix','lat','lon','code_insee','commune','url','date_premiere_pub','en_ligne','nouveau','score_potentiel_commune','photos'].forEach(c=>assert.ok(cols.includes(c), 'colonne '+c+' manquante'));
console.log('radar-schema.test OK');
```
Run: `node server/test/radar-schema.test.js` → FAIL (table manquante).

- [ ] **Step 2 : Ajouter les tables**

Dans `server/src/database.js`, à la fin du gros `db.exec(\`...\`)` (avant la backtick fermante) :
```sql
  CREATE TABLE IF NOT EXISTS radar_annonces (
    ref_source TEXT NOT NULL, source TEXT NOT NULL,
    type_vendeur TEXT, nom_vendeur TEXT, siren_vendeur TEXT,
    type_bien TEXT, prix REAL, surface REAL, pieces INTEGER,
    lat REAL, lon REAL, code_insee TEXT, commune TEXT, code_postal TEXT, adresse_texte TEXT,
    url TEXT, titre TEXT, description TEXT, photos TEXT,
    date_premiere_pub TEXT, date_derniere_vue TEXT,
    en_ligne INTEGER DEFAULT 1, nouveau INTEGER DEFAULT 1,
    score_potentiel_commune INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (ref_source, source)
  );
  CREATE INDEX IF NOT EXISTS idx_radar_insee ON radar_annonces(code_insee);
  CREATE INDEX IF NOT EXISTS idx_radar_vendeur ON radar_annonces(type_vendeur);
  CREATE INDEX IF NOT EXISTS idx_radar_enligne ON radar_annonces(en_ligne);
  CREATE TABLE IF NOT EXISTS radar_prix_historique (
    ref_source TEXT NOT NULL, source TEXT NOT NULL, prix REAL, date TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_radar_prixh ON radar_prix_historique(ref_source, source);
```

- [ ] **Step 3 : Test (passe)** — `node server/test/radar-schema.test.js` → `radar-schema.test OK`.

- [ ] **Step 4 : Commit**
```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/database.js server/test/radar-schema.test.js
git commit -m "$(printf 'feat(radar): schema DB tables radar_annonces + prix_historique\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2 : Helpers de normalisation (pur, testable sans réseau)

**Files:** Create `server/src/radar/normalize.js` · Test `server/test/radar-normalize.test.js`

- [ ] **Step 1 : Test (échoue)**

Créer `server/test/radar-normalize.test.js` :
```js
const assert = require('assert');
const { typeVendeur, typeBien, fromFluximmo } = require('../src/radar/normalize');

assert.strictEqual(typeVendeur({seller:{type:'SELLER_TYPE_AGENCY'},isPro:true}), 'agence');
assert.strictEqual(typeVendeur({seller:{type:'SELLER_TYPE_NETWORK'},isPro:true}), 'reseau');
assert.strictEqual(typeVendeur({seller:{type:'SELLER_TYPE_UNKNOWN'},isPro:false}), 'particulier');
assert.strictEqual(typeBien({type:'CLASS_HOUSE'}), 'maison');
assert.strictEqual(typeBien({type:'CLASS_FLAT'}), 'appartement');
assert.strictEqual(typeBien({type:'CLASS_PROGRAM'}), 'programme');

const raw = {
  flxId:'abc', source:{website:'leboncoin.fr',url:'http://x'},
  seller:{type:'SELLER_TYPE_AGENCY',name:'AG',siren:'123'}, isPro:true,
  type:'CLASS_HOUSE', currentPrice:{value:285000}, habitation:{surface:{total:120},roomCount:5},
  location:{city:'CHABONS',inseeCode:'38065',postalCode:'38690',locationCoordinate:{location:[5.42,45.44]}},
  firstSeenAt:'2026-06-04T12:00:00Z', lastSeenAt:'2026-06-04T12:00:00Z', isOnline:true,
  title:'Maison', description:'desc', medias:{images:[{url:'p1'},{url:'p2'}]}
};
const n = fromFluximmo(raw);
assert.strictEqual(n.ref_source,'abc'); assert.strictEqual(n.source,'leboncoin.fr');
assert.strictEqual(n.type_vendeur,'agence'); assert.strictEqual(n.type_bien,'maison');
assert.strictEqual(n.prix,285000); assert.strictEqual(n.lat,45.44); assert.strictEqual(n.lon,5.42);
assert.strictEqual(n.code_insee,'38065'); assert.deepStrictEqual(n.photos,['p1','p2']);
assert.strictEqual(n.en_ligne,1);
console.log('radar-normalize.test OK');
```
Run → FAIL (module absent).

- [ ] **Step 2 : Implémenter `server/src/radar/normalize.js`**
```js
// Helpers PURS de normalisation d'une annonce vers le format maison.
// Aucun appel réseau ici : 100% testable.

function typeVendeur(raw) {
  const t = raw.seller && raw.seller.type;
  if (t === 'SELLER_TYPE_AGENCY') return 'agence';
  if (t === 'SELLER_TYPE_NETWORK') return 'reseau';
  if (raw.isPro === false) return 'particulier';
  return 'agence';
}

const BIENS = { CLASS_HOUSE:'maison', CLASS_FLAT:'appartement', CLASS_PROGRAM:'programme', CLASS_BUILDING:'immeuble' };
function typeBien(raw) { return BIENS[raw.type] || 'autre'; }

// Mappe une annonce brute Fluximmo vers le format normalisé.
function fromFluximmo(raw) {
  const coord = raw.location && raw.location.locationCoordinate && raw.location.locationCoordinate.location;
  const lon = Array.isArray(coord) ? coord[0] : null;
  const lat = Array.isArray(coord) ? coord[1] : null;
  const photos = (raw.medias && Array.isArray(raw.medias.images))
    ? raw.medias.images.map(im => im.url).filter(Boolean) : [];
  return {
    ref_source: String(raw.flxId || ''),
    source: (raw.source && raw.source.website) || 'inconnu',
    type_vendeur: typeVendeur(raw),
    nom_vendeur: (raw.seller && raw.seller.name) || null,
    siren_vendeur: (raw.seller && raw.seller.siren) || null,
    type_bien: typeBien(raw),
    prix: (raw.currentPrice && raw.currentPrice.value) ?? null,
    surface: (raw.habitation && raw.habitation.surface && raw.habitation.surface.total) ?? null,
    pieces: (raw.habitation && raw.habitation.roomCount) ?? null,
    lat, lon,
    code_insee: (raw.location && raw.location.inseeCode) || null,
    commune: (raw.location && raw.location.city) || null,
    code_postal: (raw.location && raw.location.postalCode) || null,
    adresse_texte: null,
    url: (raw.source && raw.source.url) || null,
    titre: raw.title || null,
    description: raw.description || null,
    photos,
    date_premiere_pub: raw.firstSeenAt || null,
    date_derniere_vue: raw.lastSeenAt || null,
    en_ligne: raw.isOnline === false ? 0 : 1,
  };
}

module.exports = { typeVendeur, typeBien, fromFluximmo };
```

- [ ] **Step 3 : Test (passe)** → `radar-normalize.test OK`.

- [ ] **Step 4 : Commit**
```bash
git add server/src/radar/normalize.js server/test/radar-normalize.test.js
git commit -m "$(printf 'feat(radar): helpers de normalisation (format maison, pur testable)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3 : Adaptateur Fluximmo (appel API + pagination)

**Files:** Create `server/src/radar/fluximmo-adapter.js` · Test `server/test/radar-adapter.test.js`

- [ ] **Step 1 : Implémenter `server/src/radar/fluximmo-adapter.js`**

(Pas de test réseau auto — la clé d'essai expire et le réseau n'est pas garanti en CI. On teste la construction de requête + le parsing d'une réponse fixture à l'étape 2.)
```js
// SEUL fichier qui connaît Fluximmo. Expose recupererIsere() -> [annonces normalisées].
const https = require('https');
const { fromFluximmo } = require('./normalize');

const API_URL = 'https://api.fluximmo.io/v2/protected/adverts/search';

function postJson(url, apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(data), 'x-api-key':apiKey },
    }, (res) => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode+': '+out.slice(0,200)));
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

// Construit le body de recherche pour une page (Isère, ventes, en ligne).
function buildBody(searchAfterHash) {
  const body = {
    size: 100, sortBy: 'LAST_SEEN_AT', orderBy: 'DESC',
    search: { filterAd: { location:{department:'38'}, offer:[{type:'OFFER_BUY'}], isOnline:true }, fullTexts:[], keywords:[] },
  };
  if (searchAfterHash) body.searchAfterHash = searchAfterHash;
  return body;
}

// Récupère TOUTES les annonces Isère en vente (pagination complète). apiKey requis.
async function recupererIsere(apiKey, { maxPages = 200 } = {}) {
  if (!apiKey) throw new Error('FLUXIMMO_API_KEY manquante');
  const out = [];
  let hash = null, page = 0;
  do {
    const j = await postJson(API_URL, apiKey, buildBody(hash));
    const items = (j.data && j.data.items) || [];
    for (const it of items) out.push(fromFluximmo(it));
    hash = (j.data && j.data.searchAfterHash) || null;
    page++;
    if (!items.length) break;
  } while (hash && page < maxPages);
  return out;
}

module.exports = { recupererIsere, buildBody, postJson };
```

- [ ] **Step 2 : Test du body (échoue puis passe)**

Créer `server/test/radar-adapter.test.js` :
```js
const assert = require('assert');
const { buildBody } = require('../src/radar/fluximmo-adapter');
const b = buildBody();
assert.strictEqual(b.search.filterAd.location.department, '38');
assert.strictEqual(b.search.filterAd.offer[0].type, 'OFFER_BUY');
assert.strictEqual(b.search.filterAd.isOnline, true);
const b2 = buildBody('xyz');
assert.strictEqual(b2.searchAfterHash, 'xyz');
console.log('radar-adapter.test OK');
```
Run → après implémentation : `radar-adapter.test OK`.

- [ ] **Step 3 : Vérif réseau MANUELLE (si clé dispo)**

```bash
FLUXIMMO_API_KEY="trial_default_loick-ferrucci_1bce0d7b-c79e-4014-b1a6-f4666ee12eb7" node -e "
require('./server/src/radar/fluximmo-adapter').recupererIsere(process.env.FLUXIMMO_API_KEY,{maxPages:1}).then(a=>{console.log('annonces récupérées:',a.length); console.log('exemple:',JSON.stringify(a[0],null,0).slice(0,300));}).catch(e=>console.error('ERREUR:',e.message));
"
```
Attendu : un nombre d'annonces > 0 et un exemple au format normalisé. Si la clé a expiré : erreur HTTP claire (acceptable, on continue avec les fixtures).

- [ ] **Step 4 : Commit**
```bash
git add server/src/radar/fluximmo-adapter.js server/test/radar-adapter.test.js
git commit -m "$(printf 'feat(radar): adaptateur Fluximmo (appel API + pagination Isere)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4 : Moteur de synchro (compare, détecte, écrit)

**Files:** Create `server/src/radar/radar-sync.js` · Modify `package.json` · Test `server/test/radar-sync.test.js`

- [ ] **Step 1 : Implémenter `server/src/radar/radar-sync.js`**

Le moteur reçoit une LISTE d'annonces normalisées (injectable pour les tests, ou via l'adaptateur en prod) et la
réconcilie avec la base. Sépare la logique (testable) de la récupération réseau.
```js
const { db, enregistrerSource } = require('../database');

// Trouve le code_iris de l'adresse la plus proche d'un point (pour le pont Terrain).
function irisLePlusProche(lat, lon) {
  if (lat == null || lon == null) return null;
  const r = db.prepare(`SELECT code_iris FROM adresses
    WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
    ORDER BY (lat-?)*(lat-?)+(lon-?)*(lon-?) ASC LIMIT 1`)
    .get(lat-0.02, lat+0.02, lon-0.02, lon+0.02, lat, lat, lon, lon);
  return r ? r.code_iris : null;
}

// Réconcilie une liste d'annonces normalisées avec la base.
// Retourne un récap { total, nouveaux, baisses, retires }.
function synchroniser(annonces) {
  const scoreCommune = {};
  db.prepare('SELECT code_commune, score FROM commune_potentiel').all().forEach(r => scoreCommune[r.code_commune] = r.score);

  const existing = db.prepare('SELECT ref_source, source, prix, en_ligne FROM radar_annonces').all();
  const seen = new Set();         // clés vues dans CETTE passe
  const known = new Map();        // clé -> {prix, en_ligne}
  for (const e of existing) known.set(e.source+'|'+e.ref_source, e);

  const upsert = db.prepare(`INSERT INTO radar_annonces
    (ref_source,source,type_vendeur,nom_vendeur,siren_vendeur,type_bien,prix,surface,pieces,lat,lon,code_insee,commune,code_postal,adresse_texte,url,titre,description,photos,date_premiere_pub,date_derniere_vue,en_ligne,nouveau,score_potentiel_commune,updated_at)
    VALUES (@ref_source,@source,@type_vendeur,@nom_vendeur,@siren_vendeur,@type_bien,@prix,@surface,@pieces,@lat,@lon,@code_insee,@commune,@code_postal,@adresse_texte,@url,@titre,@description,@photos,@date_premiere_pub,@date_derniere_vue,1,@nouveau,@score,datetime('now'))
    ON CONFLICT(ref_source,source) DO UPDATE SET
      prix=excluded.prix, surface=excluded.surface, type_vendeur=excluded.type_vendeur,
      nom_vendeur=excluded.nom_vendeur, code_insee=excluded.code_insee, commune=excluded.commune,
      url=excluded.url, titre=excluded.titre, description=excluded.description, photos=excluded.photos,
      date_derniere_vue=excluded.date_derniere_vue, en_ligne=1, nouveau=0,
      score_potentiel_commune=excluded.score, updated_at=datetime('now')`);
  const insPrix = db.prepare('INSERT INTO radar_prix_historique (ref_source,source,prix) VALUES (?,?,?)');

  let nouveaux=0, baisses=0;
  const tx = db.transaction(() => {
    for (const a of annonces) {
      const key = a.source+'|'+a.ref_source;
      seen.add(key);
      const prev = known.get(key);
      if (!prev) nouveaux++;
      // baisse de prix
      if (prev && a.prix != null && prev.prix != null && a.prix !== prev.prix) {
        insPrix.run(a.ref_source, a.source, a.prix);
        if (a.prix < prev.prix) baisses++;
      }
      upsert.run({
        ...a,
        photos: JSON.stringify(a.photos || []),
        nouveau: prev ? 0 : 1,
        score: scoreCommune[a.code_insee] || 0,
      });
    }
    // retraits : tout ce qui était en_ligne et n'a PAS été revu dans cette passe complète
    const offline = db.prepare("UPDATE radar_annonces SET en_ligne=0, updated_at=datetime('now') WHERE source||'|'||ref_source = ? AND en_ligne=1");
    var retires = 0;
    for (const e of existing) {
      const key = e.source+'|'+e.ref_source;
      if (e.en_ligne === 1 && !seen.has(key)) { offline.run(key); retires++; }
    }
  });
  tx();
  // recompter retires hors transaction (var de closure non accessible)
  const enLigneTot = db.prepare('SELECT COUNT(*) c FROM radar_annonces WHERE en_ligne=1').get().c;

  if (typeof enregistrerSource === 'function') {
    enregistrerSource('radar', 'Annonces en vente (flux externe)', new Date().toISOString().slice(0,10),
      'Biens en vente Isere (particuliers + agences) via API de flux. Action : prospection physique (boitage/flyer).');
  }
  return { total: annonces.length, nouveaux, baisses, enLigneTot };
}

module.exports = { synchroniser, irisLePlusProche };
```
Note : la variable `retires` calculée dans la transaction n'est pas remontée (limitation closure) ; le récap
expose `enLigneTot` (nombre d'annonces en ligne après synchro), suffisant pour les stats. Le marquage offline est bien effectué.

- [ ] **Step 2 : Script de prod `radar-sync-run.js` (récupère via l'adaptateur puis synchronise)**

Créer `server/src/ingest/radar-sync-run.js` :
```js
const { recupererIsere } = require('../radar/fluximmo-adapter');
const { synchroniser } = require('../radar/radar-sync');

async function main() {
  const key = process.env.FLUXIMMO_API_KEY;
  if (!key) { console.error('FLUXIMMO_API_KEY manquante — sync impossible. (L\\'app fonctionne en mode dégradé.)'); process.exit(1); }
  console.log('Radar : récupération des annonces Isère…');
  let annonces;
  try { annonces = await recupererIsere(key); }
  catch (e) { console.error('Échec récupération:', e.message); process.exit(1); }
  console.log('  '+annonces.length+' annonces récupérées. Synchronisation…');
  const r = synchroniser(annonces);
  console.log(`Radar synchronisé : ${r.total} traitées, ${r.nouveaux} nouvelles, ${r.baisses} baisses de prix, ${r.enLigneTot} en ligne.`);
  process.exit(0);
}
main();
```

Dans `package.json` scripts, ajouter : `"radar:sync": "node server/src/ingest/radar-sync-run.js",`

- [ ] **Step 3 : Test du moteur (2 passes simulées)**

Créer `server/test/radar-sync.test.js` :
```js
const assert = require('assert');
const { db } = require('../src/database');
const { synchroniser } = require('../src/radar/radar-sync');

// nettoyer
db.prepare('DELETE FROM radar_annonces').run();
db.prepare('DELETE FROM radar_prix_historique').run();

const a = (ref, prix, online=1) => ({
  ref_source:ref, source:'test', type_vendeur:'agence', nom_vendeur:'AG', siren_vendeur:null,
  type_bien:'maison', prix, surface:100, pieces:4, lat:45.18, lon:5.72, code_insee:'38185',
  commune:'GRENOBLE', code_postal:'38000', adresse_texte:null, url:'u', titre:'t', description:'d',
  photos:['p'], date_premiere_pub:'2026-06-01', date_derniere_vue:'2026-06-04', en_ligne:online,
});

// Passe 1 : 2 annonces neuves
let r = synchroniser([a('1',300000), a('2',250000)]);
assert.strictEqual(r.nouveaux, 2, 'passe1 nouveaux');
assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM radar_annonces WHERE nouveau=1").get().c, 2);

// Passe 2 : annonce 1 baisse de prix, annonce 2 absente (retirée), annonce 3 nouvelle
r = synchroniser([a('1',280000), a('3',400000)]);
assert.strictEqual(r.nouveaux, 1, 'passe2 nouveaux (la 3)');
assert.strictEqual(r.baisses, 1, 'passe2 baisses (la 1)');
const a2 = db.prepare("SELECT en_ligne FROM radar_annonces WHERE ref_source='2' AND source='test'").get();
assert.strictEqual(a2.en_ligne, 0, 'annonce 2 retirée');
const ph = db.prepare("SELECT COUNT(*) c FROM radar_prix_historique WHERE ref_source='1'").get().c;
assert.ok(ph >= 1, 'historique prix annonce 1');
// nettoyage final
db.prepare('DELETE FROM radar_annonces').run();
db.prepare('DELETE FROM radar_prix_historique').run();
console.log('radar-sync.test OK');
```
Run → `radar-sync.test OK`.

- [ ] **Step 4 : Commit**
```bash
git add server/src/radar/radar-sync.js server/src/ingest/radar-sync-run.js package.json server/test/radar-sync.test.js
git commit -m "$(printf 'feat(radar): moteur de synchro (nouveautes, baisses, retraits) + script\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5 : Route API `/api/radar`

**Files:** Create `server/src/routes/radarRoutes.js` · Modify `server/src/index.js` · Test `server/test/radar-api.test.js`

- [ ] **Step 1 : Implémenter `server/src/routes/radarRoutes.js`**
```js
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const { irisLePlusProche } = require('../radar/radar-sync');
const router = express.Router();
router.use(requireAuth);

// Calcule l'ancienneté (jours) et la date de dénonciation théorique (premiere_pub + 105j).
function enrichir(r) {
  let anciennete = null, dateDenonciation = null;
  if (r.date_premiere_pub) {
    const d0 = new Date(r.date_premiere_pub);
    anciennete = Math.max(0, Math.floor((Date.now() - d0.getTime()) / 86400000));
    dateDenonciation = new Date(d0.getTime() + 105*86400000).toISOString().slice(0,10);
  }
  return { ...r, anciennete, date_denonciation: dateDenonciation,
           denoncable: anciennete != null && anciennete >= 105 };
}

// GET /api/radar — liste filtrable. Filtres query : vendeur, insee, type_bien, prix_min, prix_max, anciennete_min, statut.
router.get('/', (req, res) => {
  const q = req.query;
  const where = ['en_ligne = 1']; const params = [];
  if (q.inclure_retires === '1') where.length = 0; // tout
  if (q.vendeur) { where.push('type_vendeur = ?'); params.push(q.vendeur); }
  if (q.insee) { where.push('code_insee = ?'); params.push(q.insee); }
  if (q.type_bien) { where.push('type_bien = ?'); params.push(q.type_bien); }
  if (q.prix_min) { where.push('prix >= ?'); params.push(Number(q.prix_min)); }
  if (q.prix_max) { where.push('prix <= ?'); params.push(Number(q.prix_max)); }
  if (q.nouveau === '1') { where.push('nouveau = 1'); }
  const cols = q.light === '1'
    ? 'ref_source,source,type_vendeur,nom_vendeur,type_bien,prix,surface,pieces,lat,lon,code_insee,commune,date_premiere_pub,nouveau,score_potentiel_commune,url'
    : '*';
  const sql = `SELECT ${cols} FROM radar_annonces ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY date_derniere_vue DESC LIMIT 2000`;
  let rows = db.prepare(sql).all(...params).map(enrichir);
  if (q.anciennete_min) rows = rows.filter(r => (r.anciennete||0) >= Number(q.anciennete_min));
  if (q.statut === 'denoncable') rows = rows.filter(r => r.denoncable);
  res.json(rows);
});

// GET /api/radar/:source/:ref — détail + historique prix + iris (pour le pont Terrain)
router.get('/:source/:ref', (req, res) => {
  const r = db.prepare('SELECT * FROM radar_annonces WHERE source=? AND ref_source=?').get(req.params.source, req.params.ref);
  if (!r) return res.status(404).json({ error: 'Annonce non trouvée' });
  const e = enrichir(r);
  e.photos = (() => { try { return JSON.parse(r.photos||'[]'); } catch { return []; } })();
  e.prix_historique = db.prepare('SELECT prix, date FROM radar_prix_historique WHERE source=? AND ref_source=? ORDER BY date').all(req.params.source, req.params.ref);
  e.code_iris = irisLePlusProche(r.lat, r.lon);
  res.json(e);
});

module.exports = router;
```

Dans `server/src/index.js`, à côté des autres routes : `app.use('/api/radar', require('./routes/radarRoutes'));`

- [ ] **Step 2 : Test API**

Créer `server/test/radar-api.test.js` (monte le routeur sur serveur éphémère, comme `api-potentiel.test.js`).
Lire `server/test/api-potentiel.test.js` pour copier la mécanique (token jwt `{id,role,email}`, `JWT_SECRET`,
serveur port 0). Avant les requêtes, insérer 2 annonces de test directement en base :
```js
const assert = require('assert'); const http=require('http'); const express=require('express'); const jwt=require('jsonwebtoken');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev';
const { db } = require('../src/database');
db.prepare('DELETE FROM radar_annonces').run();
const ins = db.prepare(`INSERT INTO radar_annonces (ref_source,source,type_vendeur,type_bien,prix,lat,lon,code_insee,commune,date_premiere_pub,en_ligne,nouveau) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`);
ins.run('1','test','particulier','maison',300000,45.18,5.72,'38185','GRENOBLE','2026-01-01',1); // ancien -> dénonçable
ins.run('2','test','agence','appartement',200000,45.18,5.72,'38185','GRENOBLE','2026-06-01',0);
const router = require('../src/routes/radarRoutes');
const app = express(); app.use('/api/radar', router);
const server = app.listen(0); const port = server.address().port;
const token = jwt.sign({id:1,role:'admin',email:'a@a.fr'}, process.env.JWT_SECRET);
function get(p){return new Promise(r=>{http.request({host:'127.0.0.1',port,path:p,headers:{Authorization:'Bearer '+token}},res=>{let d='';res.on('data',x=>d+=x);res.on('end',()=>r({status:res.statusCode,body:JSON.parse(d||'[]')}))}).end();});}
(async()=>{
  const list = await get('/api/radar');
  assert.strictEqual(list.status,200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some(x=>x.ref_source==='1'), 'annonce 1 présente');
  assert.ok(!list.body.some(x=>x.ref_source==='2'), 'annonce 2 retirée non listée par défaut');
  const filt = await get('/api/radar?vendeur=particulier');
  assert.ok(filt.body.every(x=>x.type_vendeur==='particulier'), 'filtre vendeur');
  const det = await get('/api/radar/test/1');
  assert.strictEqual(det.status,200); assert.strictEqual(det.body.denoncable, true, 'annonce ancienne dénonçable');
  const ko = await get('/api/radar/test/999'); assert.strictEqual(ko.status,404);
  db.prepare('DELETE FROM radar_annonces').run();
  console.log('radar-api.test OK'); server.close(); process.exit(0);
})();
```
Run: `JWT_SECRET=dev node server/test/radar-api.test.js` → `radar-api.test OK`.

- [ ] **Step 3 : Commit**
```bash
git add server/src/routes/radarRoutes.js server/src/index.js server/test/radar-api.test.js
git commit -m "$(printf 'feat(radar): route API /api/radar (liste filtrable + detail + denonciation)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6 : Frontend — onglet Radar (carte + liste + panneau + pont Terrain)

**Files:** Create `client/src/pages/RadarPage.jsx`, `client/src/components/CarteRadar.jsx`, `client/src/components/RadarPanel.jsx` · Modify `client/src/components/AppHeader.jsx`, `client/src/App.jsx`

- [ ] **Step 1 : Lire les patterns**

Lire `client/src/components/CartePotentiel.jsx` (carte Leaflet + style + clic), `client/src/components/PotentielPanel.jsx`
(panneau responsive bottom sheet `z-[1400] md:z-[1100]`), `client/src/pages/PotentielPage.jsx` (layout),
`client/src/components/AppHeader.jsx` (TABS), `client/src/App.jsx` (routeur état + pont onOpenSecteur),
`client/src/pages/CartePage.jsx` (mécanisme `choisirSecteur` → POST /secteurs → onOpenSecteur).

- [ ] **Step 2 : `CarteRadar.jsx`**

Copier la structure de `CartePotentiel.jsx`. Source : `api.get('/radar?light=1')`. Chaque annonce = un **CircleMarker**
Leaflet (pas un polygone) à `[lat, lon]`, couleur selon `type_vendeur` : particulier `#8B1E1E` (rouge quai), agence
`#C9A96E` (gold), reseau `#2d2d6b` (navy clair). Tooltip : `commune — type_bien — prix €`. Au clic : `onSelect(source, ref)`.
Centre `[45.18, 5.72]` zoom 9. Ignorer les annonces sans lat/lon.

- [ ] **Step 3 : `RadarPanel.jsx`**

Copier le pattern responsive de `PotentielPanel.jsx` (`fixed inset-x-0 bottom-0 z-[1400] ... md:absolute md:top-4 md:right-4 md:w-80 md:z-[1100]`).
Charge `api.get('/radar/'+source+'/'+ref)`. Affiche : titre, prix (+ historique si `prix_historique.length>1`), type_bien,
surface, pièces, vendeur (nom si agence/reseau), commune, **ancienneté** ("en ligne depuis X j"), **date_denonciation**
+ badge si `denoncable`, **score potentiel commune**, lien `url` (ouvre l'annonce), 1re photo si présente. Icônes Lucide,
AUCUN emoji. Bouton **« Prospecter ce secteur »** : appelle `onProspecter(detail)` (passe `code_iris` + `commune`).

- [ ] **Step 4 : `RadarPage.jsx`**

Layout comme `PotentielPage` : `AppHeader active="radar"` + conteneur carte. Filtres en haut (select type_vendeur,
input commune/insee, select type_bien, prix min/max, checkbox "nouveautés", "dénonçables"). Recharge `/radar?...` selon
filtres. `CarteRadar` + `RadarPanel`. Reçoit `onOpenSecteur` (prop depuis App). Le bouton « Prospecter ce secteur » du
panneau appelle un handler `prospecter(detail)` :
```js
const prospecter = async (d) => {
  if (!d.code_iris) { toast.error('Pas de quartier identifié pour ce bien'); return; }
  try {
    const r = await api.post('/secteurs', { nom: d.commune + ' (radar)', iris_codes: [d.code_iris] });
    toast.success('Secteur créé pour prospection');
    onOpenSecteur?.(r.data.id);
  } catch (e) {
    toast.error(e.response?.status===403 ? 'Seul un manager peut créer un secteur' : 'Erreur création secteur');
  }
};
```

- [ ] **Step 5 : Brancher onglet + route**

Dans `AppHeader.jsx`, ajouter au tableau `TABS` (après 'potentiel' par ex.) :
`{ id: 'radar', label: 'Radar', icon: 'radar', page: 'radar' },`
(si l'icône 'radar' n'existe pas dans Lucide, utiliser `'satellite-dish'` ou `'git-pull-request-arrow'` — vérifier
au build ; fallback `'search'`.)
Dans `App.jsx` : importer `RadarPage`, et avant le `return <CartePage…>` final ajouter :
`if (page === 'radar') return <RadarPage onAdmin={() => setPage('admin')} onNav={setPage} onOpenSecteur={(id)=>{ setSecteurActif(id); setPage('terrain') }} />`

- [ ] **Step 6 : Build**

Run: `npm --prefix client run build` → OK (corriger imports/nom d'icône si erreur).

- [ ] **Step 7 : Vérif live navigateur (OBLIGATOIRE)**

Insérer quelques annonces de test en base (ou lancer `radar:sync` si la clé marche), lancer backend + preview,
se connecter, aller sur Radar. Vérifier : la carte affiche des marqueurs colorés par vendeur ; un clic ouvre le
panneau AU-DESSUS de la carte (z-index) ; les filtres rechargent la liste ; le bouton « Prospecter ce secteur »
crée le secteur et bascule sur Terrain. Aucun emoji, charte respectée. Tester aussi à 375 px (bottom sheet + barre basse).

- [ ] **Step 8 : Commit**
```bash
git add client/src/pages/RadarPage.jsx client/src/components/CarteRadar.jsx client/src/components/RadarPanel.jsx client/src/components/AppHeader.jsx client/src/App.jsx
git commit -m "$(printf 'feat(radar): onglet Radar (carte + filtres + panneau + pont Terrain)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7 : Finalisation (config clé, sync réelle, déploiement)

**Files:** Modify `REPRISE.md`, `server/data/prospect.db.gz`

- [ ] **Step 1 : Synchro réelle (si clé valide) + recompression**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
FLUXIMMO_API_KEY="trial_default_loick-ferrucci_1bce0d7b-c79e-4014-b1a6-f4666ee12eb7" npm run radar:sync
```
Attendu : « Radar synchronisé : N traitées, … en ligne. » Si la clé a expiré, sauter (la table reste vide, l'app
fonctionne en mode dégradé). Puis checkpoint + recompression :
```bash
node -e "const {db}=require('./server/src/database'); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"
gzip -9 -c server/data/prospect.db > server/data/prospect.db.gz
```

- [ ] **Step 2 : Suite de tests complète + build**
```bash
for t in server/test/*.test.js; do JWT_SECRET=dev node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done
npm --prefix client run build
```
Expected : aucun FAIL, build OK.

- [ ] **Step 3 : Documenter la clé en prod**

Dans `REPRISE.md`, ajouter : ImmoRadar livré ; pour activer la sync en prod, définir la variable d'environnement
**`FLUXIMMO_API_KEY`** sur Railway (clé pérenne ; la clé d'essai est temporaire). `npm run radar:sync` à lancer
périodiquement. L'app fonctionne sans clé (mode dégradé : affiche le dernier état stocké).

- [ ] **Step 4 : Commit + merge + push (déclenche Railway)**
```bash
git add REPRISE.md server/data/prospect.db.gz
git commit -m "$(printf 'feat(radar): donnees + maj REPRISE\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git checkout main && git merge --no-ff <branche> -m "feat: module ImmoRadar (veille biens en vente, pont Terrain)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
⚠️ Ne PAS committer la clé API en dur. Sur Railway, ajouter `FLUXIMMO_API_KEY` dans les variables d'environnement
(jamais dans le code/git).

- [ ] **Step 5 : Vérifier la prod**

Après redéploiement, ouvrir https://immo-prospect-production.up.railway.app , onglet Radar. Sans clé prod, la liste
peut être vide (normal). Confirmer que l'onglet rend sans erreur.

---

## Self-review du plan

- **Couverture spec** : 3 couches (adaptateur T3 / moteur T4 / affichage T6) ✅ · format normalisé (T2, contrat) ✅ ·
  mapping Fluximmo (T2) ✅ · tables 3 (T1, + radar_prix_historique) ✅ · suivi nouveautés/baisses/retraits (T4) ✅ ·
  ancienneté + délai dénonciation 105j (T5 enrichir) ✅ · croisement score commune (T4 synchroniser) ✅ · API filtrable
  + détail 404 (T5) ✅ · onglet + carte + panneau + filtres (T6) ✅ · pont Terrain via POST /secteurs (T6) ✅ ·
  clé en variable d'env + mode dégradé (T4 run, T7) ✅ · responsive (T6 step 7) ✅ · sources_data 'radar' (T4) ✅.
- **Placeholders** : Task 6 demande de "lire les patterns puis adapter" (frontend dépend du markup réel) mais fournit
  les classes z-index, le mapping couleurs, le handler `prospecter` complet, et la source des données. Acceptable.
- **Cohérence noms** : format normalisé identique partout (ref_source/source/type_vendeur/...) ; `fromFluximmo`,
  `recupererIsere`, `synchroniser`, `irisLePlusProche`, `enrichir` cohérents entre T2→T6. Clé primaire
  `(ref_source, source)` partout. ✅
- **Nuance honnête** (spec §3) : le délai de dénonciation s'affiche pour toute annonce ancienne sans prétendre que
  c'est un exclusif — implémenté comme calcul neutre (`date_premiere_pub + 105j`), l'UI le présente comme indicatif (T6).
