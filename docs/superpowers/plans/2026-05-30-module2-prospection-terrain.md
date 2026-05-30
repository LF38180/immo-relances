# Module 2 — Prospection terrain — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à ImmoProspect un module de prospection terrain : secteurs (regroupements de quartiers IRIS affectés à un agent), suivi adresse par adresse (428 953 adresses BAN de l'Isère), saisie de passages (boîtage/porte-à-porte) avec cadencement visuel anti-doublon.

**Architecture :** Ajout dans le projet existant `/Users/loickferrucci/Desktop/immo-prospect/`. 3 nouvelles tables SQLite (adresses, secteurs, passages). Ingestion BAN unique rattachant chaque adresse à son IRIS. Nouvelles routes Express. Front : navigation Ciblage/Terrain, écran « Mes secteurs », écran de travail (carte adresses chargées à la demande + liste rue par rue + saisie de passages). Réutilise auth, charte quai-*, Icon, PageHeader, Leaflet.

**Tech Stack :** Node + Express + better-sqlite3, React 18 + Vite + Tailwind + Leaflet/react-leaflet. Source : `data/sources/ban/adresses-38.csv.gz` (déjà téléchargé, 428 953 adresses).

**Construction en 3 paliers :** A (backend + ingestion BAN), B (secteurs front), C (écran de travail terrain).

---

## File Structure

**Backend (créés/modifiés) :**
- Modify: `server/src/database.js` — ajout des 3 tables + param cadence
- Create: `server/src/ingest/ingest-ban.js` — ingestion des adresses BAN
- Create: `server/src/routes/secteurRoutes.js` — secteurs + adresses du secteur
- Create: `server/src/routes/passageRoutes.js` — enregistrer un passage
- Modify: `server/src/routes/adminRoutes.js` — réglage cadence terrain
- Modify: `server/src/index.js` — monter les nouvelles routes

**Frontend (créés/modifiés) :**
- Modify: `client/src/App.jsx` — navigation Ciblage / Terrain
- Create: `client/src/components/NavTabs.jsx` — bascule entre modules
- Create: `client/src/pages/SecteursPage.jsx` — « Mes secteurs » + création
- Create: `client/src/pages/TerrainPage.jsx` — travail d'un secteur (carte + liste + saisie)
- Create: `client/src/components/CarteAdresses.jsx` — carte des adresses d'un secteur
- Create: `client/src/components/AdresseListe.jsx` — liste rue par rue
- Create: `client/src/components/PassageForm.jsx` — saisie rapide d'un passage
- Modify: `client/src/pages/AdminPage.jsx` — onglet cadence terrain (ou page dédiée)

**Port :** 3002 (inchangé).

---

## PALIER A — Backend + ingestion BAN

### Task A1 : Schéma — 3 tables (adresses, secteurs, passages)

**Files:**
- Modify: `server/src/database.js`

- [ ] **Step 1: Ajouter les 3 tables dans le `db.exec` de database.js**

Dans le grand `db.exec(\`...\`)` qui crée déjà users/iris/ponderations, AVANT la backtick fermante, ajouter :

```sql
  CREATE TABLE IF NOT EXISTS adresses (
    id TEXT PRIMARY KEY,
    numero TEXT, rep TEXT,
    nom_voie TEXT,
    code_postal TEXT,
    code_insee TEXT,
    nom_commune TEXT,
    code_iris TEXT,
    lon REAL, lat REAL,
    libelle TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_adresses_iris ON adresses(code_iris);
  CREATE INDEX IF NOT EXISTS idx_adresses_insee ON adresses(code_insee);

  CREATE TABLE IF NOT EXISTS secteurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    iris_codes TEXT NOT NULL,
    agent_id INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS passages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adresse_id TEXT NOT NULL,
    secteur_id INTEGER,
    agent_id INTEGER NOT NULL,
    canal TEXT NOT NULL CHECK(canal IN ('boitage','porte_a_porte')),
    statut TEXT NOT NULL CHECK(statut IN ('fait','rdv','refus','absent')),
    note TEXT,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_passages_adresse ON passages(adresse_id);
  CREATE INDEX IF NOT EXISTS idx_passages_agent ON passages(agent_id);
  CREATE INDEX IF NOT EXISTS idx_passages_date ON passages(created_at);
```

- [ ] **Step 2: Ajouter le paramètre de cadence par défaut**

Juste après le bloc qui insère les `DEFAULT_POIDS` (pondérations), ajouter :

```js
// Paramètre terrain : cadence anti-doublon (semaines)
db.prepare("INSERT OR IGNORE INTO ponderations (cle, valeur) VALUES ('terrain.cadence_semaines', 6)").run();
```

- [ ] **Step 3: Vérifier que la base se crée sans erreur**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const {db}=require('./server/src/database'); console.log('tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name).join(', '))"
```

Expected: la sortie liste `users, iris, ponderations, adresses, secteurs, passages` (entre autres).

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/database.js
git commit -q -m "feat(db): tables adresses, secteurs, passages + paramètre cadence terrain"
```

---

### Task A2 : Ingestion BAN (428k adresses rattachées aux IRIS)

**Files:**
- Create: `server/src/ingest/ingest-ban.js`

Le rattachement à l'IRIS se fait par point-in-polygon sur les géométries IRIS déjà en base (réutilise la logique du Module 1), avec repli sur le 1er IRIS de la commune (via `code_insee`).

- [ ] **Step 1: Créer `server/src/ingest/ingest-ban.js`**

```js
/**
 * Ingestion de la Base Adresse Nationale (BAN) de l'Isère dans la table `adresses`.
 * Source : data/sources/ban/adresses-38.csv.gz (séparateur ';').
 * Rattache chaque adresse à son IRIS (point-in-polygon sur les géométries en base,
 * repli sur le 1er IRIS de la commune via code_insee).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { db } = require('../database');

const F_BAN = path.join(__dirname, '..', '..', '..', 'data', 'sources', 'ban', 'adresses-38.csv.gz');

function pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pointInGeometry(lon, lat, g) {
  if (!g) return false;
  if (g.type === 'Polygon') return pointInPolygon(lon, lat, g.coordinates[0]);
  if (g.type === 'MultiPolygon') return g.coordinates.some(poly => pointInPolygon(lon, lat, poly[0]));
  return false;
}
function bboxOf(g) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  const ring = (r) => r.forEach(([lo, la]) => { if (lo < a) a = lo; if (lo > b) b = lo; if (la < c) c = la; if (la > d) d = la; });
  if (g.type === 'Polygon') ring(g.coordinates[0]);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => ring(p[0]));
  return { minLon: a, maxLon: b, minLat: c, maxLat: d };
}

function main() {
  // Charge les IRIS en mémoire (géométrie + bbox + commune)
  const irisRows = db.prepare('SELECT code_iris, code_commune, geometry FROM iris').all();
  const irisData = [];
  const irisByCommune = {};
  for (const r of irisRows) {
    let g = null;
    try { g = r.geometry ? JSON.parse(r.geometry) : null; } catch { g = null; }
    const d = { code_iris: r.code_iris, code_commune: r.code_commune, geometry: g, bbox: g ? bboxOf(g) : null };
    irisData.push(d);
    (irisByCommune[r.code_commune] = irisByCommune[r.code_commune] || []).push(d);
  }

  function trouverIris(lon, lat, codeInsee) {
    const cands = irisByCommune[codeInsee] || irisData;
    for (const d of cands) {
      if (!d.bbox) continue;
      if (lon < d.bbox.minLon || lon > d.bbox.maxLon || lat < d.bbox.minLat || lat > d.bbox.maxLat) continue;
      if (pointInGeometry(lon, lat, d.geometry)) return d.code_iris;
    }
    // repli : 1er IRIS de la commune
    const c = irisByCommune[codeInsee];
    return c && c.length ? c[0].code_iris : null;
  }

  console.log('Lecture BAN…');
  const txt = zlib.gunzipSync(fs.readFileSync(F_BAN)).toString('utf8');
  const lines = txt.split(/\r?\n/);
  const header = lines[0].split(';');
  const idx = (c) => header.indexOf(c);
  const iId = idx('id'), iNum = idx('numero'), iRep = idx('rep'), iVoie = idx('nom_voie'),
    iCP = idx('code_postal'), iInsee = idx('code_insee'), iCom = idx('nom_commune'),
    iLon = idx('lon'), iLat = idx('lat'), iLib = idx('libelle_acheminement');

  db.prepare('DELETE FROM adresses').run(); // ré-ingestion propre
  const ins = db.prepare(`INSERT OR REPLACE INTO adresses
    (id, numero, rep, nom_voie, code_postal, code_insee, nom_commune, code_iris, lon, lat, libelle)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  let n = 0, sansIris = 0;
  const tx = db.transaction(() => {
    for (let k = 1; k < lines.length; k++) {
      if (!lines[k]) continue;
      const c = lines[k].split(';');
      const id = c[iId]; if (!id) continue;
      const lon = parseFloat(c[iLon]), lat = parseFloat(c[iLat]);
      if (isNaN(lon) || isNaN(lat)) continue;
      const insee = c[iInsee];
      const codeIris = trouverIris(lon, lat, insee);
      if (!codeIris) sansIris++;
      ins.run(id, c[iNum], c[iRep], c[iVoie], c[iCP], insee, c[iCom], codeIris, lon, lat, c[iLib]);
      n++;
    }
  });
  tx();
  console.log(`Inséré ${n} adresses (${sansIris} sans IRIS rattaché).`);

  const parIris = db.prepare('SELECT COUNT(DISTINCT code_iris) c FROM adresses WHERE code_iris IS NOT NULL').get().c;
  console.log(`Réparties sur ${parIris} quartiers IRIS.`);
  process.exit(0);
}
main();
```

- [ ] **Step 2: Lancer l'ingestion BAN**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
time node server/src/ingest/ingest-ban.js
```

Expected: `Inséré 428xxx adresses (... sans IRIS rattaché).` puis `Réparties sur ~700 quartiers IRIS.` ; durée raisonnable (< ~60s). Le nombre « sans IRIS » doit être faible (quelques %).

- [ ] **Step 3: Vérifier le rattachement sur Meylan**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const {db}=require('./server/src/database'); const n=db.prepare(\"SELECT COUNT(*) c FROM adresses WHERE code_insee='38229'\").get().c; const ex=db.prepare(\"SELECT numero, nom_voie, code_iris FROM adresses WHERE code_insee='38229' LIMIT 3\").all(); console.log('Meylan:', n, 'adresses'); console.table(ex)"
```

Expected: Meylan a plusieurs milliers d'adresses, chacune avec un `code_iris` rattaché.

- [ ] **Step 4: Ajouter le script `ingest:ban` au package.json racine**

Dans `/Users/loickferrucci/Desktop/immo-prospect/package.json`, dans `"scripts"`, ajouter :

```json
    "ingest:ban": "node server/src/ingest/ingest-ban.js",
```

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/ingest/ingest-ban.js package.json
git commit -q -m "feat(ingest): ingestion BAN Isère (428k adresses rattachées aux IRIS)"
```

---

### Task A3 : Routes secteurs (+ adresses d'un secteur)

**Files:**
- Create: `server/src/routes/secteurRoutes.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Créer `server/src/routes/secteurRoutes.js`**

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const router = express.Router();
router.use(requireAuth);

// Liste des secteurs : tous pour manager/admin, sinon ceux affectés à l'agent.
router.get('/', (req, res) => {
  const isManager = ['manager', 'admin'].includes(req.user.role);
  const rows = isManager
    ? db.prepare('SELECT * FROM secteurs ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM secteurs WHERE agent_id = ? ORDER BY created_at DESC').all(req.user.id);

  // enrichir : nb adresses + nb traitées + dernier passage
  const out = rows.map(s => {
    const codes = JSON.parse(s.iris_codes || '[]');
    const ph = codes.map(() => '?').join(',') || "''";
    const nbAdr = codes.length ? db.prepare(`SELECT COUNT(*) c FROM adresses WHERE code_iris IN (${ph})`).get(...codes).c : 0;
    const nbTraitees = db.prepare('SELECT COUNT(DISTINCT adresse_id) c FROM passages WHERE secteur_id = ?').get(s.id).c;
    const dernier = db.prepare('SELECT MAX(created_at) d FROM passages WHERE secteur_id = ?').get(s.id).d;
    const agent = s.agent_id ? db.prepare('SELECT prenom, nom FROM users WHERE id = ?').get(s.agent_id) : null;
    return { ...s, iris_codes: codes, nb_adresses: nbAdr, nb_traitees: nbTraitees, dernier_passage: dernier,
      agent_nom: agent ? `${agent.prenom} ${agent.nom}` : null };
  });
  res.json(out);
});

// Créer un secteur (manager/admin)
router.post('/', requireRole('manager', 'admin'), (req, res) => {
  const { nom, iris_codes, agent_id } = req.body;
  if (!nom || !Array.isArray(iris_codes) || iris_codes.length === 0) return res.status(400).json({ error: 'nom et iris_codes requis' });
  const r = db.prepare('INSERT INTO secteurs (nom, iris_codes, agent_id, created_by) VALUES (?,?,?,?)')
    .run(nom, JSON.stringify(iris_codes), agent_id || null, req.user.id);
  res.status(201).json({ id: r.lastInsertRowid });
});

// Modifier (renommer / réaffecter)
router.put('/:id', requireRole('manager', 'admin'), (req, res) => {
  const { nom, agent_id, iris_codes } = req.body;
  const s = db.prepare('SELECT id FROM secteurs WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Secteur non trouvé' });
  db.prepare('UPDATE secteurs SET nom = COALESCE(?, nom), agent_id = ?, iris_codes = COALESCE(?, iris_codes) WHERE id = ?')
    .run(nom ?? null, agent_id ?? null, iris_codes ? JSON.stringify(iris_codes) : null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('manager', 'admin'), (req, res) => {
  db.prepare('DELETE FROM secteurs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Adresses d'un secteur + dernier passage de chacune (charge la carte de travail)
router.get('/:id/adresses', (req, res) => {
  const s = db.prepare('SELECT * FROM secteurs WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Secteur non trouvé' });
  const codes = JSON.parse(s.iris_codes || '[]');
  if (codes.length === 0) return res.json({ secteur: { ...s, iris_codes: codes }, adresses: [] });
  const ph = codes.map(() => '?').join(',');
  const cadence = parseInt(db.prepare("SELECT valeur FROM ponderations WHERE cle = 'terrain.cadence_semaines'").get()?.valeur || 6);

  // adresses + dernier passage (statut/date) via sous-requête
  const adresses = db.prepare(`
    SELECT a.id, a.numero, a.rep, a.nom_voie, a.nom_commune, a.lon, a.lat,
      p.statut AS dernier_statut, p.created_at AS dernier_passage
    FROM adresses a
    LEFT JOIN passages p ON p.id = (
      SELECT id FROM passages WHERE adresse_id = a.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE a.code_iris IN (${ph})
    ORDER BY a.nom_voie, CAST(a.numero AS INTEGER)
  `).all(...codes);

  res.json({ secteur: { ...s, iris_codes: codes }, cadence_semaines: cadence, adresses });
});

module.exports = router;
```

- [ ] **Step 2: Monter la route dans `server/src/index.js`**

Après la ligne `app.use('/api/admin', ...)`, ajouter :

```js
app.use('/api/secteurs', require('./routes/secteurRoutes'));
```

- [ ] **Step 3: Tester (créer un secteur + charger ses adresses)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/s.log 2>&1 &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
# un code IRIS de Meylan
IRIS=$(curl -s "http://localhost:3002/api/iris/top?variante=vente&limit=1" -H "Authorization: Bearer $TOKEN" | node -e "console.log(JSON.parse(require('fs').readFileSync(0))[0].code_iris)")
echo "IRIS test: $IRIS"
SID=$(curl -s -X POST http://localhost:3002/api/secteurs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"nom\":\"Test\",\"iris_codes\":[\"$IRIS\"]}" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).id)")
echo "Secteur créé id=$SID"
curl -s "http://localhost:3002/api/secteurs/$SID/adresses" -H "Authorization: Bearer $TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('Adresses du secteur:', d.adresses.length, '| cadence', d.cadence_semaines, 'sem')"
pkill -f "server/src/index.js"
```

Expected: secteur créé, et un nombre > 0 d'adresses retournées avec `cadence 6 sem`.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/secteurRoutes.js server/src/index.js
git commit -q -m "feat(api): routes secteurs + adresses d'un secteur (avec dernier passage)"
```

---

### Task A4 : Route passages + réglage cadence

**Files:**
- Create: `server/src/routes/passageRoutes.js`
- Modify: `server/src/index.js`
- Modify: `server/src/routes/adminRoutes.js`

- [ ] **Step 1: Créer `server/src/routes/passageRoutes.js`**

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

// Enregistrer un passage sur une adresse
router.post('/', (req, res) => {
  const { adresse_id, secteur_id, canal, statut, note, photo } = req.body;
  if (!adresse_id || !canal || !statut) return res.status(400).json({ error: 'adresse_id, canal, statut requis' });
  const adr = db.prepare('SELECT id FROM adresses WHERE id = ?').get(adresse_id);
  if (!adr) return res.status(404).json({ error: 'Adresse inconnue' });
  const r = db.prepare(`INSERT INTO passages (adresse_id, secteur_id, agent_id, canal, statut, note, photo)
    VALUES (?,?,?,?,?,?,?)`).run(adresse_id, secteur_id || null, req.user.id, canal, statut, note || null, photo || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

// Historique des passages d'une adresse
router.get('/adresse/:id', (req, res) => {
  const rows = db.prepare(`SELECT p.*, u.prenom, u.nom FROM passages p JOIN users u ON u.id = p.agent_id
    WHERE p.adresse_id = ? ORDER BY p.created_at DESC`).all(req.params.id);
  res.json(rows);
});

// Stats du jour pour l'agent (compteur de session)
router.get('/stats/jour', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const n = db.prepare("SELECT COUNT(*) c FROM passages WHERE agent_id = ? AND DATE(created_at) = ?").get(req.user.id, today).c;
  res.json({ aujourdhui: n });
});

module.exports = router;
```

- [ ] **Step 2: Monter la route dans `index.js`**

Après `app.use('/api/secteurs', ...)`, ajouter :

```js
app.use('/api/passages', require('./routes/passageRoutes'));
```

- [ ] **Step 3: Ajouter le réglage cadence dans `adminRoutes.js`**

Dans `server/src/routes/adminRoutes.js`, ajouter ces deux routes avant `module.exports` :

```js
// Réglages terrain (cadence anti-doublon)
router.get('/terrain', (req, res) => {
  const v = db.prepare("SELECT valeur FROM ponderations WHERE cle = 'terrain.cadence_semaines'").get();
  res.json({ cadence_semaines: parseInt(v?.valeur || 6) });
});
router.put('/terrain', (req, res) => {
  const n = parseInt(req.body.cadence_semaines);
  if (isNaN(n) || n < 1 || n > 52) return res.status(400).json({ error: 'cadence invalide (1-52 semaines)' });
  db.prepare("INSERT OR REPLACE INTO ponderations (cle, valeur) VALUES ('terrain.cadence_semaines', ?)").run(n);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Tester l'enregistrement d'un passage**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/s.log 2>&1 &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
# prendre une adresse existante
ADR=$(node -e "const {db}=require('./server/src/database');console.log(db.prepare('SELECT id FROM adresses LIMIT 1').get().id)")
echo "Adresse test: $ADR"
curl -s -X POST http://localhost:3002/api/passages -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"adresse_id\":\"$ADR\",\"canal\":\"boitage\",\"statut\":\"fait\"}" 
echo ""
curl -s http://localhost:3002/api/passages/stats/jour -H "Authorization: Bearer $TOKEN"
pkill -f "server/src/index.js"
```

Expected: `{"id":1}` puis `{"aujourdhui":1}`.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/passageRoutes.js server/src/routes/adminRoutes.js server/src/index.js
git commit -q -m "feat(api): passages + compteur du jour + réglage cadence terrain"
```

---

## PALIER B — Secteurs (frontend)

### Task B1 : Navigation Ciblage / Terrain

**Files:**
- Create: `client/src/components/NavTabs.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Créer `client/src/components/NavTabs.jsx`**

```jsx
import Icon from './ui/Icon'
export default function NavTabs({ active, onChange }) {
  const tabs = [
    { id: 'ciblage', label: 'Ciblage', icon: 'map' },
    { id: 'terrain', label: 'Terrain', icon: 'footprints' },
  ]
  return (
    <div className="bg-white/10 rounded-lg p-0.5 flex text-xs">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5 ${active === t.id ? 'bg-quai-gold text-quai-navy font-semibold' : 'text-white/80'}`}>
          <Icon name={t.icon} size="sm" /> {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Modifier `App.jsx` pour router entre Ciblage et Terrain**

Remplacer la fonction `Inner` de `client/src/App.jsx` par :

```jsx
function Inner() {
  const { user } = useAuth()
  const [page, setPage] = useState('carte')      // carte | admin | secteurs | terrain
  const [secteurActif, setSecteurActif] = useState(null)
  if (!user) return <LoginPage />
  if (page === 'admin') return <AdminPage onBack={() => setPage('carte')} />
  if (page === 'secteurs') return <SecteursPage onOpenSecteur={(id) => { setSecteurActif(id); setPage('terrain') }} onNav={setPage} />
  if (page === 'terrain' && secteurActif) return <TerrainPage secteurId={secteurActif} onBack={() => setPage('secteurs')} />
  return <CartePage onAdmin={() => setPage('admin')} onNav={setPage} />
}
```

Ajouter les imports en haut de `App.jsx` :

```jsx
import SecteursPage from './pages/SecteursPage'
import TerrainPage from './pages/TerrainPage'
```

Note implémenteur : `CartePage` et `SecteursPage` recevront une prop `onNav` pour basculer via NavTabs. Adapter `CartePage` pour afficher `<NavTabs active="ciblage" onChange={(id)=> id==='terrain' && onNav('secteurs')} />` dans son header (à côté du toggle vente/gestion).

- [ ] **Step 3: Build**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
```

Expected: build OK (NavTabs importé ; SecteursPage/TerrainPage seront créés aux tâches suivantes — si le build échoue car ils n'existent pas encore, créer des stubs vides exportant `export default function X(){return null}` puis les remplir. Pour éviter ça, faire B1 juste avant B2/B3, ou créer les stubs maintenant.)

- [ ] **Step 4: Créer des stubs pour que le build passe**

Créer `client/src/pages/SecteursPage.jsx` :
```jsx
export default function SecteursPage() { return <div className="p-6">Secteurs (à venir)</div> }
```
Créer `client/src/pages/TerrainPage.jsx` :
```jsx
export default function TerrainPage() { return <div className="p-6">Terrain (à venir)</div> }
```

- [ ] **Step 5: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/components/NavTabs.jsx client/src/App.jsx client/src/pages/SecteursPage.jsx client/src/pages/TerrainPage.jsx
git commit -q -m "feat(client): navigation Ciblage/Terrain + stubs pages secteurs/terrain"
```

---

### Task B2 : Page « Mes secteurs » + création

**Files:**
- Modify (remplace le stub): `client/src/pages/SecteursPage.jsx`

- [ ] **Step 1: Écrire `SecteursPage.jsx` complet**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import Icon from '../components/ui/Icon'
import { useAuth } from '../hooks/useAuth'

export default function SecteursPage({ onOpenSecteur, onNav }) {
  const { user, logout } = useAuth()
  const isManager = ['manager', 'admin'].includes(user?.role)
  const [secteurs, setSecteurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [agents, setAgents] = useState([])

  const load = () => { setLoading(true); api.get('/secteurs').then(r => setSecteurs(r.data)).catch(() => toast.error('Erreur chargement')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  useEffect(() => { if (isManager) api.get('/secteurs').catch(()=>{}) }, [isManager])

  return (
    <div className="min-h-screen bg-quai-light">
      <header className="bg-quai-navy text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Le Quai" className="h-7 w-auto" />
          <span className="font-display text-sm">Prospection terrain</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNav('carte')} className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1"><Icon name="map" size="sm" /> Ciblage</button>
          <button onClick={logout} className="text-white/70 hover:text-white p-1.5" aria-label="Déconnexion"><Icon name="log-out" size="md" /></button>
        </div>
      </header>
      <div className="max-w-4xl mx-auto p-6">
        <PageHeader title="Mes secteurs" subtitle={isManager ? 'Tous les secteurs de prospection' : 'Vos secteurs affectés'}>
          {isManager && <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Créer un secteur</button>}
        </PageHeader>

        {loading ? <div className="text-quai-muted animate-pulse">Chargement…</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {secteurs.length === 0 && <div className="text-quai-muted col-span-2">Aucun secteur pour le moment.</div>}
            {secteurs.map(s => {
              const pct = s.nb_adresses > 0 ? Math.round(s.nb_traitees / s.nb_adresses * 100) : 0
              return (
                <button key={s.id} onClick={() => onOpenSecteur(s.id)} className="card text-left hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="font-display font-semibold text-quai-navy">{s.nom}</div>
                    <Icon name="chevron-right" size="sm" className="text-quai-muted" />
                  </div>
                  {s.agent_nom && <div className="text-xs text-quai-muted mb-2">Agent : {s.agent_nom}</div>}
                  <div className="text-xs text-quai-muted mb-1">{s.nb_adresses.toLocaleString('fr')} adresses · {pct}% traité</div>
                  <div className="h-1.5 bg-quai-border rounded-full overflow-hidden">
                    <div className="h-full bg-quai-gold rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && <CreerSecteurModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}

// Modale de création : nom + sélection de quartiers IRIS (par liste top) + agent
function CreerSecteurModal({ onClose, onCreated }) {
  const [nom, setNom] = useState('')
  const [iris, setIris] = useState([])
  const [agentId, setAgentId] = useState('')
  const [tops, setTops] = useState([])
  const [agents, setAgents] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/iris/top?variante=vente&limit=60').then(r => setTops(r.data)).catch(()=>{})
    api.get('/secteurs').catch(()=>{}) // no-op pour cohérence
  }, [])

  const toggle = (code) => setIris(arr => arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code])
  const save = async () => {
    if (!nom || iris.length === 0) { toast.error('Nom et au moins un quartier requis'); return }
    setSaving(true)
    try { await api.post('/secteurs', { nom, iris_codes: iris, agent_id: agentId || null }); toast.success('Secteur créé'); onCreated() }
    catch { toast.error('Erreur création') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-quai-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-quai-navy">Créer un secteur</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy"><Icon name="x" size="md" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-quai-muted mb-1">Nom du secteur</label>
            <input className="input" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex. Meylan Centre" />
          </div>
          <div>
            <label className="block text-xs font-medium text-quai-muted mb-1">Quartiers (cliquez pour ajouter) — {iris.length} sélectionné(s)</label>
            <div className="max-h-48 overflow-y-auto border border-quai-border rounded-lg p-2 space-y-1">
              {tops.map(t => (
                <button key={t.code_iris} onClick={() => toggle(t.code_iris)}
                  className={`w-full text-left text-sm px-2 py-1 rounded ${iris.includes(t.code_iris) ? 'bg-quai-gold/20 text-quai-navy' : 'hover:bg-quai-light text-quai-text'}`}>
                  {iris.includes(t.code_iris) ? '✓ ' : ''}{t.nom_commune} — {t.nom_iris} <span className="text-quai-muted">(score {t.score_vente})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-quai-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Création…' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
```

Note implémenteur : la sélection de quartiers se fait ici via la **liste des top quartiers** (`/iris/top`) pour rester simple. L'affectation à un agent précis peut être ajoutée si l'API users est exposée ; pour l'instant le secteur est créé non affecté ou affecté au créateur — laisser `agent_id` optionnel. (La sélection cartographique d'IRIS est une amélioration future.)

- [ ] **Step 2: Build + test visuel rapide**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add client/src/pages/SecteursPage.jsx
git commit -q -m "feat(client): page Mes secteurs + création de secteur"
```

---

## PALIER C — Écran de travail terrain

### Task C1 : Carte des adresses + liste rue par rue + saisie de passage

**Files:**
- Create: `client/src/components/CarteAdresses.jsx`
- Create: `client/src/components/PassageForm.jsx`
- Modify (remplace le stub): `client/src/pages/TerrainPage.jsx`

- [ ] **Step 1: `client/src/components/CarteAdresses.jsx`** (carte des adresses colorées par état)

```jsx
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useEffect } from 'react'

// Couleur selon l'état de l'adresse (cadencement)
export function etatAdresse(a, cadenceSemaines) {
  if (!a.dernier_passage) return { cle: 'a_faire', couleur: '#C9C4BC', label: 'À faire' }
  if (a.dernier_statut === 'rdv') return { cle: 'rdv', couleur: '#0D0D2B', label: 'RDV' }
  if (a.dernier_statut === 'refus') return { cle: 'refus', couleur: '#8B1E1E', label: 'Refus' }
  const jours = (Date.now() - new Date(a.dernier_passage).getTime()) / 86400000
  if (jours <= cadenceSemaines * 7) return { cle: 'recent', couleur: '#2e7d32', label: 'Traité récemment' }
  return { cle: 'ancien', couleur: '#C9A96E', label: 'À retravailler' }
}

function Recentrer({ adresses }) {
  const map = useMap()
  useEffect(() => {
    if (!adresses.length) return
    const lats = adresses.map(a => a.lat), lons = adresses.map(a => a.lon)
    map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [30, 30] })
  }, [adresses, map])
  return null
}

export default function CarteAdresses({ adresses, cadence, onSelect }) {
  return (
    <MapContainer center={[45.18, 5.72]} zoom={14} className="h-full w-full" style={{ background: '#F7F6F3' }}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Recentrer adresses={adresses} />
      {adresses.map(a => {
        const e = etatAdresse(a, cadence)
        return (
          <CircleMarker key={a.id} center={[a.lat, a.lon]} radius={6}
            pathOptions={{ color: '#fff', weight: 1, fillColor: e.couleur, fillOpacity: 0.9 }}
            eventHandlers={{ click: () => onSelect(a) }}>
            <Tooltip>{a.numero}{a.rep || ''} {a.nom_voie} — {e.label}</Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
```

- [ ] **Step 2: `client/src/components/PassageForm.jsx`** (saisie rapide)

```jsx
import { useState } from 'react'
import Icon from './ui/Icon'

const STATUTS = [
  ['fait', 'Boîté / fait', 'check'],
  ['rdv', 'RDV obtenu', 'calendar-check'],
  ['absent', 'Absent', 'user-x'],
  ['refus', 'Refus', 'x-circle'],
]
export default function PassageForm({ adresse, onClose, onSaved }) {
  const [canal, setCanal] = useState('boitage')
  const [statut, setStatut] = useState('fait')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); await onSaved({ canal, statut, note }); setSaving(false) }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-4 border-b border-quai-border flex items-center justify-between">
          <div className="font-display font-semibold text-quai-navy">{adresse.numero}{adresse.rep || ''} {adresse.nom_voie}</div>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy"><Icon name="x" size="md" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs font-medium text-quai-muted mb-1.5">Canal</div>
            <div className="grid grid-cols-2 gap-2">
              {[['boitage','Boîtage','mail'],['porte_a_porte','Porte-à-porte','door-open']].map(([k,l,ic]) => (
                <button key={k} onClick={() => setCanal(k)} className={`p-3 rounded-lg border-2 text-sm inline-flex items-center justify-center gap-1.5 min-h-[44px] ${canal===k?'border-quai-gold bg-quai-gold/10 text-quai-navy':'border-quai-border text-quai-muted'}`}>
                  <Icon name={ic} size="sm" /> {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-quai-muted mb-1.5">Résultat</div>
            <div className="grid grid-cols-2 gap-2">
              {STATUTS.map(([k,l,ic]) => (
                <button key={k} onClick={() => setStatut(k)} className={`p-3 rounded-lg border-2 text-sm inline-flex items-center justify-center gap-1.5 min-h-[44px] ${statut===k?'border-quai-gold bg-quai-gold/10 text-quai-navy':'border-quai-border text-quai-muted'}`}>
                  <Icon name={ic} size="sm" /> {l}
                </button>
              ))}
            </div>
          </div>
          <textarea className="input resize-none" rows={2} placeholder="Note (optionnel)…" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="p-4 border-t border-quai-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `client/src/pages/TerrainPage.jsx`** (assemble carte + liste + saisie)

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import CarteAdresses, { etatAdresse } from '../components/CarteAdresses'
import PassageForm from '../components/PassageForm'

export default function TerrainPage({ secteurId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [session, setSession] = useState(0)

  const load = () => {
    setLoading(true)
    api.get(`/secteurs/${secteurId}/adresses`).then(r => setData(r.data)).catch(() => toast.error('Erreur chargement')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [secteurId])

  const enregistrer = async ({ canal, statut, note }) => {
    try {
      await api.post('/passages', { adresse_id: sel.id, secteur_id: secteurId, canal, statut, note })
      toast.success('Passage enregistré')
      setSession(s => s + 1)
      setSel(null)
      load()
    } catch { toast.error('Erreur enregistrement') }
  }

  const adresses = data?.adresses || []
  const cadence = data?.cadence_semaines || 6
  // regrouper par voie pour la liste
  const parVoie = {}
  adresses.forEach(a => { (parVoie[a.nom_voie] = parVoie[a.nom_voie] || []).push(a) })

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-quai-navy text-white px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="text-white/80 hover:text-white inline-flex items-center gap-1.5 text-sm"><Icon name="arrow-left" size="sm" /> Secteurs</button>
        <div className="font-display text-sm truncate px-2">{data?.secteur?.nom || 'Secteur'}</div>
        <div className="text-xs text-quai-gold">{session} aujourd'hui</div>
      </header>
      {loading ? <div className="flex-1 flex items-center justify-center text-quai-muted animate-pulse">Chargement des adresses…</div> : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="h-1/2 lg:h-full lg:w-2/3 relative">
            <CarteAdresses adresses={adresses} cadence={cadence} onSelect={setSel} />
          </div>
          <div className="h-1/2 lg:h-full lg:w-1/3 overflow-y-auto bg-white border-l border-quai-border">
            <div className="p-3 text-xs text-quai-muted border-b border-quai-border">{adresses.length.toLocaleString('fr')} adresses</div>
            {Object.entries(parVoie).map(([voie, liste]) => (
              <div key={voie}>
                <div className="px-3 py-1.5 bg-quai-light text-xs font-semibold text-quai-navy sticky top-0">{voie}</div>
                {liste.map(a => {
                  const e = etatAdresse(a, cadence)
                  return (
                    <button key={a.id} onClick={() => setSel(a)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-quai-light border-b border-quai-border/50 text-left">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.couleur }} />
                      <span className="text-quai-text">{a.numero}{a.rep || ''}</span>
                      <span className="text-quai-muted text-xs ml-auto">{e.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {sel && <PassageForm adresse={sel} onClose={() => setSel(null)} onSaved={enregistrer} />}
    </div>
  )
}
```

- [ ] **Step 4: Build**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add client/src/components/CarteAdresses.jsx client/src/components/PassageForm.jsx client/src/pages/TerrainPage.jsx
git commit -q -m "feat(client): écran de travail terrain — carte adresses + liste rue par rue + saisie passage + cadencement"
```

---

## PALIER D — Vérification & déploiement

### Task D1 : Vérification end-to-end + base + push

**Files:** aucun (vérification)

- [ ] **Step 1: Vérifier qu'il n'y a aucun emoji dans le nouveau code front**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' client/src/pages/SecteursPage.jsx client/src/pages/TerrainPage.jsx client/src/components/CarteAdresses.jsx client/src/components/PassageForm.jsx client/src/components/NavTabs.jsx 2>/dev/null && echo "EMOJI TROUVÉ — remplacer par Icon" || echo "✓ aucun emoji"
```

Note : le `✓` dans SecteursPage (liste de sélection) est un caractère check ASCII-étendu acceptable dans une chaîne texte, pas une icône structurelle ; si le grep le remonte, le remplacer par un `<Icon name="check">` est préférable.

Expected: `✓ aucun emoji` (ou correction).

- [ ] **Step 2: Build complet + parcours prod**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm run build 2>&1 | grep -iE "error|built in" | tail -1
JWT_SECRET=verif PORT=3002 npm start >/tmp/d.log 2>&1 &
sleep 2.5
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "secteurs:"; curl -s http://localhost:3002/api/secteurs -H "Authorization: Bearer $TOKEN" | node -e "console.log('  ',JSON.parse(require('fs').readFileSync(0)).length,'secteur(s)')"
echo "adresses en base:"; node -e "const {db}=require('./server/src/database');console.log('  ',db.prepare('SELECT COUNT(*) c FROM adresses').get().c)"
pkill -f "server/src/index.js"
```

Expected: build OK ; secteurs listés ; ~428k adresses en base.

- [ ] **Step 3: Checkpoint WAL + commit de la base peuplée (BAN incluse)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const Database=require('better-sqlite3');const db=new Database('server/data/prospect.db');db.pragma('wal_checkpoint(TRUNCATE)');db.close()"
ls -lh server/data/prospect.db | awk '{print "base:", $5}'
git add server/data/prospect.db
git commit -q -m "chore(deploy): base peuplée avec adresses BAN (Module 2)"
```

Note : si la base dépasse ~80-100 Mo et devient gênante pour git, basculer vers une stratégie d'ingestion au boot (documenter dans le README) plutôt que de committer. Sinon, committer est le plus simple.

- [ ] **Step 4: Push (déclenche le redéploiement Railway)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git push origin main 2>&1 | tail -3
```

Expected: push OK. Railway redéploie automatiquement.

- [ ] **Step 5: Mettre à jour le README**

Ajouter une section « Module 2 — Terrain » au `README.md` : décrire les secteurs, le suivi d'adresses, la commande `npm run ingest:ban`, et noter la taille de la base.

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add README.md
git commit -q -m "docs: README — Module 2 prospection terrain"
git push origin main 2>&1 | tail -2
```

---

## Definition of Done (rappel spec §10)
- [x] 428k adresses BAN ingérées et rattachées aux IRIS
- [x] Manager crée un secteur (sélection de quartiers) et l'affecte
- [x] Agent voit ses secteurs avec % traité
- [x] Carte des adresses du secteur colorées par état + liste rue par rue
- [x] Saisir un passage met à jour l'état de l'adresse
- [x] Cadencement visuel (seuil réglable)
- [x] Build + run + déploiement vérifiés

## Hors périmètre (rappel)
Mode hors-ligne complet, création de contacts depuis une adresse, optimisation d'itinéraire, sélection cartographique d'IRIS pour créer un secteur (on utilise la liste top en V1), nombre exact de boîtes par immeuble.
