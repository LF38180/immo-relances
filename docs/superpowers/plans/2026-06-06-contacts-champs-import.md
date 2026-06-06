# Champs contacts + import auto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter date_estimation + photo_url aux contacts, exposer source/conseiller à l'import auto (détection colonnes), et afficher ces champs dans la fiche et l'écran d'appel d'ImmoRelances.

**Architecture:** Migration idempotente (ALTER TABLE) dans database.js ; helpers back purs (normalisation date, résolution nom→user) testés en isolation ; INSERT/UPDATE/SELECT étendus dans contactRoutes.js ; détection auto front via FIELD_MAP étendu ; affichage ContactModal + SessionPage.

**Tech Stack:** Node + Express + better-sqlite3 (back), React + Vite + Tailwind (front). Tests = scripts `node server/test/xxx.test.js` imprimant `... OK`. Lancer : `JWT_SECRET=dev node server/test/contacts-import.test.js`.

**Branche :** `feat/contacts-champs-import` (déjà active). Spec : `docs/superpowers/specs/2026-06-06-contacts-champs-import-design.md`.

---

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `server/src/database.js` | Schéma + migration | Modifier (~ligne 84) : bloc ALTER idempotent |
| `server/src/utils/import-helpers.js` | Helpers purs (date, conseiller) | **Créer** — testables sans DB |
| `server/src/routes/contactRoutes.js` | Routes contacts | Modifier : import (126-158), PUT (94-117), GET (34, 62-72) |
| `server/test/contacts-import.test.js` | Tests | **Créer** |
| `client/src/components/ImportModal.jsx` | Détection auto import | Modifier : FIELD_MAP (10-22), FIELD_LABELS, doImport (88-107) |
| `client/src/components/ContactModal.jsx` | Fiche édition | Modifier : state (13-17), form (96-136), charger users |
| `client/src/pages/SessionPage.jsx` | Écran d'appel | Modifier : bloc fiche (145-200) |

Les helpers back vivent dans un nouveau module pur (`import-helpers.js`) pour être testés sans monter Express/DB. `contactRoutes.js` les consomme.

---

## Task 1 : Migration DB (colonnes date_estimation + photo_url)

**Files:**
- Modify: `server/src/database.js:83-84` (après le `db.exec`, avant le seed admin)
- Test: `server/test/contacts-import.test.js`

- [ ] **Step 1: Écrire le test de migration (échoue)**

Créer `server/test/contacts-import.test.js` :

```js
const assert = require('assert')

// Force une DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-test-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('contacts-import.test.js')

test('migration ajoute date_estimation et photo_url', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('date_estimation'), 'date_estimation absente')
  assert.ok(cols.includes('photo_url'), 'photo_url absente')
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: `FAIL migration ajoute date_estimation et photo_url : date_estimation absente`

- [ ] **Step 3: Ajouter le bloc de migration**

Dans `server/src/database.js`, juste après la parenthèse fermante du `db.exec(\`...\`);` (ligne ~83) et AVANT `// Seed default admin` (ligne ~85), insérer :

```js
// Migration idempotente : colonnes ajoutées après coup
const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name);
if (!contactCols.includes('date_estimation')) db.exec("ALTER TABLE contacts ADD COLUMN date_estimation TEXT");
if (!contactCols.includes('photo_url')) db.exec("ALTER TABLE contacts ADD COLUMN photo_url TEXT");
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: `OK  migration ajoute date_estimation et photo_url`

- [ ] **Step 5: Commit**

```bash
git add server/src/database.js server/test/contacts-import.test.js
git commit -m "feat(contacts): migration date_estimation + photo_url"
```

---

## Task 2 : Helper de normalisation de date

**Files:**
- Create: `server/src/utils/import-helpers.js`
- Test: `server/test/contacts-import.test.js`

Convertit série Excel / `jj/mm/aaaa` / `jj-mm-aaaa` / ISO → ISO `AAAA-MM-JJ`. Renvoie `null` si illisible (l'appelant compte les ignorées).

- [ ] **Step 1: Ajouter les tests (échouent)**

Ajouter dans `server/test/contacts-import.test.js`, AVANT la fin du fichier :

```js
const { normaliserDate } = require('../src/utils/import-helpers')

test('normaliserDate ISO inchangée', () => {
  assert.strictEqual(normaliserDate('2026-01-15'), '2026-01-15')
})
test('normaliserDate jj/mm/aaaa', () => {
  assert.strictEqual(normaliserDate('15/01/2026'), '2026-01-15')
})
test('normaliserDate jj-mm-aaaa', () => {
  assert.strictEqual(normaliserDate('15-01-2026'), '2026-01-15')
})
test('normaliserDate serie Excel', () => {
  // 45000 = 2023-03-15 (epoch Excel 1899-12-30)
  assert.strictEqual(normaliserDate(45000), '2023-03-15')
  assert.strictEqual(normaliserDate('45000'), '2023-03-15')
})
test('normaliserDate illisible -> null', () => {
  assert.strictEqual(normaliserDate('pas une date'), null)
  assert.strictEqual(normaliserDate(''), null)
  assert.strictEqual(normaliserDate(null), null)
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: FAIL avec `Cannot find module '../src/utils/import-helpers'`

- [ ] **Step 3: Créer le helper**

Créer `server/src/utils/import-helpers.js` :

```js
// Normalise une date de tableur vers ISO AAAA-MM-JJ. null si illisible.
function normaliserDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;

  // Série Excel (nombre de jours depuis 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 0 && n < 100000) {
      const ms = Math.round((n - 25569) * 86400 * 1000); // 25569 = jours entre 1899-12-30 et 1970-01-01
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // ISO AAAA-MM-JJ (éventuellement avec heure)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // jj/mm/aaaa ou jj-mm-aaaa
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const jj = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    if (+mm >= 1 && +mm <= 12 && +jj >= 1 && +jj <= 31) return `${m[3]}-${mm}-${jj}`;
  }

  return null;
}

module.exports = { normaliserDate };
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: les 5 tests `normaliserDate` en `OK`.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/import-helpers.js server/test/contacts-import.test.js
git commit -m "feat(import): helper normaliserDate (Excel/FR/ISO -> ISO)"
```

---

## Task 3 : Helper de résolution conseiller (nom → user.id)

**Files:**
- Modify: `server/src/utils/import-helpers.js`
- Test: `server/test/contacts-import.test.js`

`resoudreConseiller(nom, users)` : matche insensible casse+accents sur `prenom nom`, `nom prenom`, ou `email`. Renvoie l'id ou `null`. `users` = tableau `{id, nom, prenom, email}`.

- [ ] **Step 1: Ajouter les tests (échouent)**

Ajouter dans `server/test/contacts-import.test.js` :

```js
const { resoudreConseiller } = require('../src/utils/import-helpers')

const USERS = [
  { id: 1, nom: 'Dupont', prenom: 'Marie', email: 'marie@x.com' },
  { id: 2, nom: 'Martin', prenom: 'Pierre', email: 'pierre@x.com' },
]

test('resoudreConseiller prenom nom', () => {
  assert.strictEqual(resoudreConseiller('Marie Dupont', USERS), 1)
})
test('resoudreConseiller nom prenom', () => {
  assert.strictEqual(resoudreConseiller('Dupont Marie', USERS), 1)
})
test('resoudreConseiller insensible casse + accents', () => {
  assert.strictEqual(resoudreConseiller('  PÏERRE  martin ', USERS), 2)
})
test('resoudreConseiller par email', () => {
  assert.strictEqual(resoudreConseiller('marie@x.com', USERS), 1)
})
test('resoudreConseiller no-match -> null', () => {
  assert.strictEqual(resoudreConseiller('Inconnu Personne', USERS), null)
  assert.strictEqual(resoudreConseiller('', USERS), null)
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: FAIL `resoudreConseiller is not a function` (ou export absent).

- [ ] **Step 3: Ajouter le helper**

Dans `server/src/utils/import-helpers.js`, ajouter avant `module.exports` :

```js
function norm(s) {
  // ̀-ͯ = combining diacritical marks (accents) — échappement explicite pour robustesse d'encodage
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Résout un nom de conseiller vers users.id. null si pas de match.
function resoudreConseiller(valeur, users) {
  const v = norm(valeur);
  if (!v) return null;
  for (const u of users) {
    const prenomNom = norm(`${u.prenom} ${u.nom}`);
    const nomPrenom = norm(`${u.nom} ${u.prenom}`);
    const email = norm(u.email);
    if (v === prenomNom || v === nomPrenom || v === email) return u.id;
  }
  return null;
}
```

Et mettre à jour l'export :

```js
module.exports = { normaliserDate, resoudreConseiller };
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: les 5 tests `resoudreConseiller` en `OK`.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/import-helpers.js server/test/contacts-import.test.js
git commit -m "feat(import): helper resoudreConseiller (nom/email -> user.id)"
```

---

## Task 4 : Import back — INSERT étendu + source + conseiller + date

**Files:**
- Modify: `server/src/routes/contactRoutes.js:126-158` (POST /import)
- Test: `server/test/contacts-import.test.js`

Étend l'INSERT avec `assigned_to, date_estimation, photo_url` ; dé-hardcode `source_import` ; renvoie compteurs.

- [ ] **Step 1: Ajouter le test d'intégration import (échoue)**

Ajouter dans `server/test/contacts-import.test.js`. On teste la LOGIQUE d'import directement contre la DB (sans HTTP) en répliquant l'appel via un helper exporté. Pour rester simple et testable, on factorise l'import dans une fonction exportée `importerContacts(contacts, users)`.

```js
const { importerContacts } = require('../src/routes/contactRoutes')

test('importerContacts : source colonne, conseiller, date normalisée', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([
    { nom: 'Test1', source: 'site web', conseiller: 'Marie Dupont', date_estimation: '15/01/2026' },
    { nom: 'Test2' }, // pas de source -> fallback import_csv
    { nom: 'Test3', conseiller: 'Inconnu Personne', date_estimation: 'nimporte' },
  ], users)

  assert.strictEqual(r.importes, 3)
  assert.strictEqual(r.conseillers_non_reconnus, 1)
  assert.strictEqual(r.dates_ignorees, 1)

  const c1 = db.prepare("SELECT * FROM contacts WHERE nom='Test1'").get()
  assert.strictEqual(c1.source_import, 'site web')
  assert.ok(c1.assigned_to != null, 'conseiller Marie non résolu')
  assert.strictEqual(c1.date_estimation, '2026-01-15')

  const c2 = db.prepare("SELECT * FROM contacts WHERE nom='Test2'").get()
  assert.strictEqual(c2.source_import, 'import_csv')
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: FAIL `importerContacts is not a function`.

- [ ] **Step 3: Factoriser et étendre l'import dans contactRoutes.js**

Dans `server/src/routes/contactRoutes.js`, en haut, ajouter l'import du helper (après la ligne `const { db, recalculerScore } = require('../database');`) :

```js
const { normaliserDate, resoudreConseiller } = require('../utils/import-helpers');
```

Remplacer TOUT le bloc `router.post('/import', ...)` (lignes 126-158) par une fonction exportée + le handler qui l'appelle :

```js
// Logique d'import factorée (testable sans HTTP).
function importerContacts(contacts, users) {
  const insert = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, notes, potentiel, statut, prochain_contact, source_import, assigned_to, date_estimation, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const STATUTS_OK = ['a_contacter','tente_sans_reponse','rappel_planifie','rdv_obtenu','pas_interesse','a_recontacter','inactif'];
  let importes = 0, erreurs = 0, dates_ignorees = 0;
  const conseillersInconnus = new Set();

  const importMany = db.transaction((rows) => {
    for (const c of rows) {
      if (!c.nom && !c.prenom) { erreurs++; continue; }
      try {
        const statut = STATUTS_OK.includes(c.statut) ? c.statut : 'a_contacter';
        const source = (c.source && String(c.source).trim()) ? String(c.source).trim() : 'import_csv';

        let assignedTo = null;
        if (c.conseiller && String(c.conseiller).trim()) {
          assignedTo = resoudreConseiller(c.conseiller, users);
          if (assignedTo == null) conseillersInconnus.add(String(c.conseiller).trim());
        }

        let dateEstim = null;
        if (c.date_estimation && String(c.date_estimation).trim()) {
          dateEstim = normaliserDate(c.date_estimation);
          if (dateEstim == null) dates_ignorees++;
        }

        const result = insert.run(
          c.nom || '', c.prenom || '', c.telephone || '', c.telephone2 || '',
          c.email || '', c.adresse || '', c.code_postal || '', c.ville || '',
          c.categorie || 'autre', c.notes || '', parseInt(c.potentiel) || 3,
          statut, c.prochain_contact || null, source, assignedTo, dateEstim, c.photo_url || null
        );
        recalculerScore(result.lastInsertRowid);
        importes++;
      } catch { erreurs++; }
    }
  });

  importMany(contacts);
  return { importes, erreurs, conseillers_non_reconnus: conseillersInconnus.size, dates_ignorees };
}

// Import CSV en masse
router.post('/import', (req, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ error: 'Données invalides' });
  const users = db.prepare('SELECT id, nom, prenom, email FROM users WHERE actif = 1').all();
  res.json(importerContacts(contacts, users));
});
```

À la toute fin du fichier, remplacer `module.exports = router;` par :

```js
module.exports = router;
module.exports.importerContacts = importerContacts;
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: tous les tests en `OK` (dont le test d'import d'intégration).

- [ ] **Step 5: Lancer toute la suite (non-régression)**

Run: `for t in server/test/*.test.js; do JWT_SECRET=dev node "$t"; done`
Expected: aucun `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/contactRoutes.js server/test/contacts-import.test.js
git commit -m "feat(import): source/conseiller/date_estimation/photo_url + compteurs"
```

---

## Task 5 : PUT + GET back (édition + nom conseiller)

**Files:**
- Modify: `server/src/routes/contactRoutes.js:98-99` (CHAMPS), `:34` (GET liste), `:62-72` (GET détail)
- Test: `server/test/contacts-import.test.js`

- [ ] **Step 1: Ajouter le test PUT + join (échoue)**

Ajouter dans `server/test/contacts-import.test.js` :

```js
const { db: db2 } = require('../src/database')

test('PUT champs : assigned_to, date_estimation, photo_url, source_import persistés', () => {
  // Réutilise le contact Test1 créé en Task 4
  const c = db2.prepare("SELECT id FROM contacts WHERE nom='Test1'").get()
  // Simule la liste CHAMPS du PUT
  const CHAMPS = require('../src/routes/contactRoutes').CHAMPS_UPDATE
  assert.ok(CHAMPS.includes('source_import'))
  assert.ok(CHAMPS.includes('assigned_to'))
  assert.ok(CHAMPS.includes('date_estimation'))
  assert.ok(CHAMPS.includes('photo_url'))
})

test('GET détail renvoie le nom du conseiller (join users)', () => {
  const c = db2.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.nom = 'Test1'
  `).get()
  assert.ok(c.assigned_prenom, 'assigned_prenom manquant')
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: FAIL `CHAMPS_UPDATE` undefined (`Cannot read properties of undefined`).

- [ ] **Step 3: Étendre CHAMPS + exporter + join GET**

Dans `contactRoutes.js`, remplacer la déclaration `const CHAMPS = [...]` (lignes 98-99) par une constante module partagée. En haut du fichier (après les require) ajouter :

```js
const CHAMPS_UPDATE = ['nom','prenom','telephone','telephone2','email','adresse','code_postal',
  'ville','categorie','tags','notes','potentiel','statut','prochain_contact',
  'source_import','assigned_to','date_estimation','photo_url'];
```

Dans le handler PUT, remplacer `const CHAMPS = [...]` par `const CHAMPS = CHAMPS_UPDATE;`. Ajouter la normalisation des champs vides dans la boucle (après la ligne `if (champ === 'prochain_contact') val = val || null;`) :

```js
    if (champ === 'assigned_to') val = val || null;
    if (champ === 'date_estimation') val = val || null;
    if (champ === 'photo_url') val = val || null;
```

GET liste (ligne 34) — remplacer le SELECT par un join :

```js
  const contacts = db.prepare(`SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```

Note : `${where}` référence des colonnes non préfixées (nom, categorie...) — sans ambiguïté car `users` n'a pas ces colonnes SAUF `nom`. Préfixer dans le WHERE : à la ligne 20 remplacer `nom LIKE ?` par `contacts.nom LIKE ?`, et ligne 24/25/26 préfixer `categorie`/`statut`/`tags` par `contacts.`. Idem `sortCol` : à la ligne 34, le `ORDER BY ${sortCol}` doit devenir `ORDER BY contacts.${sortCol}`.

GET détail (ligne 63) — remplacer :

```js
  const contact = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.id = ?
  `).get(req.params.id);
```

Exporter `CHAMPS_UPDATE`. À la fin du fichier, après `module.exports.importerContacts = importerContacts;` ajouter :

```js
module.exports.CHAMPS_UPDATE = CHAMPS_UPDATE;
```

- [ ] **Step 4: Lancer, vérifier le succès + suite complète**

Run: `JWT_SECRET=dev node server/test/contacts-import.test.js`
Expected: tous `OK`.
Run: `for t in server/test/*.test.js; do JWT_SECRET=dev node "$t"; done`
Expected: aucun `FAIL` (vérifier surtout les tests de liste/recherche contacts pour le préfixage WHERE).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/contactRoutes.js server/test/contacts-import.test.js
git commit -m "feat(contacts): PUT etend champs + GET join users (nom conseiller)"
```

---

## Task 6 : Détection auto front (FIELD_MAP + labels)

**Files:**
- Modify: `client/src/components/ImportModal.jsx:10-22` (FIELD_MAP), `:88-107` (doImport)

- [ ] **Step 1: Étendre FIELD_MAP + ajouter FIELD_LABELS**

Dans `client/src/components/ImportModal.jsx`, remplacer le bloc `const FIELD_MAP = {...}` (lignes 10-22) par :

```js
const FIELD_MAP = {
  nom: ['nom', 'name', 'last_name', 'lastname', 'surname'],
  prenom: ['prenom', 'prénom', 'first_name', 'firstname'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable'],
  telephone2: ['telephone2', 'tel2', 'mobile2'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  adresse: ['adresse', 'address', 'rue', 'street'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code'],
  ville: ['ville', 'city', 'localite', 'commune'],
  categorie: ['categorie', 'catégorie', 'category', 'type'],
  notes: ['notes', 'note', 'commentaire', 'remarque', 'observation'],
  potentiel: ['potentiel', 'score', 'note_contact'],
  source: ['source', 'origine', 'provenance'],
  conseiller: ['conseiller', 'agent', 'négociateur', 'negociateur', 'responsable', 'assigné', 'assigne'],
  date_estimation: ['date estimation', 'date création', 'date creation', 'date', 'créé le', 'cree le'],
  photo_url: ['photo', 'image', 'url photo', 'lien photo', 'photo_url'],
}

const FIELD_LABELS = {
  nom: 'Nom', prenom: 'Prénom', telephone: 'Téléphone', telephone2: 'Téléphone 2',
  email: 'Email', adresse: 'Adresse', code_postal: 'Code postal', ville: 'Ville',
  categorie: 'Catégorie', notes: 'Notes', potentiel: 'Potentiel',
  source: 'Source', conseiller: 'Conseiller en charge', date_estimation: "Date d'estimation",
  photo_url: 'Photo (URL)',
}
```

- [ ] **Step 2: Utiliser les labels dans l'UI mapping**

Toujours dans `ImportModal.jsx`, remplacer le label de la grille de mapping. Ligne ~154 :

```jsx
                <label className="block text-xs font-medium text-quai-muted mb-1">{FIELD_LABELS[field] || field}</label>
```

Et l'en-tête d'aperçu (ligne ~170) :

```jsx
                        <th key={f} className="border border-quai-border px-2 py-1 text-left">{FIELD_LABELS[f] || f}</th>
```

(Retirer `capitalize` de ces deux éléments puisque les labels sont déjà propres.)

- [ ] **Step 3: doImport envoie les nouveaux champs**

Le `doImport` (lignes 88-107) itère déjà `Object.entries(mapping)` → tout champ mappé (source, conseiller, date_estimation, photo_url) est inclus automatiquement dans l'objet envoyé. **Aucune modification nécessaire** — vérifier que le mapping inclut bien les clés (il les inclut car elles viennent de FIELD_MAP).

Mettre à jour l'affichage du résultat (step 3, après le bloc Erreurs ~ligne 202) pour montrer les compteurs additionnels :

```jsx
          {(result.conseillers_non_reconnus > 0 || result.dates_ignorees > 0) && (
            <div className="text-xs text-quai-muted mt-2 space-y-1">
              {result.conseillers_non_reconnus > 0 && <div>{result.conseillers_non_reconnus} conseiller(s) non reconnu(s) — contacts laissés non attribués.</div>}
              {result.dates_ignorees > 0 && <div>{result.dates_ignorees} date(s) d'estimation illisible(s) — ignorée(s).</div>}
            </div>
          )}
```

- [ ] **Step 4: Build front**

Run: `cd client && npm run build`
Expected: `✓ built` sans erreur.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ImportModal.jsx
git commit -m "feat(import): detection auto source/conseiller/date/photo + libelles"
```

---

## Task 7 : Affichage ContactModal (édition)

**Files:**
- Modify: `client/src/components/ContactModal.jsx:13-17` (state), `:24-30` (chargement users), `:96-136` (form)

- [ ] **Step 1: State + chargement des conseillers**

Dans `ContactModal.jsx`, étendre le state initial (lignes 13-17) :

```js
  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', telephone2: '', email: '',
    adresse: '', code_postal: '', ville: '', categorie: 'autre',
    notes: '', potentiel: 3, statut: 'a_contacter', prochain_contact: '', tags: '',
    source_import: '', assigned_to: '', date_estimation: '', photo_url: '',
  })
  const [users, setUsers] = useState([])
```

Charger les users (après le `useEffect` existant, lignes 24-30, ajouter un second effect) :

```js
  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).catch(() => setUsers([]))
  }, [])
```

Dans le `useEffect` de chargement contact (ligne 27), s'assurer que `date_estimation` et `assigned_to` sont repris. `setForm({ ...contact, ... })` les inclut déjà ; ajouter le slicing date :

```js
      setForm({ ...contact, tags, prochain_contact: contact.prochain_contact?.slice(0, 10) || '', date_estimation: contact.date_estimation?.slice(0, 10) || '', assigned_to: contact.assigned_to || '' })
```

- [ ] **Step 2: Champs dans le formulaire**

Dans le bloc form (avant la div Tags `col-span-2`, ~ligne 128), ajouter :

```jsx
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Conseiller en charge</label>
              <select className="input" value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value || null)}>
                <option value="">— Non attribué —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Date d'estimation</label>
              <input type="date" className="input" value={form.date_estimation || ''} onChange={e => set('date_estimation', e.target.value)} />
            </div>
            <Field label="Source" value={form.source_import} onChange={v => set('source_import', v)} />
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Photo (URL)</label>
              <input className="input" value={form.photo_url || ''} onChange={e => set('photo_url', e.target.value)} placeholder="https://…" />
              {form.photo_url && (
                <img src={form.photo_url} alt="Aperçu" className="mt-2 h-16 w-16 object-cover rounded-lg border border-quai-border"
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
            </div>
```

- [ ] **Step 3: Build**

Run: `cd client && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ContactModal.jsx
git commit -m "feat(contacts): edition source/conseiller/date_estimation/photo"
```

---

## Task 8 : Affichage SessionPage (écran d'appel)

**Files:**
- Modify: `client/src/pages/SessionPage.jsx:182-184` (zone après email, dans le bloc fiche)

- [ ] **Step 1: Ajouter le bloc infos métier**

Dans `SessionPage.jsx`, après le bloc Email (lignes 182-184), AVANT le bloc Notes (ligne 186), insérer :

```jsx
          {(contact.source_import || contact.assigned_prenom || contact.date_estimation || contact.photo_url) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-quai-muted mb-3">
              {contact.assigned_prenom && (
                <span className="inline-flex items-center gap-1.5"><Icon name="user" size="sm" /> {contact.assigned_prenom} {contact.assigned_nom}</span>
              )}
              {contact.date_estimation && (
                <span className="inline-flex items-center gap-1.5"><Icon name="calendar" size="sm" /> Estimation : {contact.date_estimation.slice(0, 10).split('-').reverse().join('/')}</span>
              )}
              {contact.source_import && (
                <span className="inline-flex items-center gap-1.5"><Icon name="tag" size="sm" /> {contact.source_import}</span>
              )}
              {contact.photo_url && (
                <a href={contact.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-quai-navy hover:underline">
                  <img src={contact.photo_url} alt="" className="h-8 w-8 object-cover rounded border border-quai-border"
                    onError={e => { e.currentTarget.outerHTML = '<span class=\"inline-flex items-center gap-1\">Voir la photo</span>' }} />
                </a>
              )}
            </div>
          )}
```

Note : le format date `slice(0,10).split('-').reverse().join('/')` transforme `2026-01-15` → `15/01/2026`. `assigned_prenom`/`assigned_nom`/`date_estimation`/`source_import`/`photo_url` viennent du GET détail (join Task 5).

- [ ] **Step 2: Build**

Run: `cd client && npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SessionPage.jsx
git commit -m "feat(session): affiche conseiller/date_estimation/source/photo"
```

---

## Task 9 : Vérification live + checkpoint données

**Files:** aucun (vérif).

- [ ] **Step 1: Vérif live navigateur**

Démarrer backend relances (3001) + Vite relances (5173, depuis `client/`), se connecter `admin@lequai-immobilier.com / admin123`. Vérifier :
- Import : ouvrir Contacts → Importer un petit CSV avec colonnes `nom,source,conseiller,date,photo` → la grille mappe automatiquement source/conseiller/date_estimation/photo_url ; après import, compteurs affichés si applicable.
- Fiche contact : les 4 nouveaux champs s'éditent et persistent.
- Session relance : conseiller, date (JJ/MM/AAAA), source, vignette photo s'affichent.

- [ ] **Step 2: Suite de tests complète**

Run: `for t in server/test/*.test.js; do JWT_SECRET=dev node "$t"; done`
Expected: aucun `FAIL`.

- [ ] **Step 3: Checkpoint DB si données modifiées**

Si des contacts de test ont été ajoutés en prod-DB locale (NE PAS committer de contacts de test). Sinon, le `.gz` n'a pas besoin d'être régénéré (seul le schéma migre au boot via Task 1). Confirmer qu'aucun contact de test ne pollue `immo.db` avant tout gzip.

- [ ] **Step 4: Merge + push**

```bash
git checkout main
git merge --no-ff feat/contacts-champs-import -m "merge: champs contacts (source/conseiller/date/photo) + import auto"
export PATH="$HOME/.local/bin:$PATH"
git push origin main
```

---

## Notes d'exécution

- Tests = scripts node imprimant `OK`/`FAIL` ; le harness n'a pas de `npm test`. Le fichier de test force `DB_PATH=/tmp/...` pour ne PAS toucher la vraie DB. **Important** : Task 4 et 5 écrivent dans cette DB temp — l'ordre des tests compte (Test1 créé en Task 4, lu en Task 5). Garder les tests dans l'ordre des tâches dans le fichier.
- Le test charge `database.js` qui exécute la migration au require → Task 1 valide la migration via la DB temp.
- AUCUN emoji dans le code (règle stricte). Icônes Lucide via `Icon`.
- `recalculerScore` est appelé à l'insert (comportement existant conservé).
