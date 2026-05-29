# Module 1 — Ciblage territorial — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le Module 1 d'ImmoProspect — une carte de l'Isère par quartiers (IRIS) avec un score de potentiel 0-100 (variantes Vente/Gestion), en mode démo (échantillon Meylan/Grenoble), prêt à recevoir les vraies données publiques via un script d'ingestion.

**Architecture :** Nouveau projet séparé `immo-prospect/` (hors du dépôt immo-relances), même base technique qu'ImmoRelances. Backend Express + SQLite calcule les scores à partir d'indicateurs par IRIS, exposés en GeoJSON. Front React + Vite + Tailwind + Leaflet affiche la carte colorée, avec bascule Vente/Gestion, panneau de détail, et page admin de pondérations. Données démo seedées ; script d'ingestion data-agnostique pour brancher DVF/INSEE réels ensuite.

**Tech Stack :** React 18 + Vite + TailwindCSS + Leaflet + react-leaflet, Node + Express + better-sqlite3 + JWT/bcrypt. Charte Le Quai réutilisée.

**Emplacement :** `/Users/loickferrucci/Desktop/immo-prospect/` (nouveau dépôt git).

**Note environnement :** pas d'accès Internet en dev → données démo codées en dur. Les fonds de carte Leaflet (tuiles OSM) nécessitent Internet **au runtime côté navigateur de l'utilisateur** (ça, ça marchera chez lui) ; en dev sans réseau, la carte peut afficher des tuiles grises mais les polygones/ scores restent testables.

---

## File Structure

```
immo-prospect/
├── package.json              ← scripts build/start (Railway-ready, calqué sur immo-relances)
├── .gitignore
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js          ← Express + sert le build React en prod
│       ├── database.js       ← schéma SQLite, seed démo, recalculerScores()
│       ├── auth.js           ← JWT (repris d'immo-relances, secret obligatoire en prod)
│       ├── ingest/
│       │   ├── seed-demo.js  ← ~15 IRIS Meylan/Grenoble plausibles
│       │   └── README.md     ← comment brancher les vrais fichiers
│       └── routes/
│           ├── authRoutes.js
│           ├── irisRoutes.js ← GET /iris (GeoJSON), GET /iris/:code
│           └── adminRoutes.js← GET/PUT /ponderations (recalcul)
└── client/
    ├── package.json
    ├── index.html
    ├── vite.config.js        ← proxy /api → :3002
    ├── tailwind.config.js    ← charte quai-* (repris)
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css         ← charte + import Leaflet CSS
        ├── utils/api.js
        ├── hooks/useAuth.jsx
        ├── components/
        │   ├── ui/Icon.jsx PageHeader.jsx   ← repris d'immo-relances
        │   ├── CarteIris.jsx     ← Leaflet : polygones colorés
        │   ├── ScoreLegend.jsx
        │   └── ZonePanel.jsx     ← détail indicateurs d'un quartier
        └── pages/
            ├── LoginPage.jsx
            ├── CartePage.jsx     ← écran principal
            └── AdminPage.jsx     ← pondérations
```

**Port backend :** 3002 (immo-relances utilise 3001, éviter le conflit).

---

## Phase 0 — Scaffolding

### Task 1 : Créer le projet et le dépôt git

**Files:**
- Create: `/Users/loickferrucci/Desktop/immo-prospect/.gitignore`
- Create: `/Users/loickferrucci/Desktop/immo-prospect/package.json`

- [ ] **Step 1: Créer l'arborescence et le dépôt**

```bash
mkdir -p /Users/loickferrucci/Desktop/immo-prospect/server/src/{routes,ingest}
mkdir -p /Users/loickferrucci/Desktop/immo-prospect/client/src/{components/ui,pages,hooks,utils}
cd /Users/loickferrucci/Desktop/immo-prospect
git init -q
```

- [ ] **Step 2: Créer `.gitignore`**

```
node_modules/
server/node_modules/
client/node_modules/
server/data/
client/dist/
data/sources/
.env
*.local
.DS_Store
```

- [ ] **Step 3: Créer `package.json` racine**

```json
{
  "name": "immo-prospect",
  "version": "1.0.0",
  "type": "commonjs",
  "engines": { "node": ">=18.0.0" },
  "scripts": {
    "build": "npm --prefix client install && npm --prefix client run build",
    "start": "NODE_ENV=production node server/src/index.js",
    "seed": "node server/src/ingest/seed-demo.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^12.10.0",
    "cors": "^2.8.5",
    "express": "^4.18.3",
    "jsonwebtoken": "^9.0.2"
  }
}
```

- [ ] **Step 4: Installer les deps serveur + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm install
git add -A && git commit -q -m "chore: scaffolding immo-prospect (racine + gitignore)"
```

Expected: install OK, commit créé.

---

### Task 2 : Backend — auth (repris d'immo-relances)

**Files:**
- Create: `immo-prospect/server/package.json`
- Create: `immo-prospect/server/src/auth.js`

- [ ] **Step 1: `server/package.json`**

```json
{
  "name": "immo-prospect-server",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": { "start": "node src/index.js", "dev": "node src/index.js" },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^12.10.0",
    "cors": "^2.8.5",
    "express": "^4.18.3",
    "jsonwebtoken": "^9.0.2"
  }
}
```

- [ ] **Step 2: `server/src/auth.js`** (secret obligatoire en prod, comme immo-relances corrigé)

```js
const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'immo-prospect-dev-secret');
if (!SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production. Définissez la variable d\'environnement JWT_SECRET.');
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '8h' });
}
function verifyToken(token) { return jwt.verify(token, SECRET); }
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try { req.user = verifyToken(auth.slice(7)); next(); }
  catch { res.status(401).json({ error: 'Token invalide' }); }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}
module.exports = { signToken, verifyToken, requireAuth, requireRole };
```

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/package.json server/src/auth.js
git commit -q -m "feat(server): auth JWT (secret obligatoire en prod)"
```

---

### Task 3 : Backend — base de données, score, seed démo

**Files:**
- Create: `immo-prospect/server/src/database.js`
- Create: `immo-prospect/server/src/ingest/seed-demo.js`

- [ ] **Step 1: `server/src/database.js`** — schéma + pondérations par défaut + recalcul + seed users

```js
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'prospect.db');
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL, prenom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','manager','admin')),
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS iris (
    code_iris TEXT PRIMARY KEY,
    nom_iris TEXT, code_commune TEXT, nom_commune TEXT,
    geometry TEXT,
    nb_logements INTEGER DEFAULT 0,
    ventes_an REAL DEFAULT 0,
    pct_anciennete REAL DEFAULT 0,
    pct_prop_ages REAL DEFAULT 0,
    pct_locatif REAL DEFAULT 0,
    pct_dpe_fg REAL DEFAULT 0,
    construction REAL DEFAULT 0,
    prix_m2_median REAL DEFAULT 0,
    score_vente INTEGER DEFAULT 0,
    score_gestion INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_iris_commune ON iris(code_commune);
  CREATE INDEX IF NOT EXISTS idx_iris_score_vente ON iris(score_vente DESC);
  CREATE INDEX IF NOT EXISTS idx_iris_score_gestion ON iris(score_gestion DESC);
  CREATE TABLE IF NOT EXISTS ponderations (
    cle TEXT PRIMARY KEY, valeur REAL NOT NULL
  );
`);

// Seed users démo
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@lequai-immobilier.com');
if (!existing) {
  const ins = db.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)');
  ins.run('Admin', 'Le Quai', 'admin@lequai-immobilier.com', bcrypt.hashSync('admin123', 10), 'admin');
  ins.run('Martin', 'Pierre', 'manager@lequai-immobilier.com', bcrypt.hashSync('manager123', 10), 'manager');
  ins.run('Dupont', 'Marie', 'agent@lequai-immobilier.com', bcrypt.hashSync('agent123', 10), 'agent');
}

// Pondérations par défaut (deux jeux : vente / gestion). Somme des poids = 1 par variante.
const DEFAULT_POIDS = {
  'vente.rotation': 0.25, 'vente.anciennete': 0.25, 'vente.prop_ages': 0.20,
  'vente.dpe_fg': 0.15, 'vente.prix_m2': 0.15,
  'vente.locatif': 0, 'vente.construction': 0,
  'gestion.locatif': 0.40, 'gestion.construction': 0.25, 'gestion.rotation': 0.20,
  'gestion.prix_m2': 0.15,
  'gestion.anciennete': 0, 'gestion.prop_ages': 0, 'gestion.dpe_fg': 0,
};
const insP = db.prepare('INSERT OR IGNORE INTO ponderations (cle, valeur) VALUES (?, ?)');
Object.entries(DEFAULT_POIDS).forEach(([k, v]) => insP.run(k, v));

// Normalisation min-max d'un indicateur sur l'ensemble des IRIS (0..100)
function normaliser(rows, champ) {
  const vals = rows.map(r => r[champ] ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const out = {};
  rows.forEach(r => { out[r.code_iris] = ((r[champ] ?? 0) - min) / span * 100; });
  return out;
}

// Recalcule score_vente et score_gestion pour TOUS les IRIS.
// Le taux de rotation est dérivé (ventes/an pour 1000 logements) au moment du calcul.
function recalculerScores() {
  const rows = db.prepare('SELECT * FROM iris').all();
  if (rows.length === 0) return;
  // champ dérivé : rotation pour mille logements
  rows.forEach(r => { r.ventes_an_pour_mille = r.nb_logements > 0 ? (r.ventes_an / r.nb_logements) * 1000 : 0; });

  const poids = {};
  db.prepare('SELECT cle, valeur FROM ponderations').all().forEach(r => poids[r.cle] = r.valeur);

  const N = {
    rotation: normaliser(rows, 'ventes_an_pour_mille'),
    anciennete: normaliser(rows, 'pct_anciennete'),
    prop_ages: normaliser(rows, 'pct_prop_ages'),
    locatif: normaliser(rows, 'pct_locatif'),
    dpe_fg: normaliser(rows, 'pct_dpe_fg'),
    construction: normaliser(rows, 'construction'),
    prix_m2: normaliser(rows, 'prix_m2_median'),
  };

  const upd = db.prepare("UPDATE iris SET score_vente = ?, score_gestion = ?, updated_at = datetime('now') WHERE code_iris = ?");
  const tx = db.transaction(() => {
    for (const r of rows) {
      const c = r.code_iris;
      const sv = Math.round(
        poids['vente.rotation']    * N.rotation[c]    +
        poids['vente.anciennete']  * N.anciennete[c]  +
        poids['vente.prop_ages']   * N.prop_ages[c]   +
        poids['vente.dpe_fg']      * N.dpe_fg[c]      +
        poids['vente.prix_m2']     * N.prix_m2[c]     +
        poids['vente.locatif']     * N.locatif[c]     +
        poids['vente.construction']* N.construction[c]
      );
      const sg = Math.round(
        poids['gestion.locatif']     * N.locatif[c]     +
        poids['gestion.construction']* N.construction[c]+
        poids['gestion.rotation']    * N.rotation[c]    +
        poids['gestion.prix_m2']     * N.prix_m2[c]     +
        poids['gestion.anciennete']  * N.anciennete[c]  +
        poids['gestion.prop_ages']   * N.prop_ages[c]   +
        poids['gestion.dpe_fg']      * N.dpe_fg[c]
      );
      upd.run(Math.max(0, Math.min(100, sv)), Math.max(0, Math.min(100, sg)), c);
    }
  });
  tx();
}

module.exports = { db, recalculerScores };
```

- [ ] **Step 2: `server/src/ingest/seed-demo.js`** — ~15 IRIS Meylan/Grenoble plausibles

```js
const { db, recalculerScores } = require('../database');

// Géométries simplifiées (petits carrés autour de coordonnées réelles Meylan/Grenoble).
// Suffisant pour la démo ; remplacé par les vrais contours IRIS à l'ingestion.
function carre(lng, lat, d = 0.004) {
  return JSON.stringify({ type: 'Polygon', coordinates: [[
    [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]
  ]]});
}

// [code, nom, commune, lng, lat, nb_log, ventes_an, %anc, %prop_ages, %locatif, %dpe_fg, constr, prix_m2]
const DEMO = [
  ['381850101','Béalières','Meylan',5.778,45.211, 1200, 38, 55, 28, 22, 12, 5, 4200],
  ['381850102','Haut-Meylan','Meylan',5.790,45.220, 900, 22, 62, 35, 14, 18, 2, 4800],
  ['381850103','Mi-Plaine','Meylan',5.770,45.205, 1500, 55, 40, 18, 38, 9, 12, 3900],
  ['381850104','Buclos','Meylan',5.762,45.208, 1100, 41, 48, 24, 30, 11, 7, 4100],
  ['382150101','Île Verte','Grenoble',5.735,45.197, 2200, 120, 35, 15, 52, 22, 3, 3200],
  ['382150102','Championnet','Grenoble',5.726,45.185, 2600, 145, 30, 12, 61, 25, 2, 3300],
  ['382150103','Berriat','Grenoble',5.712,45.190, 2400, 138, 28, 11, 64, 28, 8, 2900],
  ['382150104','Hyper-Centre','Grenoble',5.728,45.190, 3000, 175, 25, 10, 70, 30, 1, 3500],
  ['382150105','Notre-Dame','Grenoble',5.732,45.193, 1800, 95, 38, 16, 55, 20, 1, 3400],
  ['382150106','Eaux-Claires','Grenoble',5.705,45.180, 2100, 88, 42, 22, 48, 16, 6, 2700],
  ['381850105','Mail','Meylan',5.775,45.215, 800, 18, 65, 40, 12, 14, 1, 4600],
  ['382150107','Capuche','Grenoble',5.722,45.172, 1900, 76, 45, 26, 44, 13, 4, 2800],
  ['382150108','Villeneuve','Grenoble',5.700,45.160, 3200, 90, 50, 20, 66, 35, 2, 2100],
  ['381850106','Carronnerie','Meylan',5.795,45.205, 700, 30, 44, 20, 26, 10, 9, 4000],
  ['382150109','Bajatière','Grenoble',5.745,45.175, 2000, 84, 47, 25, 50, 17, 3, 2950],
];

const ins = db.prepare(`INSERT OR REPLACE INTO iris
  (code_iris, nom_iris, code_commune, nom_commune, geometry, nb_logements, ventes_an,
   pct_anciennete, pct_prop_ages, pct_locatif, pct_dpe_fg, construction, prix_m2_median)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const tx = db.transaction(() => {
  for (const d of DEMO) {
    const [code, nom, commune, lng, lat, nbl, ventes, anc, ages, loc, dpe, constr, prix] = d;
    const codeCommune = code.slice(0, 5);
    ins.run(code, nom, codeCommune, commune, carre(lng, lat), nbl, ventes, anc, ages, loc, dpe, constr, prix);
  }
});
tx();
recalculerScores();
console.log(`Seed démo : ${DEMO.length} IRIS insérés et scorés.`);
process.exit(0);
```

- [ ] **Step 3: Lancer le seed et vérifier les scores**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node server/src/ingest/seed-demo.js
node -e "const {db}=require('./server/src/database'); const r=db.prepare('SELECT nom_iris, score_vente, score_gestion FROM iris ORDER BY score_vente DESC LIMIT 5').all(); console.table(r);"
```

Expected: 15 IRIS insérés ; un tableau avec des scores 0-100 variés (pas tous identiques, pas tous 0).

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/database.js server/src/ingest/seed-demo.js
git commit -q -m "feat(server): schéma IRIS, calcul de score vente/gestion, seed démo Meylan/Grenoble"
```

---

### Task 4 : Test du calcul de score (vérifie la mécanique)

**Files:**
- Create temporaire: `immo-prospect/test-score.js`

- [ ] **Step 1: Écrire le test**

```js
process.env.DB_PATH = require('path').join(require('os').tmpdir(), 'prospect-test-' + Date.now() + '.db');
process.env.JWT_SECRET = 'test';
const { db, recalculerScores } = require('./server/src/database');

// Insère 3 IRIS contrastés
const ins = db.prepare(`INSERT INTO iris (code_iris, nom_iris, code_commune, nom_commune, nb_logements, ventes_an, pct_anciennete, pct_prop_ages, pct_locatif, pct_dpe_fg, construction, prix_m2_median) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
ins.run('A','A','38001','A', 1000, 10, 80, 50, 5,  5,  1, 5000); // fort vente (ancienneté, prop âgés)
ins.run('B','B','38001','B', 1000, 90, 10, 5,  80, 30, 20, 2000); // fort gestion (locatif, construction)
ins.run('C','C','38001','C', 1000, 50, 45, 25, 40, 15, 10, 3000); // moyen
recalculerScores();

const A = db.prepare('SELECT * FROM iris WHERE code_iris=?').get('A');
const B = db.prepare('SELECT * FROM iris WHERE code_iris=?').get('B');
let ok = true;
if (!(A.score_vente > A.score_gestion)) { console.error('ECHEC: A devrait avoir score_vente > score_gestion', A.score_vente, A.score_gestion); ok = false; }
if (!(B.score_gestion > B.score_vente)) { console.error('ECHEC: B devrait avoir score_gestion > score_vente', B.score_vente, B.score_gestion); ok = false; }
[A,B].forEach(x => { if (x.score_vente<0||x.score_vente>100||x.score_gestion<0||x.score_gestion>100){console.error('ECHEC: score hors bornes', x.code_iris); ok=false;} });
console.log(ok ? 'OK: scores cohérents (A=vente, B=gestion, bornés 0-100)' : 'ECHEC');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Lancer, vérifier OK**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && node test-score.js
```

Expected: `OK: scores cohérents (A=vente, B=gestion, bornés 0-100)`

- [ ] **Step 3: Supprimer le test temporaire et commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
rm test-score.js
git add -A && git commit -q -m "test: vérification mécanique du score (sans fichier résiduel)" --allow-empty
```

---

### Task 5 : Backend — routes (auth, iris GeoJSON, admin pondérations) + index

**Files:**
- Create: `server/src/routes/authRoutes.js`, `irisRoutes.js`, `adminRoutes.js`
- Create: `server/src/index.js`

- [ ] **Step 1: `authRoutes.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { signToken, requireAuth } = require('../auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND actif = 1').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  res.json({ token: signToken(user), user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role } });
});
router.get('/me', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, nom, prenom, email, role FROM users WHERE id = ?').get(req.user.id));
});
module.exports = router;
```

- [ ] **Step 2: `irisRoutes.js`** (retourne du GeoJSON FeatureCollection)

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

// Liste GeoJSON. ?variante=vente|gestion choisit quel score est exposé comme 'score'.
router.get('/', (req, res) => {
  const variante = req.query.variante === 'gestion' ? 'gestion' : 'vente';
  const commune = req.query.commune || '';
  const where = commune ? 'WHERE code_commune = ?' : '';
  const rows = db.prepare(`SELECT * FROM iris ${where}`).all(...(commune ? [commune] : []));
  const features = rows.map(r => {
    let geometry = null;
    try { geometry = JSON.parse(r.geometry); } catch { geometry = null; }
    return {
      type: 'Feature',
      geometry,
      properties: {
        code_iris: r.code_iris, nom_iris: r.nom_iris, nom_commune: r.nom_commune,
        score: variante === 'gestion' ? r.score_gestion : r.score_vente,
        score_vente: r.score_vente, score_gestion: r.score_gestion,
      },
    };
  });
  res.json({ type: 'FeatureCollection', features });
});

// Détail d'un quartier (tous indicateurs)
router.get('/:code', (req, res) => {
  const r = db.prepare('SELECT * FROM iris WHERE code_iris = ?').get(req.params.code);
  if (!r) return res.status(404).json({ error: 'IRIS non trouvé' });
  const { geometry, ...rest } = r;
  res.json(rest);
});
module.exports = router;
```

- [ ] **Step 3: `adminRoutes.js`** (pondérations + recalcul)

```js
const express = require('express');
const { db, recalculerScores } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const router = express.Router();
router.use(requireAuth, requireRole('manager', 'admin'));

router.get('/ponderations', (req, res) => {
  const out = {};
  db.prepare('SELECT cle, valeur FROM ponderations').all().forEach(r => out[r.cle] = r.valeur);
  res.json(out);
});

router.put('/ponderations', (req, res) => {
  const upd = db.prepare('INSERT OR REPLACE INTO ponderations (cle, valeur) VALUES (?, ?)');
  const tx = db.transaction((obj) => {
    Object.entries(obj).forEach(([k, v]) => upd.run(k, Number(v) || 0));
  });
  tx(req.body);
  recalculerScores();
  res.json({ ok: true });
});
module.exports = router;
```

- [ ] **Step 4: `index.js`** (port 3002)

```js
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3002;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: isProd ? false : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/iris', require('./routes/irisRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

if (isProd) {
  const clientBuild = path.join(process.cwd(), 'client', 'dist');
  app.use(express.static(clientBuild));
  app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}
app.listen(PORT, '0.0.0.0', () => console.log(`ImmoProspect — serveur sur http://0.0.0.0:${PORT}`));
```

- [ ] **Step 5: Tester l'API**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node server/src/ingest/seed-demo.js
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/p.log 2>&1 &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@lequai-immobilier.com","password":"admin123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "GeoJSON (nb features):"
curl -s "http://localhost:3002/api/iris?variante=vente" -H "Authorization: Bearer $TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(d.features.length, 'features ; ex score:', d.features[0].properties.score)"
pkill -f "server/src/index.js"
```

Expected: `15 features ; ex score: <nombre 0-100>`.

- [ ] **Step 6: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes server/src/index.js
git commit -q -m "feat(server): routes auth, iris (GeoJSON), admin (pondérations) + serveur :3002"
```

---

## Phase 1 — Frontend

### Task 6 : Scaffolding client (Vite + Tailwind + charte + Leaflet)

**Files:**
- Create: `client/package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.jsx`, `src/index.css`

- [ ] **Step 1: `client/package.json`**

```json
{
  "name": "immo-prospect-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "axios": "^1.6.8",
    "leaflet": "^1.9.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-leaflet": "^4.2.1",
    "react-hot-toast": "^2.4.1",
    "lucide-react": "^0.379.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.6"
  }
}
```

NOTE implémenteur : si `lucide-react@^0.379.0` n'est pas dispo hors-ligne, utilise la version qui s'installe (comme dans immo-relances). Idem react-leaflet : si la résolution échoue, fixe une version compatible React 18.

- [ ] **Step 2: `vite.config.js`** (proxy vers 3002)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3002' } }
})
```

- [ ] **Step 3: `tailwind.config.js`** (charte quai-*, reprise d'immo-relances)

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { quai: {
      navy:'#0D0D2B', navymd:'#1a1a4e', navylt:'#2d2d6b',
      gold:'#C9A96E', goldlt:'#e8c98a', light:'#F7F6F3',
      border:'#E2DDD6', text:'#1C1C1C', muted:'#6B6660',
    }},
    fontFamily: { sans:['Montserrat','Inter','system-ui','sans-serif'], display:['Playfair Display','Georgia','serif'] },
  }},
  plugins: []
}
```

- [ ] **Step 4: `postcss.config.js`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 5: `index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ImmoProspect — Le Quai de l'Immobilier</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 6: `src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
```

- [ ] **Step 7: `src/index.css`** (charte + Leaflet CSS)

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600&display=swap');
@import 'leaflet/dist/leaflet.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base { body { @apply bg-quai-light text-quai-text font-sans; } }
@layer components {
  .btn { @apply px-4 py-2 rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 text-sm; }
  .btn-primary { @apply btn bg-quai-navy text-white hover:bg-quai-navymd focus:ring-quai-navy; }
  .btn-secondary { @apply btn bg-white text-quai-text border border-quai-border hover:bg-quai-light; }
  .input { @apply w-full px-3 py-2 border border-quai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-quai-navy/40 bg-white text-sm; }
  .card { @apply bg-white rounded-xl shadow-sm border border-quai-border p-4; }
}
:focus-visible { outline: 2px solid #0D0D2B; outline-offset: 2px; }
```

- [ ] **Step 8: Installer + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect/client && npm install
cd /Users/loickferrucci/Desktop/immo-prospect
git add client/
git commit -q -m "chore(client): scaffolding Vite + Tailwind charte + Leaflet"
```

Expected: install OK.

---

### Task 7 : Client — auth, api, composants UI repris

**Files:**
- Create: `client/src/utils/api.js`, `hooks/useAuth.jsx`, `components/ui/Icon.jsx`, `components/ui/PageHeader.jsx`

- [ ] **Step 1: `utils/api.js`** (identique à immo-relances)

```js
import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/' }
  return Promise.reject(err)
})
export default api
```

- [ ] **Step 2: `hooks/useAuth.jsx`** (identique à immo-relances)

```jsx
import { createContext, useContext, useState } from 'react'
import api from '../utils/api'
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')) } catch { return null } })
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); return data.user
  }
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null) }
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 3: `components/ui/Icon.jsx`** (repris d'immo-relances avec le fix capitalisation + alias)

```jsx
import { icons } from 'lucide-react'
const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 }
const ALIASES = { 'x-circle': 'CircleX', 'alert-triangle': 'TriangleAlert', 'check-circle-2': 'CircleCheckBig' }
export default function Icon({ name, size = 'md', label, className = '', strokeWidth = 1.75, ...rest }) {
  const aliased = ALIASES[name] || name
  const pascal = aliased.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  const LucideIcon = icons[pascal] || icons.Circle
  const px = SIZES[size] || size
  return <LucideIcon width={px} height={px} strokeWidth={strokeWidth} className={className}
    aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} {...rest} />
}
```

- [ ] **Step 4: `components/ui/PageHeader.jsx`** (repris)

```jsx
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-display font-semibold text-quai-navy">{title}</h1>
        <div className="mt-1.5 w-10 h-0.5 bg-quai-gold" />
        {subtitle && <p className="text-quai-muted text-sm mt-2">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-3 items-center flex-wrap">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src
git commit -q -m "feat(client): api, auth, composants UI repris (charte)"
```

Expected: build OK.

---

### Task 8 : Client — LoginPage

**Files:**
- Create: `client/src/pages/LoginPage.jsx`

- [ ] **Step 1: `LoginPage.jsx`** (panneau gauche marine + logo, repris simplifié)

```jsx
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try { await login(form.email, form.password) }
    catch (err) {
      if (err.response) toast.error(err.response.data?.error || 'Identifiants incorrects')
      else toast.error('Serveur injoignable. Vérifiez que l\'application est démarrée.')
    } finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-quai-navy flex-col items-center justify-center p-12">
        <div className="text-center">
          <img src="https://img.netty.fr/logo/company55382byt/2/logo_web.png" alt="Le Quai de l'Immobilier" className="h-20 w-auto object-contain mx-auto mb-8" />
          <p className="text-white/60 text-sm italic max-w-xs mx-auto">"Cibler les bons secteurs, au bon moment."</p>
          <div className="mt-8 w-12 h-0.5 bg-quai-gold mx-auto" />
          <p className="text-quai-gold text-xs mt-4 tracking-widest uppercase">Prospection territoriale</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 bg-quai-light">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-semibold text-quai-navy">Connexion</h2>
            <div className="mt-2 w-10 h-0.5 bg-quai-gold" />
            <p className="text-quai-muted text-sm mt-3">Accédez à votre espace de prospection</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-quai-navy uppercase tracking-wider mb-1.5">Adresse email</label>
              <input type="email" required autoFocus className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="prenom.nom@lequai-immobilier.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-quai-navy uppercase tracking-wider mb-1.5">Mot de passe</label>
              <input type="password" required className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Connexion…' : 'Se connecter'}</button>
          </form>
          <div className="mt-8 p-4 bg-white rounded-xl border border-quai-border text-xs text-quai-muted">
            <p className="font-semibold text-quai-navy mb-2">Comptes de démonstration</p>
            <p>admin@lequai-immobilier.com / admin123</p>
            <p>manager@lequai-immobilier.com / manager123</p>
            <p>agent@lequai-immobilier.com / agent123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/pages/LoginPage.jsx
git commit -q -m "feat(client): page de connexion (charte Le Quai)"
```

Expected: build OK.

---

### Task 9 : Client — carte (CarteIris, ScoreLegend, ZonePanel)

**Files:**
- Create: `client/src/components/CarteIris.jsx`, `ScoreLegend.jsx`, `ZonePanel.jsx`

- [ ] **Step 1: `ScoreLegend.jsx`** (échelle de couleur)

```jsx
// Couleur du froid (faible) au chaud (fort potentiel), cohérente charte (navy → gold → rouge)
export function couleurScore(score) {
  if (score >= 80) return '#8B1E1E'      // très fort = rouge profond
  if (score >= 60) return '#C9A96E'      // fort = or
  if (score >= 40) return '#2d2d6b'      // moyen = navy clair
  if (score >= 20) return '#6B6660'      // faible = gris
  return '#C9C4BC'                       // très faible = gris clair
}
export default function ScoreLegend() {
  const paliers = [[80,'Très fort'],[60,'Fort'],[40,'Moyen'],[20,'Faible'],[0,'Très faible']]
  return (
    <div className="card absolute bottom-4 right-4 z-[1000] text-xs">
      <div className="font-semibold text-quai-navy mb-2">Potentiel</div>
      {paliers.map(([s,l]) => (
        <div key={s} className="flex items-center gap-2 mb-1">
          <span className="w-4 h-4 rounded" style={{ background: couleurScore(s) }} />
          <span className="text-quai-muted">{l}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: `ZonePanel.jsx`** (détail d'un quartier sélectionné)

```jsx
import Icon from './ui/Icon'

const INDICATEURS = [
  ['pct_anciennete', 'Ancienneté de détention'],
  ['pct_prop_ages', 'Propriétaires âgés'],
  ['pct_locatif', 'Part de locatif'],
  ['pct_dpe_fg', 'Passoires thermiques (F/G)'],
  ['prix_m2_median', 'Prix médian €/m²'],
]
export default function ZonePanel({ detail, variante, onClose }) {
  if (!detail) return null
  const score = variante === 'gestion' ? detail.score_gestion : detail.score_vente
  return (
    <div className="card absolute top-4 left-4 z-[1000] w-72">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-display font-semibold text-quai-navy">{detail.nom_iris}</div>
          <div className="text-xs text-quai-muted">{detail.nom_commune}</div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy"><Icon name="x" size="sm" /></button>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-bold text-quai-navy">{score}</span>
        <span className="text-xs text-quai-muted">/ 100 · potentiel {variante}</span>
      </div>
      <div className="space-y-1.5">
        {INDICATEURS.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="text-quai-muted">{label}</span>
            <span className="font-medium text-quai-navy tabular-nums">
              {k === 'prix_m2_median' ? `${Math.round(detail[k]).toLocaleString('fr')} €` : `${Math.round(detail[k])}${k.startsWith('pct') ? ' %' : ''}`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-quai-muted leading-snug">Score agrégé par quartier (données publiques). Aide à la priorisation, sans donnée nominative.</p>
    </div>
  )
}
```

- [ ] **Step 3: `CarteIris.jsx`** (Leaflet via react-leaflet)

```jsx
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { couleurScore } from './ScoreLegend'

export default function CarteIris({ geojson, onSelect }) {
  const style = (feature) => ({
    fillColor: couleurScore(feature.properties.score),
    weight: 1, color: '#fff', fillOpacity: 0.65,
  })
  const onEach = (feature, layer) => {
    layer.on({ click: () => onSelect(feature.properties.code_iris) })
    layer.bindTooltip(`${feature.properties.nom_iris} — ${feature.properties.score}/100`, { sticky: true })
  }
  return (
    <MapContainer center={[45.20, 5.75]} zoom={12} className="h-full w-full" style={{ background: '#F7F6F3' }}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {geojson && <GeoJSON key={JSON.stringify(geojson.features.map(f => f.properties.score))} data={geojson} style={style} onEachFeature={onEach} />}
    </MapContainer>
  )
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/components
git commit -q -m "feat(client): carte Leaflet, légende couleur, panneau détail quartier"
```

Expected: build OK.

---

### Task 10 : Client — CartePage (écran principal) + App + Layout simple

**Files:**
- Create: `client/src/pages/CartePage.jsx`, `client/src/App.jsx`

- [ ] **Step 1: `CartePage.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import CarteIris from '../components/CarteIris'
import ScoreLegend from '../components/ScoreLegend'
import ZonePanel from '../components/ZonePanel'
import Icon from '../components/ui/Icon'
import { useAuth } from '../hooks/useAuth'

export default function CartePage({ onAdmin }) {
  const { user, logout } = useAuth()
  const [variante, setVariante] = useState('vente')
  const [geojson, setGeojson] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    api.get(`/iris?variante=${variante}`).then(r => setGeojson(r.data))
  }, [variante])

  const select = async (code) => {
    const r = await api.get(`/iris/${code}`)
    setDetail(r.data)
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-quai-navy text-white px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="https://img.netty.fr/logo/company55382byt/2/logo_web.png" alt="Le Quai" className="h-7 w-auto" />
          <span className="font-display text-sm">Prospection territoriale</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white/10 rounded-lg p-0.5 flex text-xs">
            <button onClick={() => setVariante('vente')} className={`px-3 py-1.5 rounded-md transition ${variante==='vente'?'bg-quai-gold text-quai-navy font-semibold':'text-white/80'}`}>Vente</button>
            <button onClick={() => setVariante('gestion')} className={`px-3 py-1.5 rounded-md transition ${variante==='gestion'?'bg-quai-gold text-quai-navy font-semibold':'text-white/80'}`}>Gestion</button>
          </div>
          {['manager','admin'].includes(user?.role) && (
            <button onClick={onAdmin} className="text-white/70 hover:text-white p-1.5" aria-label="Administration"><Icon name="settings" size="md" /></button>
          )}
          <button onClick={logout} className="text-white/70 hover:text-white p-1.5" aria-label="Déconnexion"><Icon name="log-out" size="md" /></button>
        </div>
      </header>
      <div className="flex-1 relative">
        <CarteIris geojson={geojson} onSelect={select} />
        <ScoreLegend />
        {detail && <ZonePanel detail={detail} variante={variante} onClose={() => setDetail(null)} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `App.jsx`**

```jsx
import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import CartePage from './pages/CartePage'
import AdminPage from './pages/AdminPage'

function Inner() {
  const { user } = useAuth()
  const [page, setPage] = useState('carte')
  if (!user) return <LoginPage />
  if (page === 'admin') return <AdminPage onBack={() => setPage('carte')} />
  return <CartePage onAdmin={() => setPage('admin')} />
}
export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '12px', background: '#0D0D2B', color: '#fff', fontSize: '14px' } }} />
      <Inner />
    </AuthProvider>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/pages/CartePage.jsx client/src/App.jsx
git commit -q -m "feat(client): écran carte principal + bascule vente/gestion + App"
```

Expected: build OK.

---

### Task 11 : Client — AdminPage (pondérations)

**Files:**
- Create: `client/src/pages/AdminPage.jsx`

- [ ] **Step 1: `AdminPage.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import Icon from '../components/ui/Icon'

const CHAMPS = {
  vente: [['vente.rotation','Rotation'],['vente.anciennete','Ancienneté'],['vente.prop_ages','Propriétaires âgés'],['vente.dpe_fg','Passoires F/G'],['vente.prix_m2','Prix €/m²'],['vente.locatif','Locatif'],['vente.construction','Construction']],
  gestion: [['gestion.locatif','Locatif'],['gestion.construction','Construction'],['gestion.rotation','Rotation'],['gestion.prix_m2','Prix €/m²'],['gestion.anciennete','Ancienneté'],['gestion.prop_ages','Propriétaires âgés'],['gestion.dpe_fg','Passoires F/G']],
}
export default function AdminPage({ onBack }) {
  const [poids, setPoids] = useState({})
  useEffect(() => { api.get('/admin/ponderations').then(r => setPoids(r.data)) }, [])
  const save = async () => { await api.put('/admin/ponderations', poids); toast.success('Pondérations mises à jour, scores recalculés') }
  const set = (k, v) => setPoids(p => ({ ...p, [k]: v }))
  return (
    <div className="min-h-screen bg-quai-light p-6">
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Pondérations du score" subtitle="Ajustez l'importance de chaque indicateur. Les scores sont recalculés à l'enregistrement.">
          <button onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5"><Icon name="arrow-left" size="sm" /> Retour à la carte</button>
        </PageHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {['vente','gestion'].map(variante => (
            <div key={variante} className="card">
              <h2 className="font-display font-semibold text-quai-navy mb-3 capitalize">Potentiel {variante}</h2>
              {CHAMPS[variante].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-sm text-quai-muted">{label}</label>
                  <input type="number" step="0.05" min="0" max="1" className="input w-24"
                    value={poids[k] ?? 0} onChange={e => set(k, Number(e.target.value))} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <button onClick={save} className="btn-primary mt-6">Enregistrer et recalculer</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/pages/AdminPage.jsx
git commit -q -m "feat(client): page admin pondérations (recalcul scores)"
```

Expected: build OK.

---

## Phase 2 — Intégration & vérification

### Task 12 : Vérification de bout en bout + doc d'ingestion

**Files:**
- Create: `server/src/ingest/README.md`
- Create: `README.md` (racine)

- [ ] **Step 1: `server/src/ingest/README.md`** (comment brancher les vrais fichiers)

```markdown
# Ingestion des données réelles (Isère)

Le mode démo (`npm run seed`) insère ~15 IRIS Meylan/Grenoble.
Pour les vraies données, voir la procédure : `docs/.../module1-procedure-data.md` (dépôt immo-relances).

Étapes :
1. Déposer les fichiers dans `data/sources/` (dvf/, iris/, ...).
2. Écrire/compléter le script d'ingestion qui : lit les CSV/GeoJSON, filtre l'Isère,
   agrège par IRIS, remplit la table `iris`, puis appelle `recalculerScores()`.
3. La structure de la table `iris` et l'API ne changent pas : la carte fonctionne à l'identique.
```

- [ ] **Step 2: `README.md` racine**

```markdown
# ImmoProspect — Module 1 : Ciblage territorial

Outil de prospection immobilière territoriale (Le Quai de l'Immobilier).
Carte de l'Isère par quartiers (IRIS) avec score de potentiel Vente / Gestion.

## Démarrage (dev)
```bash
npm install
npm run seed           # insère les données démo Meylan/Grenoble
# Terminal 1 : serveur
JWT_SECRET=dev npm --prefix server run dev
# Terminal 2 : client
npm --prefix client run dev   # http://localhost:5173
```

## Production (Railway)
- `npm run build` puis `npm start` (sert le build React).
- Variables : `NODE_ENV=production`, `JWT_SECRET`.

## Comptes démo
admin@lequai-immobilier.com / admin123 · manager / manager123 · agent / agent123

## Données
Mode démo par défaut. Pour les vraies données Isère, voir `server/src/ingest/README.md`.
```

- [ ] **Step 3: Vérification complète (build prod + parcours API)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm run build 2>&1 | tail -2
node server/src/ingest/seed-demo.js
JWT_SECRET=verif PORT=3002 npm start >/tmp/pp.log 2>&1 &
sleep 2.5
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "iris vente:"; curl -s "http://localhost:3002/api/iris?variante=vente" -H "Authorization: Bearer $TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.features.length,'features')"
echo "modif pondération + recalcul:"; curl -s -X PUT http://localhost:3002/api/admin/ponderations -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"vente.rotation":0.5}' | head -c 50
echo ""; curl -s http://localhost:3002/ | grep -o "<title>[^<]*</title>"
pkill -f "server/src/index.js"
```

Expected: build OK ; `15 features` ; `{"ok":true}` ; `<title>ImmoProspect…`.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add README.md server/src/ingest/README.md
git commit -q -m "docs: README projet + guide d'ingestion des données réelles"
```

---

## Definition of Done (rappel spec §8)
- [x] Carte ~15 quartiers Meylan/Grenoble colorés par score
- [x] Bascule Vente/Gestion change les couleurs
- [x] Clic quartier → détail indicateurs
- [x] Admin : modifier poids recalcule les scores
- [x] Auth 3 rôles
- [x] Charte Le Quai
- [x] Script d'ingestion prêt (démo testée ; doc pour le réel)
- [x] Build + run vérifiés

## Hors périmètre (rappel)
Suivi terrain (Module 2), apporteurs (Module 3), pilotage avancé (Module 4), vraies données (script d'ingestion à compléter quand les fichiers sont fournis), déploiement Railway (à faire après validation).
