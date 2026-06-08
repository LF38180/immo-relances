# Import Modelo v2 — photos multiples, conseiller historique, attribution par rôle — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps en checkbox.

**Goal:** (1) Importer TOUTES les photos d'un bien en carrousel ; (2) stocker le "Suivi par" Modelo comme conseiller historique (champ dédié, lecture seule) au lieu de l'assigner ; (3) attribuer `assigned_to` selon le rôle de l'importeur (agent → lui-même ; admin/manager → sélecteur, défaut lui).

**Architecture:** photo_url stocke un JSON tableau d'URLs (rétro-compat string simple). Nouvelle colonne `suivi_par_origine` (texte conseiller du fichier). L'import calcule assigned_to côté front (selon user.role) ET le back sécurise (agent forcé à lui-même). Carrousel manuel dans la fiche.

**Branche :** `feat/import-modelo-v2` (depuis main). Dépend du chantier import-modelo (mergé).

---

## File Structure

| Fichier | Action |
|---|---|
| `server/src/database.js` | Migration : colonne `suivi_par_origine TEXT` |
| `server/src/routes/contactRoutes.js` | importerContacts : attribution par rôle + suivi_par_origine ; POST/PUT/CHAMPS ; GET déjà OK |
| `server/src/utils/import-helpers.js` | (inchangé — resoudreConseiller plus utilisé pour l'attribution mais gardé) |
| `client/src/utils/modelo-import.js` | bienVersContact : collecter toutes les photos → tableau ; suivi_par au lieu de conseiller |
| `client/src/components/ImportModal.jsx` | sélecteur attribution (rôle), envoi assigned_to + suivi_par_origine + photos JSON |
| `client/src/components/PhotoCarousel.jsx` | **Créer** — carrousel manuel + miniatures |
| `client/src/components/ContactModal.jsx` | afficher carrousel + champ suivi_par_origine (lecture seule) |
| `client/src/pages/SessionPage.jsx` | afficher carrousel (1ere photo) + conseiller historique |
| `client/test/modelo-import.test.js` | tests photos multiples + suivi_par |
| `server/test/contacts-import.test.js` | tests attribution rôle + suivi_par_origine |

---

## Task 1 : Migration colonne suivi_par_origine

**Files:** `server/src/database.js`, `server/test/contacts-import.test.js`

- [ ] **Step 1: Test (échoue)** — ajouter à `server/test/contacts-import.test.js` (après le test migration existant) :

```js
test('migration ajoute suivi_par_origine', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('suivi_par_origine'), 'suivi_par_origine absente')
})
```

- [ ] **Step 2: Run** `JWT_SECRET=dev node server/test/contacts-import.test.js` — FAIL.

- [ ] **Step 3:** Dans `server/src/database.js`, dans le bloc migration idempotente existant (après les ALTER date_estimation/photo_url), ajouter :

```js
if (!contactCols.includes('suivi_par_origine')) db.exec("ALTER TABLE contacts ADD COLUMN suivi_par_origine TEXT");
```

- [ ] **Step 4: Run** — OK.

- [ ] **Step 5: Commit**
```bash
git add server/src/database.js server/test/contacts-import.test.js
git commit -m "feat(contacts): migration suivi_par_origine (conseiller historique)"
```

---

## Task 2 : bienVersContact — photos multiples + suivi_par

**Files:** `client/src/utils/modelo-import.js`, `client/test/modelo-import.test.js`

- [ ] **Step 1: Tests (échouent)** — ajouter à `client/test/modelo-import.test.js` :

```js
test('bienVersContact collecte toutes les photos non vides', () => {
  const c = bienVersContact({
    'Référence': 'P-1', 'Nom, Prenom': 'DURAND',
    'Photo principale': 'http://x/p0.jpg', 'Photo n°1': 'http://x/p1.jpg',
    'Photo n°2': '', 'Photo n°3': 'http://x/p3.jpg',
  })
  const photos = JSON.parse(c.photo_url)
  assert.deepStrictEqual(photos, ['http://x/p0.jpg', 'http://x/p1.jpg', 'http://x/p3.jpg'])
})

test('bienVersContact photo_url vide si aucune photo', () => {
  const c = bienVersContact({ 'Référence': 'P-2', 'Nom, Prenom': 'X' })
  assert.strictEqual(c.photo_url, '')
})

test('bienVersContact met le Suivi par dans suivi_par_origine (pas conseiller)', () => {
  const c = bienVersContact({ 'Référence': 'P-3', 'Nom, Prenom': 'X', 'Suivi par': 'Tara ZOPPAS' })
  assert.strictEqual(c.suivi_par_origine, 'Tara ZOPPAS')
  assert.strictEqual(c.conseiller, undefined)
})
```

NB : ces tests REMPLACENT toute assertion existante sur `c.conseiller` ou `c.photo_url` pour le format bien. Mettre à jour le test "bienVersContact extrait le propriétaire" : retirer la ligne `assert.strictEqual(c.conseiller, 'Tara ZOPPAS')` (le conseiller n'est plus dans bienVersContact) et toute assertion `c.photo_url ===`.

- [ ] **Step 2: Run** `node client/test/modelo-import.test.js` — FAIL.

- [ ] **Step 3:** Dans `client/src/utils/modelo-import.js`, modifier `bienVersContact` :
- collecter les photos : itérer `Photo principale` puis `Photo n°1`..`Photo n°99`, garder les non-vides, `photo_url = JSON.stringify(liste)` (ou `''` si vide).
- remplacer `conseiller: row['Suivi par'] || ''` par `suivi_par_origine: row['Suivi par'] || ''` (retirer la clé conseiller).

Remplacer le `return {...}` de bienVersContact par :

```js
  // Collecte toutes les photos non vides (principale + n°1..99)
  const photos = []
  const principale = String(row['Photo principale'] || '').trim()
  if (principale) photos.push(principale)
  for (let i = 1; i <= 99; i++) {
    const p = String(row['Photo n°' + i] || '').trim()
    if (p) photos.push(p)
  }

  return {
    prenom, nom,
    email: row['E-mail'] || '',
    telephone: row['Tél. port.'] || '',
    telephone2: row['Tél. fixe'] || '',
    adresse: row['Adresse_1'] || '',
    code_postal: row['Code postal_1'] || '',
    ville: row['Commune_1'] || '',
    suivi_par_origine: row['Suivi par'] || '',
    date_estimation: row['Création'] || '',
    photo_url: photos.length ? JSON.stringify(photos) : '',
    categorie: 'vendeur',
    source: ref ? `Mandat ${ref}` : 'Mandat',
    notes: bits.join(' · '),
  }
```

- [ ] **Step 4: Run** — OK (tous, y compris le test "extrait le propriétaire" mis à jour).

- [ ] **Step 5: Commit**
```bash
git add client/src/utils/modelo-import.js client/test/modelo-import.test.js
git commit -m "feat(import): bien Modelo collecte toutes les photos + suivi_par_origine"
```

---

## Task 3 : Back — attribution par rôle + suivi_par_origine

**Files:** `server/src/routes/contactRoutes.js`, `server/test/contacts-import.test.js`

Logique :
- `importerContacts(contacts, users, importeur)` reçoit `importeur = { id, role }`.
- assigned_to par ligne : si `importeur.role === 'agent'` → `importeur.id` (forcé). Sinon (manager/admin) → `assignedToChoisi` (paramètre, défaut importeur.id).
- Le champ `conseiller` du fichier n'est PLUS résolu en assigned_to. `suivi_par_origine` ← `c.suivi_par_origine` (ou `c.conseiller` legacy si présent).
- INSERT ajoute `suivi_par_origine`.

- [ ] **Step 1: Tests (échouent)** — ajouter à `server/test/contacts-import.test.js` :

```js
test('importerContacts agent : assigned_to force a importeur', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const agent = { id: 2, role: 'agent' }
  const r = importerContacts([{ nom: 'AgentImport', suivi_par_origine: 'Tara ZOPPAS' }], users, agent, 999)
  assert.strictEqual(r.importes, 1)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='AgentImport'").get()
  assert.strictEqual(c.assigned_to, 2) // forcé à l'agent, pas 999
  assert.strictEqual(c.suivi_par_origine, 'Tara ZOPPAS')
})

test('importerContacts manager : assigned_to = choix', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const manager = { id: 3, role: 'manager' }
  const r = importerContacts([{ nom: 'MgrImport' }], users, manager, 2)
  assert.strictEqual(r.importes, 1)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='MgrImport'").get()
  assert.strictEqual(c.assigned_to, 2) // le choix du manager
})

test('importerContacts manager sans choix : defaut = lui-meme', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const manager = { id: 3, role: 'manager' }
  const r = importerContacts([{ nom: 'MgrDefaut' }], users, manager, null)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='MgrDefaut'").get()
  assert.strictEqual(c.assigned_to, 3)
})
```

- [ ] **Step 2: Run** — FAIL (signature importerContacts différente).

- [ ] **Step 3:** Modifier `importerContacts` dans `contactRoutes.js`.

Nouvelle signature : `function importerContacts(contacts, users, importeur, assignedToChoisi)`.

Dans l'INSERT, ajouter `suivi_par_origine` :
```js
  const insert = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, notes, potentiel, statut, prochain_contact, source_import, assigned_to, date_estimation, photo_url, suivi_par_origine)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
```

Calcul assigned_to (une fois, hors boucle) :
```js
  let assignedTo;
  if (importeur && importeur.role === 'agent') {
    assignedTo = importeur.id;
  } else {
    assignedTo = assignedToChoisi ? parseInt(assignedToChoisi, 10) : (importeur ? importeur.id : null);
  }
```

Dans la boucle, retirer la résolution `resoudreConseiller`/`conseillersInconnus` pour assigned_to. Remplacer par : `suivi_par_origine = c.suivi_par_origine || c.conseiller || null`. L'INSERT passe `assignedTo` (constant) et `suiviParOrigine`. Garder `dates_ignorees`. Retirer `conseillers_non_reconnus` du retour (plus pertinent — l'attribution ne dépend plus du fichier).

Le `.run(...)` final :
```js
        const result = insert.run(
          c.nom || '', c.prenom || '', c.telephone || '', c.telephone2 || '',
          c.email || '', c.adresse || '', c.code_postal || '', c.ville || '',
          c.categorie || 'autre', c.notes || '', parseInt(c.potentiel) || 3,
          statut, c.prochain_contact || null, source, assignedTo,
          dateEstim, c.photo_url || null, (c.suivi_par_origine || c.conseiller || null)
        );
```

Retour : `{ importes, erreurs, dates_ignorees }`.

Handler POST /import :
```js
router.post('/import', (req, res) => {
  const { contacts, assigned_to } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ error: 'Données invalides' });
  const users = db.prepare('SELECT id, nom, prenom, email FROM users WHERE actif = 1').all();
  res.json(importerContacts(contacts, users, req.user, assigned_to));
});
```

CHAMPS_UPDATE : ajouter `'suivi_par_origine'`.

POST `/` (create) : ajouter `suivi_par_origine` aux champs acceptés + à l'INSERT (cohérence). Lire le bloc POST create actuel et étendre comme pour les autres champs.

- [ ] **Step 4: Run** `JWT_SECRET=dev node server/test/contacts-import.test.js`.
ATTENTION : un test existant ("importerContacts : source colonne, conseiller, date normalisée") appelle `importerContacts(contacts, users)` avec l'ancienne signature et vérifie `conseillers_non_reconnus`. Le METTRE À JOUR : appeler `importerContacts([...], users, {id:1,role:'admin'}, null)` et retirer l'assertion `conseillers_non_reconnus` ; ajuster l'assertion assigned_to (désormais = importeur, plus le conseiller du fichier).

- [ ] **Step 5: Run full suite** — no FAIL.

- [ ] **Step 6: Commit**
```bash
git add server/src/routes/contactRoutes.js server/test/contacts-import.test.js
git commit -m "feat(import): attribution assigned_to par role + suivi_par_origine"
```

---

## Task 4 : ImportModal — sélecteur attribution + envoi v2

**Files:** `client/src/components/ImportModal.jsx`

- [ ] **Step 1:** Importer useAuth + charger users.
En haut : `import { useAuth } from '../hooks/useAuth'`. Dans le composant : `const { user } = useAuth()`. Ajouter état :
```js
  const [users, setUsers] = useState([])
  const [assigneA, setAssigneA] = useState('')
```
Charger users si manager/admin (useEffect au montage) :
```js
  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      api.get('/admin/users').then(r => { setUsers(r.data); setAssigneA(String(user.id)) }).catch(() => {})
    }
  }, [])
```

- [ ] **Step 2:** Sélecteur dans le step 2 (avant le bouton importer / sous "catégorie par défaut"), seulement pour manager/admin :
```jsx
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-quai-text mb-1">Attribuer les contacts à</label>
              <select className="input w-auto" value={assigneA} onChange={e => setAssigneA(e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}{u.id === user.id ? ' (moi)' : ''}</option>)}
              </select>
            </div>
          )}
```

- [ ] **Step 3:** doImport — envoyer assigned_to (seulement si manager/admin ; sinon le back force à l'agent) :
```js
      const payload = { contacts }
      if ((user?.role === 'manager' || user?.role === 'admin') && assigneA) payload.assigned_to = assigneA
      const r = await api.post('/contacts/import', payload)
```
(Remplacer l'appel `api.post('/contacts/import', { contacts })` par ce payload.)

- [ ] **Step 4:** Le résultat (step 3) : retirer l'affichage `conseillers_non_reconnus` (n'existe plus). Garder `dates_ignorees`.

- [ ] **Step 5: Build** `cd client && npm run build` — OK.

- [ ] **Step 6: Commit**
```bash
git add client/src/components/ImportModal.jsx
git commit -m "feat(import): selecteur attribution par role (agent=auto, manager/admin=choix)"
```

---

## Task 5 : PhotoCarousel + affichage fiche/session

**Files:** `client/src/components/PhotoCarousel.jsx` (créer), `client/src/components/ContactModal.jsx`, `client/src/pages/SessionPage.jsx`

- [ ] **Step 1:** Créer `client/src/components/PhotoCarousel.jsx` :

```jsx
import { useState } from 'react'
import Icon from './ui/Icon'

// Parse photo_url : soit un JSON tableau, soit une URL simple, soit vide. Renvoie tableau d'URLs http(s).
export function parsePhotos(value) {
  if (!value) return []
  let arr
  try {
    const p = JSON.parse(value)
    arr = Array.isArray(p) ? p : [p]
  } catch {
    arr = [value]
  }
  return arr.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u))
}

export default function PhotoCarousel({ value, compact = false }) {
  const photos = parsePhotos(value)
  const [i, setI] = useState(0)
  if (photos.length === 0) return null
  const taille = compact ? 'h-12 w-12' : 'h-40 w-full'
  const prev = () => setI(n => (n - 1 + photos.length) % photos.length)
  const next = () => setI(n => (n + 1) % photos.length)

  return (
    <div className="relative">
      <a href={photos[i]} target="_blank" rel="noopener noreferrer">
        <img src={photos[i]} alt={`Photo ${i + 1}`} className={`${taille} object-cover rounded-lg border border-quai-border`} />
      </a>
      {photos.length > 1 && (
        <>
          <button type="button" onClick={prev} aria-label="Photo précédente"
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-quai-navy/70 text-white rounded-full p-1 hover:bg-quai-navy">
            <Icon name="chevron-left" size="sm" />
          </button>
          <button type="button" onClick={next} aria-label="Photo suivante"
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-quai-navy/70 text-white rounded-full p-1 hover:bg-quai-navy">
            <Icon name="chevron-right" size="sm" />
          </button>
          <div className="flex justify-center gap-1 mt-1">
            {photos.map((_, k) => (
              <button type="button" key={k} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
                className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-quai-navy' : 'bg-quai-border'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ContactModal** — remplacer le bloc photo actuel (input photo_url + `<img>` simple) par : garder l'input (édition manuelle d'UNE url reste possible) + ajouter le carrousel en aperçu. Importer `import PhotoCarousel from './PhotoCarousel'`. Sous l'input photo_url, remplacer l'`<img onError>` par :
```jsx
              {form.photo_url && <div className="mt-2"><PhotoCarousel value={form.photo_url} /></div>}
```
Ajouter aussi le champ conseiller historique (lecture seule) près de "Conseiller en charge" :
```jsx
            {form.suivi_par_origine && (
              <div>
                <label className="block text-xs font-medium text-quai-muted mb-1">Suivi à l'origine (Modelo)</label>
                <input className="input bg-quai-light" value={form.suivi_par_origine} readOnly />
              </div>
            )}
```
Et inclure `suivi_par_origine` dans le state initial (`suivi_par_origine: ''`) et dans le setForm de chargement (déjà couvert par `...contact`).

- [ ] **Step 3: SessionPage** — dans le bloc fiche, remplacer l'affichage photo simple (le `<a><img onError>`) par le carrousel compact, et afficher le conseiller historique. Importer PhotoCarousel. Dans le bloc métier, remplacer la partie photo par :
```jsx
              {contact.suivi_par_origine && (
                <span className="inline-flex items-center gap-1.5"><Icon name="history" size="sm" /> Suivi origine : {contact.suivi_par_origine}</span>
              )}
```
Et après ce bloc flex, ajouter le carrousel si photos :
```jsx
          {contact.photo_url && <div className="mb-3 max-w-xs"><PhotoCarousel value={contact.photo_url} /></div>}
```
Retirer l'ancien `<a href={contact.photo_url}>...<img onError>` (remplacé par PhotoCarousel qui gère déjà le filtrage http(s)).

- [ ] **Step 4: Build** `cd client && npm run build` — OK.

- [ ] **Step 5: Commit**
```bash
git add client/src/components/PhotoCarousel.jsx client/src/components/ContactModal.jsx client/src/pages/SessionPage.jsx
git commit -m "feat(contacts): carrousel photos + conseiller historique (suivi origine)"
```

---

## Task 6 : Vérif live + merge

- [ ] **Step 1:** backend 3001 + Vite relances. Login.
- [ ] **Step 2: Import bien en tant qu'ADMIN** — vérifier sélecteur "Attribuer à" présent (défaut = Agence Admin), importer le xlsx réel. Le propriétaire MERCYANO : assigned_to = choix admin, suivi_par_origine = "Tara ZOPPAS", photos = carrousel (vide dans ce fichier → pas de carrousel).
- [ ] **Step 3: Import contacts en tant qu'AGENT** (login agent@) — PAS de sélecteur, contact LOLA assigné à Marie Dupont (agent courant). suivi_par_origine = Tara ZOPPAS.
- [ ] **Step 4:** Fiche contact : carrousel (tester avec un contact ayant plusieurs photos via édition manuelle JSON, ou un bien réel avec photos), champ "Suivi à l'origine" lecture seule. Session : conseiller historique + carrousel.
- [ ] **Step 5:** Nettoyer les contacts de test. Tests : `node client/test/modelo-import.test.js` + `JWT_SECRET=dev node server/test/contacts-import.test.js` (tous OK). Build OK.
- [ ] **Step 6: Merge + push**
```bash
git checkout main
git merge --no-ff feat/import-modelo-v2 -m "merge: import Modelo v2 (photos carrousel, conseiller historique, attribution par role)"
export PATH="$HOME/.local/bin:$PATH"
git push origin main
```

## Notes
- assigned_to sécurisé back : agent ne peut jamais assigner à autrui (forcé à lui-même) même si le front envoie autre chose.
- photo_url rétro-compat : ancienne valeur = URL simple → parsePhotos la gère (tableau 1). Nouvelles = JSON tableau.
- suivi_par_origine = trace du conseiller Modelo, JAMAIS utilisé pour l'attribution ni l'écran d'appel.
- AUCUN emoji. Icônes Lucide (chevron-left, chevron-right, history).
- Carrousel : clic photo = ouvre en grand (nouvel onglet). Filtre http(s) (anti-XSS).
