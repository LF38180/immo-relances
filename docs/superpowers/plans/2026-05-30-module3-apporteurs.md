# Module 3 — Réseau d'apporteurs — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à ImmoProspect un module de gestion du réseau d'apporteurs : annuaire (type/zone/fiabilité), signalement d'affaires (tuyaux libres datés) avec pipeline de statuts, calcul automatique des commissions (% des honoraires), et tableau de bord (affaires par statut, top apporteurs, commissions à payer/payées).

**Architecture :** Ajout dans `/Users/loickferrucci/Desktop/immo-prospect/`. 2 nouvelles tables (apporteurs, affaires) + paramètre taux par défaut. Routes Express CRUD + calcul commission serveur + stats. Front : navigation étendue (Ciblage/Terrain/Apporteurs) + page à 3 onglets (pipeline affaires, annuaire, tableau de bord). Réutilise auth, charte quai-*, Icon, PageHeader, NavTabs, api.js. Aucune donnée externe.

**Tech Stack :** Node + Express + better-sqlite3, React 18 + Vite + Tailwind. Aucune nouvelle dépendance.

**Construction en 2 paliers :** A (backend), B (frontend).

---

## File Structure

**Backend :**
- Modify: `server/src/database.js` — 2 tables + paramètre `apporteurs.taux_defaut` + fonction `calculerCommission`
- Create: `server/src/routes/apporteurRoutes.js` — CRUD apporteurs
- Create: `server/src/routes/affaireRoutes.js` — CRUD affaires + stats + calcul commission
- Modify: `server/src/routes/adminRoutes.js` — taux par défaut (manager/admin)
- Modify: `server/src/index.js` — monter les routes

**Frontend :**
- Modify: `client/src/components/NavTabs.jsx` — ajouter onglet « Apporteurs »
- Modify: `client/src/App.jsx` — router vers la page apporteurs
- Modify: `client/src/pages/CartePage.jsx` + `SecteursPage.jsx` — propager la nav vers apporteurs
- Create: `client/src/pages/ApporteursPage.jsx` — page à 3 onglets
- Create: `client/src/components/PipelineAffaires.jsx` — colonnes par statut
- Create: `client/src/components/AffaireModal.jsx` — créer / faire avancer une affaire
- Create: `client/src/components/ApporteurModal.jsx` — créer / éditer un apporteur

**Port :** 3002 (inchangé). Constantes de types/statuts définies inline (pas de fichier constants existant côté ce projet).

---

## PALIER A — Backend

### Task A1 : Schéma — tables apporteurs & affaires + calcul commission

**Files:**
- Modify: `server/src/database.js`

- [ ] **Step 1: Ajouter les 2 tables dans le `db.exec` de database.js**

Dans le grand `db.exec(\`...\`)` existant, AVANT la backtick fermante, ajouter :

```sql
  CREATE TABLE IF NOT EXISTS apporteurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'autre'
      CHECK(type IN ('concierge_gardien','commercant','artisan','notaire','particulier','autre')),
    commune TEXT, telephone TEXT, email TEXT, note TEXT,
    actif INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS affaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apporteur_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'signale'
      CHECK(statut IN ('signale','contacte','mandat','vente','perdu')),
    honoraires REAL DEFAULT 0,
    taux_commission REAL,
    commission REAL DEFAULT 0,
    commission_payee INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_affaires_apporteur ON affaires(apporteur_id);
  CREATE INDEX IF NOT EXISTS idx_affaires_statut ON affaires(statut);
```

- [ ] **Step 2: Ajouter le paramètre taux par défaut**

Après le bloc qui insère `terrain.cadence_semaines` (ou les pondérations), ajouter :

```js
db.prepare("INSERT OR IGNORE INTO ponderations (cle, valeur) VALUES ('apporteurs.taux_defaut', 10)").run();
```

- [ ] **Step 3: Ajouter et exporter la fonction `calculerCommission`**

Avant le `module.exports` de database.js, ajouter :

```js
// Calcule la commission d'une affaire = honoraires * taux / 100.
// Taux : celui de l'affaire si défini, sinon le taux par défaut global.
function calculerCommission(affaireId) {
  const a = db.prepare('SELECT honoraires, taux_commission FROM affaires WHERE id = ?').get(affaireId);
  if (!a) return;
  const tauxDefaut = parseFloat(db.prepare("SELECT valeur FROM ponderations WHERE cle = 'apporteurs.taux_defaut'").get()?.valeur || 10);
  const taux = (a.taux_commission != null && a.taux_commission !== '') ? parseFloat(a.taux_commission) : tauxDefaut;
  const honoraires = parseFloat(a.honoraires) || 0;
  const commission = Math.max(0, Math.round(honoraires * taux / 100 * 100) / 100);
  db.prepare("UPDATE affaires SET commission = ?, updated_at = datetime('now') WHERE id = ?").run(commission, affaireId);
}
```

Et modifier le `module.exports` pour l'inclure. Exemple si l'export actuel est `module.exports = { db, recalculerScores };` :

```js
module.exports = { db, recalculerScores, calculerCommission };
```

- [ ] **Step 4: Vérifier que la base se crée + test du calcul**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "
const { db, calculerCommission } = require('./server/src/database');
const ap = db.prepare(\"INSERT INTO apporteurs (nom, type) VALUES ('Test','autre')\").run().lastInsertRowid;
const af = db.prepare('INSERT INTO affaires (apporteur_id, agent_id, description, statut, honoraires) VALUES (?,1,?,?,?)').run(ap,'tuyau','vente',8000).lastInsertRowid;
calculerCommission(af);
const r = db.prepare('SELECT honoraires, commission FROM affaires WHERE id = ?').get(af);
console.log('honoraires', r.honoraires, '-> commission (10%)', r.commission, r.commission===800?'OK':'ECHEC');
db.prepare('DELETE FROM affaires WHERE id=?').run(af); db.prepare('DELETE FROM apporteurs WHERE id=?').run(ap);
"
```

Expected: `honoraires 8000 -> commission (10%) 800 OK`.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/database.js
git commit -q -m "feat(db): tables apporteurs & affaires + calcul commission + taux par défaut"
```

---

### Task A2 : Routes apporteurs (CRUD)

**Files:**
- Create: `server/src/routes/apporteurRoutes.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Créer `server/src/routes/apporteurRoutes.js`**

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

const TYPES = ['concierge_gardien','commercant','artisan','notaire','particulier','autre'];

// Liste (filtres : type, commune, actif) + nb d'affaires
router.get('/', (req, res) => {
  const { type = '', commune = '', actif = '' } = req.query;
  const cond = [], params = [];
  if (type) { cond.push('type = ?'); params.push(type); }
  if (commune) { cond.push('commune LIKE ?'); params.push(`%${commune}%`); }
  if (actif !== '') { cond.push('actif = ?'); params.push(actif === '1' ? 1 : 0); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM apporteurs ${where} ORDER BY nom`).all(...params);
  const out = rows.map(a => ({
    ...a,
    nb_affaires: db.prepare('SELECT COUNT(*) c FROM affaires WHERE apporteur_id = ?').get(a.id).c,
  }));
  res.json(out);
});

router.post('/', (req, res) => {
  const { nom, type = 'autre', commune, telephone, email, note, actif = 1 } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  const r = db.prepare(`INSERT INTO apporteurs (nom, type, commune, telephone, email, note, actif, created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(nom, type, commune || null, telephone || null, email || null, note || null, actif ? 1 : 0, req.user.id);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nom, type, commune, telephone, email, note, actif } = req.body;
  const a = db.prepare('SELECT id FROM apporteurs WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Apporteur non trouvé' });
  if (type !== undefined && !TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  db.prepare(`UPDATE apporteurs SET nom = COALESCE(?, nom), type = COALESCE(?, type),
    commune = ?, telephone = ?, email = ?, note = ?, actif = COALESCE(?, actif) WHERE id = ?`)
    .run(nom ?? null, type ?? null, commune ?? null, telephone ?? null, email ?? null, note ?? null,
      actif === undefined ? null : (actif ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

// Supprimer si aucune affaire liée, sinon désactiver (préserve l'historique)
router.delete('/:id', (req, res) => {
  const nb = db.prepare('SELECT COUNT(*) c FROM affaires WHERE apporteur_id = ?').get(req.params.id).c;
  if (nb > 0) {
    db.prepare('UPDATE apporteurs SET actif = 0 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, desactive: true });
  }
  db.prepare('DELETE FROM apporteurs WHERE id = ?').run(req.params.id);
  res.json({ ok: true, supprime: true });
});

module.exports = router;
```

- [ ] **Step 2: Monter la route dans `server/src/index.js`**

Après `app.use('/api/passages', ...)` (ou la dernière route API), ajouter :

```js
app.use('/api/apporteurs', require('./routes/apporteurRoutes'));
```

- [ ] **Step 3: Tester**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/ap.log 2>&1 &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "POST apporteur:"; ID=$(curl -s -X POST http://localhost:3002/api/apporteurs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nom":"Mme Concierge","type":"concierge_gardien","commune":"Meylan"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).id)")
echo "  id=$ID"
echo "GET apporteurs:"; curl -s http://localhost:3002/api/apporteurs -H "Authorization: Bearer $TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('  ',d.length,'apporteur(s), 1er nb_affaires:',d[0]?.nb_affaires)"
pkill -f "server/src/index.js"
```

Expected: apporteur créé (id) ; liste avec 1 apporteur, `nb_affaires: 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/apporteurRoutes.js server/src/index.js
git commit -q -m "feat(api): CRUD apporteurs (annuaire, désactivation si affaires liées)"
```

---

### Task A3 : Routes affaires (CRUD + commission + stats)

**Files:**
- Create: `server/src/routes/affaireRoutes.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Créer `server/src/routes/affaireRoutes.js`**

```js
const express = require('express');
const { db, calculerCommission } = require('../database');
const { requireAuth } = require('../auth');
const router = express.Router();
router.use(requireAuth);

const STATUTS = ['signale','contacte','mandat','vente','perdu'];

// Stats (déclaré AVANT /:id pour ne pas être capté comme paramètre)
router.get('/stats', (req, res) => {
  const parStatut = db.prepare('SELECT statut, COUNT(*) c FROM affaires GROUP BY statut').all();
  const topApporteurs = db.prepare(`
    SELECT ap.id, ap.nom, COUNT(af.id) nb_affaires,
      SUM(CASE WHEN af.statut IN ('mandat','vente') THEN 1 ELSE 0 END) nb_gagnees,
      SUM(af.commission) commissions
    FROM apporteurs ap LEFT JOIN affaires af ON af.apporteur_id = ap.id
    GROUP BY ap.id HAVING nb_affaires > 0 ORDER BY nb_gagnees DESC, nb_affaires DESC LIMIT 10
  `).all();
  const commAPayer = db.prepare("SELECT COALESCE(SUM(commission),0) s FROM affaires WHERE statut='vente' AND commission_payee=0").get().s;
  const commPayees = db.prepare("SELECT COALESCE(SUM(commission),0) s FROM affaires WHERE commission_payee=1").get().s;
  res.json({ parStatut, topApporteurs, commissions_a_payer: commAPayer, commissions_payees: commPayees });
});

// Liste des affaires (avec nom apporteur) pour le pipeline
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT af.*, ap.nom AS apporteur_nom, u.prenom AS agent_prenom, u.nom AS agent_nom
    FROM affaires af
    JOIN apporteurs ap ON ap.id = af.apporteur_id
    LEFT JOIN users u ON u.id = af.agent_id
    ORDER BY af.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const a = db.prepare(`SELECT af.*, ap.nom AS apporteur_nom FROM affaires af JOIN apporteurs ap ON ap.id = af.apporteur_id WHERE af.id = ?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Affaire non trouvée' });
  res.json(a);
});

// Signaler une affaire
router.post('/', (req, res) => {
  const { apporteur_id, description } = req.body;
  if (!apporteur_id || !description) return res.status(400).json({ error: 'apporteur_id et description requis' });
  const ap = db.prepare('SELECT id FROM apporteurs WHERE id = ?').get(apporteur_id);
  if (!ap) return res.status(404).json({ error: 'Apporteur inconnu' });
  const r = db.prepare('INSERT INTO affaires (apporteur_id, agent_id, description, statut) VALUES (?,?,?,?)')
    .run(apporteur_id, req.user.id, description, 'signale');
  res.status(201).json({ id: r.lastInsertRowid });
});

// Faire avancer / saisir honoraires / taux / payée → recalcule commission
router.put('/:id', (req, res) => {
  const a = db.prepare('SELECT id FROM affaires WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Affaire non trouvée' });
  const { statut, description, honoraires, taux_commission, commission_payee } = req.body;
  if (statut !== undefined && !STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  db.prepare(`UPDATE affaires SET
      statut = COALESCE(?, statut),
      description = COALESCE(?, description),
      honoraires = COALESCE(?, honoraires),
      taux_commission = ?,
      commission_payee = COALESCE(?, commission_payee),
      updated_at = datetime('now')
    WHERE id = ?`)
    .run(statut ?? null, description ?? null,
      honoraires === undefined ? null : honoraires,
      taux_commission === undefined ? null : taux_commission,
      commission_payee === undefined ? null : (commission_payee ? 1 : 0),
      req.params.id);
  calculerCommission(req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM affaires WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

Note implémenteur : `taux_commission = ?` est mis à jour directement (pas COALESCE) car une valeur `null` est volontaire (= utiliser le taux par défaut). Le body envoie `taux_commission: null` pour réinitialiser. `calculerCommission` lit la valeur finale.

- [ ] **Step 2: Monter la route**

Après `app.use('/api/apporteurs', ...)`, ajouter :

```js
app.use('/api/affaires', require('./routes/affaireRoutes'));
```

- [ ] **Step 3: Tester le cycle complet (signaler → vente → commission → stats)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/af.log 2>&1 &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
APID=$(curl -s -X POST http://localhost:3002/api/apporteurs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nom":"Notaire Test","type":"notaire"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).id)")
AFID=$(curl -s -X POST http://localhost:3002/api/affaires -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"apporteur_id\":$APID,\"description\":\"Vendeur rue de la Paix\"}" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).id)")
echo "Affaire créée id=$AFID"
echo "Passer en vente avec 9000 honoraires:"
curl -s -X PUT http://localhost:3002/api/affaires/$AFID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"statut":"vente","honoraires":9000}' >/dev/null
curl -s http://localhost:3002/api/affaires/$AFID -H "Authorization: Bearer $TOKEN" | node -e "const a=JSON.parse(require('fs').readFileSync(0));console.log('  commission (10% de 9000):',a.commission, a.commission===900?'OK':'ECHEC')"
echo "Stats:"; curl -s http://localhost:3002/api/affaires/stats -H "Authorization: Bearer $TOKEN" | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log('  à payer:',s.commissions_a_payer,'| top apporteurs:',s.topApporteurs.length)"
pkill -f "server/src/index.js"
```

Expected: `commission (10% de 9000): 900 OK` ; stats avec `à payer: 900`.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/affaireRoutes.js server/src/index.js
git commit -q -m "feat(api): CRUD affaires + calcul commission + stats apporteurs"
```

---

### Task A4 : Réglage du taux par défaut (admin)

**Files:**
- Modify: `server/src/routes/adminRoutes.js`

- [ ] **Step 1: Ajouter les routes taux dans `adminRoutes.js`**

Avant `module.exports` de adminRoutes.js, ajouter :

```js
// Taux de commission d'apport par défaut (% des honoraires)
router.get('/apporteurs', (req, res) => {
  const v = db.prepare("SELECT valeur FROM ponderations WHERE cle = 'apporteurs.taux_defaut'").get();
  res.json({ taux_defaut: parseFloat(v?.valeur || 10) });
});
router.put('/apporteurs', (req, res) => {
  const t = parseFloat(req.body.taux_defaut);
  if (isNaN(t) || t < 0 || t > 100) return res.status(400).json({ error: 'taux invalide (0-100)' });
  db.prepare("INSERT OR REPLACE INTO ponderations (cle, valeur) VALUES ('apporteurs.taux_defaut', ?)").run(t);
  res.json({ ok: true });
});
```

(Ces routes sont déjà sous `requireRole('manager','admin')` car `adminRoutes.js` applique ce middleware globalement via `router.use(...)`.)

- [ ] **Step 2: Tester**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/t.log 2>&1 &
sleep 2
MGR=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "GET taux:"; curl -s http://localhost:3002/api/admin/apporteurs -H "Authorization: Bearer $MGR"
echo ""
echo "PUT taux=12:"; curl -s -X PUT http://localhost:3002/api/admin/apporteurs -H "Authorization: Bearer $MGR" -H "Content-Type: application/json" -d '{"taux_defaut":12}'
pkill -f "server/src/index.js"
```

Expected: `{"taux_defaut":10}` puis `{"ok":true}`.

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/adminRoutes.js
git commit -q -m "feat(api): réglage du taux de commission d'apport par défaut"
```

---

## PALIER B — Frontend

### Task B1 : Navigation — ajouter l'onglet Apporteurs

**Files:**
- Modify: `client/src/components/NavTabs.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/CartePage.jsx`
- Modify: `client/src/pages/SecteursPage.jsx`

- [ ] **Step 1: Étendre `NavTabs.jsx`**

Dans le tableau `tabs`, ajouter une entrée :

```jsx
    { id: 'apporteurs', label: 'Apporteurs', icon: 'handshake' },
```

(le tableau complet devient : ciblage / terrain / apporteurs)

- [ ] **Step 2: Router dans `App.jsx`**

Dans la fonction `Inner`, ajouter avant le `return <CartePage ... />` final :

```jsx
  if (page === 'apporteurs') return <ApporteursPage onNav={setPage} />
```

Et ajouter l'import en haut :

```jsx
import ApporteursPage from './pages/ApporteursPage'
```

- [ ] **Step 3: Propager la navigation depuis CartePage et SecteursPage**

Dans `CartePage.jsx`, le `<NavTabs ... onChange=...>` existant doit gérer `apporteurs`. Remplacer le `onChange` du NavTabs par :

```jsx
            onChange={(id) => { if (id === 'terrain') onNav('secteurs'); else if (id === 'apporteurs') onNav('apporteurs') }}
```

Dans `SecteursPage.jsx`, dans le header, à côté du bouton « Ciblage », ajouter un bouton « Apporteurs » :

```jsx
          <button onClick={() => onNav('apporteurs')} className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1"><Icon name="handshake" size="sm" /> Apporteurs</button>
```

- [ ] **Step 4: Créer un stub `ApporteursPage` pour que le build passe**

Créer `client/src/pages/ApporteursPage.jsx` :

```jsx
export default function ApporteursPage() { return <div className="p-6">Apporteurs (à venir)</div> }
```

- [ ] **Step 5: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src
git commit -q -m "feat(client): navigation onglet Apporteurs + stub page"
```

Expected: build OK.

---

### Task B2 : Page Apporteurs — onglet Annuaire + modale apporteur

**Files:**
- Modify (remplace le stub): `client/src/pages/ApporteursPage.jsx`
- Create: `client/src/components/ApporteurModal.jsx`

- [ ] **Step 1: Créer `client/src/components/ApporteurModal.jsx`**

```jsx
import { useState } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from './ui/Icon'

const TYPES = [
  ['concierge_gardien', 'Concierge / gardien'],
  ['commercant', 'Commerçant'],
  ['artisan', 'Artisan'],
  ['notaire', 'Notaire'],
  ['particulier', 'Particulier'],
  ['autre', 'Autre'],
]
export default function ApporteurModal({ apporteur, onClose, onSaved }) {
  const isNew = !apporteur
  const [form, setForm] = useState(apporteur || { nom: '', type: 'autre', commune: '', telephone: '', email: '', note: '', actif: 1 })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => {
    if (!form.nom) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      if (isNew) await api.post('/apporteurs', form)
      else await api.put(`/apporteurs/${apporteur.id}`, form)
      toast.success(isNew ? 'Apporteur créé' : 'Apporteur mis à jour'); onSaved()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-quai-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-quai-navy">{isNew ? 'Nouvel apporteur' : form.nom}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy"><Icon name="x" size="md" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-quai-muted mb-1">Nom *</label>
            <input className="input" value={form.nom} onChange={e => set('nom', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-quai-muted mb-1">Type</label>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-quai-muted mb-1">Commune</label>
              <input className="input" value={form.commune || ''} onChange={e => set('commune', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-quai-muted mb-1">Téléphone</label>
              <input className="input" type="tel" value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} /></div>
          </div>
          <div><label className="block text-xs font-medium text-quai-muted mb-1">Email</label>
            <input className="input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-quai-muted mb-1">Note / fiabilité</label>
            <textarea className="input resize-none" rows={2} value={form.note || ''} onChange={e => set('note', e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm text-quai-text">
            <input type="checkbox" checked={!!form.actif} onChange={e => set('actif', e.target.checked ? 1 : 0)} /> Actif
          </label>
        </div>
        <div className="p-5 border-t border-quai-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

export const TYPES_APPORTEUR = TYPES
```

- [ ] **Step 2: Créer la structure de `ApporteursPage.jsx` avec l'onglet Annuaire**

Remplacer le stub par :

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'
import ApporteurModal, { TYPES_APPORTEUR } from '../components/ApporteurModal'

const TYPE_LABEL = Object.fromEntries(TYPES_APPORTEUR)

export default function ApporteursPage({ onNav }) {
  const { logout } = useAuth()
  const [onglet, setOnglet] = useState('affaires')

  return (
    <div className="min-h-screen bg-quai-light">
      <header className="bg-quai-navy text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Le Quai" className="h-7 w-auto" />
          <span className="font-display text-sm">Réseau d'apporteurs</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNav('carte')} className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1"><Icon name="map" size="sm" /> Ciblage</button>
          <button onClick={logout} className="text-white/70 hover:text-white p-1.5" aria-label="Déconnexion"><Icon name="log-out" size="md" /></button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex border-b border-quai-border mb-6">
          {[['affaires','Affaires','briefcase'],['annuaire','Apporteurs','users'],['stats','Tableau de bord','bar-chart-3']].map(([id, lbl, ic]) => (
            <button key={id} onClick={() => setOnglet(id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${onglet === id ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
              <Icon name={ic} size="sm" /> {lbl}
            </button>
          ))}
        </div>
        {onglet === 'annuaire' && <Annuaire />}
        {onglet === 'affaires' && <div className="text-quai-muted">Pipeline des affaires (tâche suivante)</div>}
        {onglet === 'stats' && <div className="text-quai-muted">Tableau de bord (tâche suivante)</div>}
      </div>
    </div>
  )
}

function Annuaire() {
  const [list, setList] = useState([])
  const [filtreType, setFiltreType] = useState('')
  const [edit, setEdit] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const load = () => api.get(`/apporteurs${filtreType ? `?type=${filtreType}` : ''}`).then(r => setList(r.data)).catch(() => toast.error('Erreur'))
  useEffect(() => { load() }, [filtreType])
  return (
    <div>
      <PageHeader title="Annuaire des apporteurs" subtitle={`${list.length} apporteur(s)`}>
        <select className="input w-auto" value={filtreType} onChange={e => setFiltreType(e.target.value)}>
          <option value="">Tous types</option>
          {TYPES_APPORTEUR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button onClick={() => setShowNew(true)} className="btn-primary inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Ajouter</button>
      </PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map(a => (
          <button key={a.id} onClick={() => setEdit(a)} className="card text-left hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="font-display font-semibold text-quai-navy">{a.nom}</div>
              {!a.actif && <span className="text-xs text-quai-muted">dormant</span>}
            </div>
            <div className="text-xs text-quai-muted">{TYPE_LABEL[a.type]}{a.commune ? ` · ${a.commune}` : ''}</div>
            <div className="text-xs text-quai-muted mt-1">{a.nb_affaires} affaire(s)</div>
          </button>
        ))}
        {list.length === 0 && <div className="text-quai-muted col-span-2">Aucun apporteur.</div>}
      </div>
      {showNew && <ApporteurModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {edit && <ApporteurModal apporteur={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/pages/ApporteursPage.jsx client/src/components/ApporteurModal.jsx
git commit -q -m "feat(client): page Apporteurs (onglets) + annuaire + modale apporteur"
```

Expected: build OK.

---

### Task B3 : Onglet Affaires (pipeline) + modale affaire

**Files:**
- Create: `client/src/components/AffaireModal.jsx`
- Create: `client/src/components/PipelineAffaires.jsx`
- Modify: `client/src/pages/ApporteursPage.jsx` (brancher l'onglet affaires)

- [ ] **Step 1: Créer `client/src/components/AffaireModal.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from './ui/Icon'

export const STATUTS_AFFAIRE = [
  ['signale', 'Signalé'], ['contacte', 'Contacté'], ['mandat', 'Mandat'], ['vente', 'Vente'], ['perdu', 'Perdu'],
]
const LABEL = Object.fromEntries(STATUTS_AFFAIRE)

// affaire null => création (choix apporteur + description) ; sinon édition (statut, honoraires…)
export default function AffaireModal({ affaire, apporteurs, onClose, onSaved }) {
  const isNew = !affaire
  const [apporteurId, setApporteurId] = useState(affaire?.apporteur_id || '')
  const [description, setDescription] = useState(affaire?.description || '')
  const [statut, setStatut] = useState(affaire?.statut || 'signale')
  const [honoraires, setHonoraires] = useState(affaire?.honoraires || '')
  const [payee, setPayee] = useState(!!affaire?.commission_payee)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      if (isNew) {
        if (!apporteurId || !description) { toast.error('Apporteur et description requis'); setSaving(false); return }
        await api.post('/affaires', { apporteur_id: Number(apporteurId), description })
        toast.success('Affaire signalée')
      } else {
        await api.put(`/affaires/${affaire.id}`, {
          statut, description,
          honoraires: honoraires === '' ? 0 : Number(honoraires),
          commission_payee: payee,
        })
        toast.success('Affaire mise à jour')
      }
      onSaved()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-quai-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-quai-navy">{isNew ? 'Signaler une affaire' : (affaire.apporteur_nom || 'Affaire')}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy"><Icon name="x" size="md" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {isNew ? (
            <>
              <div><label className="block text-xs font-medium text-quai-muted mb-1">Apporteur *</label>
                <select className="input" value={apporteurId} onChange={e => setApporteurId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {apporteurs.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select></div>
              <div><label className="block text-xs font-medium text-quai-muted mb-1">Le tuyau *</label>
                <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex. M. X au 12 rue Y envisage de vendre…" /></div>
            </>
          ) : (
            <>
              <div><label className="block text-xs font-medium text-quai-muted mb-1">Statut</label>
                <select className="input" value={statut} onChange={e => setStatut(e.target.value)}>
                  {STATUTS_AFFAIRE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div><label className="block text-xs font-medium text-quai-muted mb-1">Description</label>
                <textarea className="input resize-none" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
              {(statut === 'vente' || statut === 'mandat') && (
                <>
                  <div><label className="block text-xs font-medium text-quai-muted mb-1">Honoraires agence (€)</label>
                    <input className="input" type="number" value={honoraires} onChange={e => setHonoraires(e.target.value)} placeholder="Ex. 9000" /></div>
                  {affaire.commission > 0 && (
                    <div className="text-sm text-quai-navy bg-quai-gold/10 border border-quai-gold/30 rounded-lg p-2">
                      Commission d'apport : <strong>{affaire.commission.toLocaleString('fr')} €</strong>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-quai-text">
                    <input type="checkbox" checked={payee} onChange={e => setPayee(e.target.checked)} /> Commission payée
                  </label>
                </>
              )}
              <p className="text-[10px] text-quai-muted">Signalé le {new Date(affaire.created_at).toLocaleDateString('fr')} — preuve d'antériorité. Rémunération d'indication (loi Hoguet).</p>
            </>
          )}
        </div>
        <div className="p-5 border-t border-quai-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer `client/src/components/PipelineAffaires.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from './ui/Icon'
import AffaireModal, { STATUTS_AFFAIRE } from './AffaireModal'

const COULEUR = { signale: '#6B6660', contacte: '#2d2d6b', mandat: '#C9A96E', vente: '#2e7d32', perdu: '#8B1E1E' }

export default function PipelineAffaires() {
  const [affaires, setAffaires] = useState([])
  const [apporteurs, setApporteurs] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [edit, setEdit] = useState(null)

  const load = () => {
    api.get('/affaires').then(r => setAffaires(r.data)).catch(() => toast.error('Erreur'))
    api.get('/apporteurs').then(r => setApporteurs(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display font-semibold text-quai-navy">Pipeline des affaires</h2>
        <button onClick={() => setShowNew(true)} className="btn-primary inline-flex items-center gap-1.5" disabled={apporteurs.length === 0}>
          <Icon name="plus" size="sm" /> Signaler une affaire
        </button>
      </div>
      {apporteurs.length === 0 && <div className="text-quai-muted text-sm mb-4">Ajoutez d'abord un apporteur (onglet Apporteurs) pour signaler une affaire.</div>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUTS_AFFAIRE.map(([statut, label]) => {
          const items = affaires.filter(a => a.statut === statut)
          return (
            <div key={statut} className="bg-white rounded-xl border border-quai-border p-2 min-h-[120px]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-quai-navy mb-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COULEUR[statut] }} /> {label} <span className="text-quai-muted">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map(a => (
                  <button key={a.id} onClick={() => setEdit(a)} className="w-full text-left bg-quai-light rounded-lg p-2 hover:shadow-sm transition-shadow">
                    <div className="text-xs font-medium text-quai-navy truncate">{a.apporteur_nom}</div>
                    <div className="text-xs text-quai-muted line-clamp-2">{a.description}</div>
                    {a.commission > 0 && <div className="text-[10px] text-quai-navy mt-1">{a.commission.toLocaleString('fr')} € {a.commission_payee ? '· payée' : ''}</div>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {showNew && <AffaireModal apporteurs={apporteurs} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {edit && <AffaireModal affaire={edit} apporteurs={apporteurs} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}
```

Note implémenteur : `line-clamp-2` nécessite le plugin Tailwind line-clamp (inclus par défaut dans Tailwind 3.3+). Si le build se plaint, remplacer `line-clamp-2` par `truncate`.

- [ ] **Step 3: Brancher l'onglet affaires dans `ApporteursPage.jsx`**

En haut, ajouter l'import :

```jsx
import PipelineAffaires from '../components/PipelineAffaires'
```

Remplacer la ligne stub de l'onglet affaires :

```jsx
        {onglet === 'affaires' && <PipelineAffaires />}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src
git commit -q -m "feat(client): pipeline des affaires + modale signalement/suivi + commission"
```

Expected: build OK.

---

### Task B4 : Onglet Tableau de bord + réglage du taux

**Files:**
- Create: `client/src/components/StatsApporteurs.jsx`
- Modify: `client/src/pages/ApporteursPage.jsx` (brancher l'onglet stats)

- [ ] **Step 1: Créer `client/src/components/StatsApporteurs.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { STATUTS_AFFAIRE } from './AffaireModal'

const LABEL = Object.fromEntries(STATUTS_AFFAIRE)

export default function StatsApporteurs() {
  const { user } = useAuth()
  const isManager = ['manager', 'admin'].includes(user?.role)
  const [stats, setStats] = useState(null)
  const [taux, setTaux] = useState('')

  useEffect(() => {
    api.get('/affaires/stats').then(r => setStats(r.data)).catch(() => toast.error('Erreur'))
    if (isManager) api.get('/admin/apporteurs').then(r => setTaux(r.data.taux_defaut)).catch(() => {})
  }, [isManager])

  const saveTaux = async () => {
    try { await api.put('/admin/apporteurs', { taux_defaut: Number(taux) }); toast.success('Taux mis à jour') }
    catch { toast.error('Erreur') }
  }

  if (!stats) return <div className="text-quai-muted animate-pulse">Chargement…</div>
  const parStatut = Object.fromEntries(stats.parStatut.map(s => [s.statut, s.c]))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><div className="text-2xl font-bold text-quai-navy">{(parStatut.mandat || 0) + (parStatut.vente || 0)}</div><div className="text-xs text-quai-muted">Mandats + ventes</div></div>
        <div className="card"><div className="text-2xl font-bold text-quai-navy">{stats.parStatut.reduce((a, s) => a + s.c, 0)}</div><div className="text-xs text-quai-muted">Affaires totales</div></div>
        <div className="card"><div className="text-2xl font-bold text-amber-600">{stats.commissions_a_payer.toLocaleString('fr')} €</div><div className="text-xs text-quai-muted">Commissions à payer</div></div>
        <div className="card"><div className="text-2xl font-bold text-emerald-600">{stats.commissions_payees.toLocaleString('fr')} €</div><div className="text-xs text-quai-muted">Commissions payées</div></div>
      </div>

      <div className="card">
        <h3 className="font-display font-semibold text-quai-navy mb-3">Top apporteurs</h3>
        {stats.topApporteurs.length === 0 ? <div className="text-quai-muted text-sm">Aucune affaire encore.</div> : (
          <div className="space-y-2">
            {stats.topApporteurs.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-quai-navy font-medium">{a.nom}</span>
                <span className="text-quai-muted">{a.nb_gagnees} gagnée(s) / {a.nb_affaires} · {(a.commissions || 0).toLocaleString('fr')} €</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-display font-semibold text-quai-navy mb-3">Affaires par statut</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STATUTS_AFFAIRE.map(([k, l]) => (
            <div key={k} className="text-center p-3 bg-quai-light rounded-lg border border-quai-border">
              <div className="text-xl font-bold text-quai-navy">{parStatut[k] || 0}</div>
              <div className="text-xs text-quai-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {isManager && (
        <div className="card">
          <h3 className="font-display font-semibold text-quai-navy mb-2">Taux de commission par défaut</h3>
          <p className="text-xs text-quai-muted mb-3">% des honoraires d'agence reversé à l'apporteur (rémunération d'indication, loi Hoguet).</p>
          <div className="flex items-center gap-3">
            <input type="number" min="0" max="100" step="0.5" className="input w-28" value={taux} onChange={e => setTaux(e.target.value)} />
            <span className="text-quai-muted">%</span>
            <button onClick={saveTaux} className="btn-primary">Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Brancher l'onglet stats dans `ApporteursPage.jsx`**

Ajouter l'import :

```jsx
import StatsApporteurs from '../components/StatsApporteurs'
```

Remplacer la ligne stub de l'onglet stats :

```jsx
        {onglet === 'stats' && <StatsApporteurs />}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src
git commit -q -m "feat(client): tableau de bord apporteurs (KPIs, top, commissions) + réglage taux"
```

Expected: build OK.

---

## PALIER C — Vérification & déploiement

### Task C1 : Vérification end-to-end + base + push

**Files:** aucun (vérification)

- [ ] **Step 1: Zéro emoji dans le nouveau code**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' client/src/pages/ApporteursPage.jsx client/src/components/ApporteurModal.jsx client/src/components/AffaireModal.jsx client/src/components/PipelineAffaires.jsx client/src/components/StatsApporteurs.jsx 2>/dev/null && echo "EMOJI!" || echo "✓ aucun"
```

Expected: `✓ aucun`.

- [ ] **Step 2: Build prod + parcours API complet**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm run build 2>&1 | grep -iE "error|built in" | tail -1
JWT_SECRET=verif PORT=3002 npm start >/tmp/c.log 2>&1 &
sleep 2.5
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "apporteurs:"; curl -s http://localhost:3002/api/apporteurs -H "Authorization: Bearer $TOKEN" | node -e "console.log('  ',JSON.parse(require('fs').readFileSync(0)).length)"
echo "affaires/stats:"; curl -s http://localhost:3002/api/affaires/stats -H "Authorization: Bearer $TOKEN" | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log('  à payer',s.commissions_a_payer,'payées',s.commissions_payees)"
echo "title:"; curl -s http://localhost:3002/ | grep -o "<title>[^<]*</title>"
pkill -f "server/src/index.js"
```

Expected: build OK ; routes répondent ; title présent.

- [ ] **Step 3: Nettoyer les données de test + checkpoint WAL + recompresser la base**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
# supprimer les apporteurs/affaires de test créés pendant les vérifs
node -e "const {db}=require('./server/src/database');db.prepare('DELETE FROM affaires').run();db.prepare('DELETE FROM apporteurs').run();console.log('données test apporteurs nettoyées')"
node -e "const Database=require('better-sqlite3');const db=new Database('server/data/prospect.db');db.pragma('wal_checkpoint(TRUNCATE)');db.close()"
gzip -c server/data/prospect.db > server/data/prospect.db.gz
ls -lh server/data/prospect.db.gz | awk '{print "base compressée:", $5}'
git add server/data/prospect.db.gz
git commit -q -m "chore(deploy): base recompressée (schéma Module 3)"
```

Note : on nettoie les apporteurs/affaires de test pour ne pas committer de fausses données. Les secteurs/passages de test du Module 2 peuvent aussi être nettoyés si souhaité (optionnel).

- [ ] **Step 4: Mettre à jour le README + push**

Ajouter une section « Module 3 — Apporteurs » au README (annuaire, affaires, commissions, loi Hoguet).

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add README.md
git commit -q -m "docs: README — Module 3 réseau d'apporteurs"
git push origin main 2>&1 | tail -3
```

Expected: push OK ; Railway redéploie.

- [ ] **Step 5: Vérifier la prod**

```bash
sleep 90
BASE="https://immo-prospect-production.up.railway.app"
MGR=$(curl -s -m 15 -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
# route Module 3 (n'existait pas) -> doit renvoyer un tableau JSON, pas du HTML
curl -s -m 15 "$BASE/api/apporteurs" -H "Authorization: Bearer $MGR" | head -c 1 | grep -q '\[' && echo "✓ Module 3 actif en prod" || echo "déploiement en cours, re-tester"
```

Expected: `✓ Module 3 actif en prod` (peut nécessiter d'attendre la fin du redéploiement).

---

## Definition of Done (rappel spec §9)
- [x] Créer/modifier un apporteur (annuaire type/commune/fiabilité)
- [x] Signaler une affaire (tuyau libre daté)
- [x] Faire avancer dans le pipeline
- [x] Honoraires → commission calculée auto ; payée/non payée
- [x] Tableau de bord (par statut, top apporteurs, commissions)
- [x] Taux par défaut réglable (manager/admin)
- [x] Build + run + déploiement vérifiés

## Hors périmètre (rappel)
Génération PDF de convention d'apport, notifications aux apporteurs, comptabilité avancée, lien automatique affaire↔adresse du Module 2.
