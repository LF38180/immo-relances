# Import Modelo réel (contacts + biens) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps en checkbox.

**Goal:** Reconnaître automatiquement les 2 formats d'export Modelo (CONTACT et BIEN) à l'import et les mapper vers la table `contacts` d'ImmoRelances, avec les vraies colonnes Modelo.

**Architecture:** Détection de format par signature de colonnes (front). Format BIEN pré-transformé (extraction propriétaire + résumé bien + split nom) AVANT le mapping commun. Alias FIELD_MAP enrichis des en-têtes Modelo réels. Helpers purs testés. Le back (importerContacts) est déjà en place (chantier B) — peu ou pas de changement.

**Branche :** `feat/import-modelo`. Fichiers de référence : `~/Downloads/Export-contacts-_08-06-2026.csv` (CONTACT, sép. `;`, 39 cols), `~/Downloads/export-de-biens-le-quai-de-immobilier-meylan_08-06-2026.xlsx` (BIEN, onglet "Maisons en vente").

## Structures Modelo réelles

### CONTACT (CSV `;`)
Colonnes utiles : `Nom, Prénom, E-mail, Tél. port., Tél. fixe, Adresse, Code postal, Commune, Type, Origine, Origine détail, Observations, Suivi par, Création`.
Mapping : Nom→nom, Prénom→prenom, E-mail→email, Tél. port.→telephone, Tél. fixe→telephone2,
Adresse→adresse, Code postal→code_postal, Commune→ville, Type→categorie, (Origine + " — " + Origine détail)→source, Observations→notes, Suivi par→conseiller, Création→date_estimation.

### BIEN (xlsx, onglet "Maisons en vente")
Signature : présence de `Référence` ET `Prix de vente`. Bloc propriétaire en fin de ligne :
`Nom, Prenom` (= "M. Michaël MERCYANO"), `E-mail`, `Tél. fixe`, `Tél. port.`, `Adresse_1`, `Code postal_1`, `Commune_1`, `Suivi par`, `Photo principale`, `Création`.
Transformation → contact vendeur :
- `Nom, Prenom` → split (retirer civilité M./Mme/Mlle/M, 1er mot=prenom, reste=nom)
- E-mail→email, Tél. port.→telephone, Tél. fixe→telephone2
- Adresse_1→adresse, Code postal_1→code_postal, Commune_1→ville
- Suivi par→conseiller, Création→date_estimation, Photo principale→photo_url (souvent vide)
- categorie = 'vendeur' (c'est un mandat de vente)
- source = 'Mandat ' + Référence
- notes = résumé bien : `Réf TZ-8426 · Mandat Simple · Prix 250 000 € · 143 m² · DPE B` (champs présents seulement)

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `client/src/utils/modelo-import.js` | Helpers purs : détection format, split nom, mapping catégorie, transformation bien→contact, résumé bien | **Créer** |
| `client/src/components/ImportModal.jsx` | Intègre détection + transformation + alias Modelo + délimiteur CSV | Modifier |
| `client/test/modelo-import.test.js` | Tests des helpers purs (node) | **Créer** |

Note : pas de test runner front. On teste les helpers purs via node direct (ils n'importent rien de React). Lancer : `node client/test/modelo-import.test.js`.

---

## Task 1 : Helpers purs (détection format, split nom, catégorie)

**Files:**
- Create: `client/src/utils/modelo-import.js`
- Create: `client/test/modelo-import.test.js`

- [ ] **Step 1: Écrire les tests (échouent)**

Créer `client/test/modelo-import.test.js` :

```js
const assert = require('assert')
const { detecterFormat, splitNomComplet, categorieModelo } = require('../src/utils/modelo-import.js')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}
console.log('modelo-import.test.js')

test('detecterFormat BIEN', () => {
  assert.strictEqual(detecterFormat(['Référence', 'Titre', 'Prix de vente', 'Suivi par']), 'bien')
})
test('detecterFormat CONTACT', () => {
  assert.strictEqual(detecterFormat(['Nom', 'Prénom', 'Tél. port.', 'Suivi par']), 'contact')
})
test('detecterFormat fichier quelconque -> contact (défaut)', () => {
  assert.strictEqual(detecterFormat(['nom', 'email', 'tel']), 'contact')
})

test('splitNomComplet retire civilité', () => {
  assert.deepStrictEqual(splitNomComplet('M. Michaël MERCYANO'), { prenom: 'Michaël', nom: 'MERCYANO' })
  assert.deepStrictEqual(splitNomComplet('Mme Marie Claire DURAND'), { prenom: 'Marie', nom: 'Claire DURAND' })
  assert.deepStrictEqual(splitNomComplet('DUPONT'), { prenom: '', nom: 'DUPONT' })
  assert.deepStrictEqual(splitNomComplet(''), { prenom: '', nom: '' })
})

test('categorieModelo mappe les libellés', () => {
  assert.strictEqual(categorieModelo('Prospect Acquéreur '), 'acquereur')
  assert.strictEqual(categorieModelo('Vendeur'), 'vendeur')
  assert.strictEqual(categorieModelo('Ancien client'), 'ancien_client')
  assert.strictEqual(categorieModelo('truc inconnu'), 'autre')
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node client/test/modelo-import.test.js`
Expected: FAIL `Cannot find module '../src/utils/modelo-import.js'`

- [ ] **Step 3: Créer le helper**

Créer `client/src/utils/modelo-import.js` :

```js
// Détecte le format d'un export Modelo d'après ses en-têtes.
export function detecterFormat(headers) {
  const h = headers.map(x => String(x).toLowerCase().trim())
  const has = (s) => h.some(x => x === s.toLowerCase())
  if (has('Référence') && has('Prix de vente')) return 'bien'
  return 'contact'
}

// "M. Michaël MERCYANO" -> { prenom: 'Michaël', nom: 'MERCYANO' }
export function splitNomComplet(s) {
  const clean = String(s || '').trim().replace(/^(M\.|Mme|Mlle|Mr|M)\s+/i, '').trim()
  if (!clean) return { prenom: '', nom: '' }
  const parts = clean.split(/\s+/)
  if (parts.length === 1) return { prenom: '', nom: parts[0] }
  return { prenom: parts[0], nom: parts.slice(1).join(' ') }
}

// Mappe le libellé "Type" Modelo vers une catégorie app.
export function categorieModelo(type) {
  const t = String(type || '').toLowerCase().trim()
  if (t.includes('acqu')) return 'acquereur'
  if (t.includes('vendeur')) return 'vendeur'
  if (t.includes('ancien')) return 'ancien_client'
  if (t.includes('chaud')) return 'prospect_chaud'
  if (t.includes('froid') || t.includes('prospect')) return 'prospect_froid'
  return 'autre'
}
```

NB : `detecterFormat` compare en minuscule — la comparaison `has('Référence')` lowercase les deux côtés. Vérifier que l'accent de "référence" matche (les deux passent par toLowerCase, OK).

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `node client/test/modelo-import.test.js`
Expected: tous OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/modelo-import.js client/test/modelo-import.test.js
git commit -m "feat(import): helpers detection format Modelo + split nom + categorie"
```

---

## Task 2 : Transformation BIEN → contact + résumé

**Files:**
- Modify: `client/src/utils/modelo-import.js`
- Modify: `client/test/modelo-import.test.js`

- [ ] **Step 1: Ajouter les tests (échouent)**

Ajouter à `client/test/modelo-import.test.js` :

```js
const { bienVersContact } = require('../src/utils/modelo-import.js')

const ROW_BIEN = {
  'Référence': 'TZ-8426', 'Type de mandat': 'Simple ', 'Prix de vente': '250 000  €',
  'Surface': '143.00 m²', 'Classe DPE': 'B',
  'Nom, Prenom': 'M. Michaël MERCYANO', 'E-mail': 'm@x.com',
  'Tél. port.': '0651663663', 'Tél. fixe': '',
  'Adresse_1': '615 Bd Lepic', 'Code postal_1': '73100', 'Commune_1': 'Aix-les-Bains',
  'Suivi par': 'Tara ZOPPAS', 'Création': '30-05-2026', 'Photo principale': '',
}

test('bienVersContact extrait le propriétaire', () => {
  const c = bienVersContact(ROW_BIEN)
  assert.strictEqual(c.prenom, 'Michaël')
  assert.strictEqual(c.nom, 'MERCYANO')
  assert.strictEqual(c.email, 'm@x.com')
  assert.strictEqual(c.telephone, '0651663663')
  assert.strictEqual(c.adresse, '615 Bd Lepic')
  assert.strictEqual(c.code_postal, '73100')
  assert.strictEqual(c.ville, 'Aix-les-Bains')
  assert.strictEqual(c.conseiller, 'Tara ZOPPAS')
  assert.strictEqual(c.date_estimation, '30-05-2026')
  assert.strictEqual(c.categorie, 'vendeur')
  assert.ok(c.source.startsWith('Mandat'))
  assert.ok(c.source.includes('TZ-8426'))
  assert.ok(c.notes.includes('TZ-8426'))
  assert.ok(c.notes.includes('143.00 m²'))
  assert.ok(c.notes.includes('DPE B'))
})

test('bienVersContact gère prix vide / champs manquants', () => {
  const c = bienVersContact({ 'Référence': 'X-1', 'Prix de vente': '0  €', 'Nom, Prenom': 'DURAND' })
  assert.strictEqual(c.nom, 'DURAND')
  assert.ok(c.notes.includes('X-1'))
  // prix 0 -> non affiché dans le résumé
  assert.ok(!c.notes.includes('Prix'))
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node client/test/modelo-import.test.js`
Expected: FAIL `bienVersContact is not a function`.

- [ ] **Step 3: Ajouter la fonction**

Dans `client/src/utils/modelo-import.js`, ajouter :

```js
// Nettoie un montant Modelo "250 000  €" -> "250 000 €" ; "0  €" / vide -> null
function prixPropre(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const chiffres = s.replace(/[^\d]/g, '')
  if (!chiffres || parseInt(chiffres, 10) === 0) return null
  return s
}

// Transforme une ligne d'export BIEN en objet contact (propriétaire vendeur).
export function bienVersContact(row) {
  const { prenom, nom } = splitNomComplet(row['Nom, Prenom'])
  const ref = String(row['Référence'] || '').trim()

  // Résumé du bien dans notes (champs non vides seulement)
  const bits = []
  if (ref) bits.push('Réf ' + ref)
  const mandat = String(row['Type de mandat'] || '').trim()
  if (mandat) bits.push('Mandat ' + mandat)
  const prix = prixPropre(row['Prix de vente'])
  if (prix) bits.push('Prix ' + prix)
  const surface = String(row['Surface'] || '').trim()
  if (surface && surface !== '0') bits.push(surface)
  const dpe = String(row['Classe DPE'] || '').trim()
  if (dpe) bits.push('DPE ' + dpe)

  return {
    prenom, nom,
    email: row['E-mail'] || '',
    telephone: row['Tél. port.'] || '',
    telephone2: row['Tél. fixe'] || '',
    adresse: row['Adresse_1'] || '',
    code_postal: row['Code postal_1'] || '',
    ville: row['Commune_1'] || '',
    conseiller: row['Suivi par'] || '',
    date_estimation: row['Création'] || '',
    photo_url: row['Photo principale'] || '',
    categorie: 'vendeur',
    source: ref ? `Mandat ${ref}` : 'Mandat',
    notes: bits.join(' · '),
  }
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `node client/test/modelo-import.test.js`
Expected: tous OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/modelo-import.js client/test/modelo-import.test.js
git commit -m "feat(import): transformation bien Modelo -> contact vendeur + resume"
```

---

## Task 3 : Intégration ImportModal (détection + délimiteur + alias Modelo)

**Files:**
- Modify: `client/src/components/ImportModal.jsx`

- [ ] **Step 1: Importer les helpers + enrichir FIELD_MAP**

En haut de `ImportModal.jsx`, après les imports existants :

```js
import { detecterFormat, bienVersContact, categorieModelo } from '../utils/modelo-import'
```

Enrichir `FIELD_MAP` avec les en-têtes Modelo réels (aligner les alias) — remplacer le bloc par :

```js
const FIELD_MAP = {
  nom: ['nom', 'name', 'last_name', 'lastname', 'surname'],
  prenom: ['prenom', 'prénom', 'first_name', 'firstname'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable', 'tél. port.', 'tel. port.', 'tél port'],
  telephone2: ['telephone2', 'tel2', 'mobile2', 'tél. fixe', 'tel. fixe', 'tél fixe', 'fixe'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  adresse: ['adresse', 'address', 'rue', 'street'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code', 'code postal'],
  ville: ['ville', 'city', 'localite', 'commune'],
  categorie: ['categorie', 'catégorie', 'category', 'type'],
  notes: ['notes', 'note', 'commentaire', 'remarque', 'observation', 'observations'],
  potentiel: ['potentiel', 'score', 'note_contact'],
  source: ['source', 'origine', 'provenance'],
  conseiller: ['conseiller', 'agent', 'négociateur', 'negociateur', 'responsable', 'assigné', 'assigne', 'suivi par'],
  date_estimation: ['date estimation', 'date création', 'date creation', 'date', 'créé le', 'cree le', 'création', 'creation'],
  photo_url: ['photo', 'image', 'url photo', 'lien photo', 'photo_url', 'photo principale'],
}
```

ATTENTION : `guessMapping` matche `hl.includes(a)`. L'alias `'date'` est sous-chaîne de "date de naissance", "date de mariage" etc. (colonnes Modelo). Risque de mauvais mapping de date_estimation sur "Date de naissance". Pour fiabiliser, dans `guessMapping`, préférer une égalité stricte avant l'inclusion : trier les aliases pour que le match exact gagne. Modifier `guessMapping` (Step 2).

- [ ] **Step 2: Fiabiliser guessMapping (exact-match prioritaire)**

Remplacer la fonction `guessMapping` par :

```js
function guessMapping(headers) {
  const map = {}
  // 1er passage : égalité stricte (prioritaire)
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    Object.entries(FIELD_MAP).forEach(([field, aliases]) => {
      if (!map[field] && aliases.some(a => hl === a)) map[field] = h
    })
  })
  // 2e passage : inclusion (si pas déjà mappé)
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    Object.entries(FIELD_MAP).forEach(([field, aliases]) => {
      if (!map[field] && aliases.some(a => hl.includes(a))) map[field] = h
    })
  })
  return map
}
```

- [ ] **Step 3: Délimiteur CSV auto + détection format dans handleFile**

Dans `handleFile`, branche CSV : ajouter `delimiter: ''` (PapaParse auto-détecte `;` vs `,` si vide) — en fait forcer l'auto-detection est le défaut quand delimiter non fourni, MAIS pour les exports Modelo `;` c'est plus sûr d'expliciter. Utiliser `delimitersToGuess`. Remplacer l'appel `Papa.parse` par :

```js
      Papa.parse(file, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        delimitersToGuess: [';', ',', '\t', '|'],
        complete: (res) => {
          appliquerDonnees(res.meta.fields || [], res.data)
        },
        error: () => toast.error('Erreur de lecture du fichier CSV')
      })
```

Dans la branche xlsx, remplacer `setHeaders(hdrs); setRows(data); setMapping(guessMapping(hdrs)); setStep(2)` par :

```js
          appliquerDonnees(hdrs, data)
```

Ajouter une fonction `appliquerDonnees` au-dessus de `handleFile` (dans le composant) :

```js
  const appliquerDonnees = (hdrs, data) => {
    const format = detecterFormat(hdrs)
    if (format === 'bien') {
      // Transforme chaque bien en contact propriétaire, mapping direct (clés déjà = champs app)
      const contacts = data.map(bienVersContact)
      setRows(contacts)
      setHeaders(Object.keys(contacts[0] || {}))
      // mapping identité : chaque clé pointe sur elle-même
      const idMap = {}
      Object.keys(contacts[0] || {}).forEach(k => { idMap[k] = k })
      setMapping(idMap)
      setFormatDetecte('bien')
    } else {
      setHeaders(hdrs)
      setRows(data)
      setMapping(guessMapping(hdrs))
      setFormatDetecte('contact')
    }
    setStep(2)
  }
```

Ajouter l'état `formatDetecte` près des autres `useState` :

```js
  const [formatDetecte, setFormatDetecte] = useState('contact')
```

- [ ] **Step 4: doImport — mapper la catégorie Modelo (format contact)**

Dans `doImport`, après la construction de `c` via le mapping, pour le format CONTACT, si une colonne `categorie` (Type Modelo) est mappée, la convertir. Remplacer le `.map` par :

```js
    const contacts = rows.map(row => {
      const c = { categorie: defaultCategorie }
      Object.entries(mapping).forEach(([field, col]) => {
        if (col) c[field] = row[col]
      })
      // Type Modelo ("Prospect Acquéreur") -> categorie app
      if (c.categorie && formatDetecte === 'contact' && c.categorie !== defaultCategorie) {
        c.categorie = categorieModelo(c.categorie)
      }
      // Format bien : la catégorie est déjà 'vendeur' (clé identité), ne pas écraser
      return c
    })
```

NB : pour le format BIEN, `row` est déjà un objet contact (clés = champs app), `mapping` est l'identité, donc `c.categorie = 'vendeur'` passe tel quel (pas de reconversion car `categorieModelo('vendeur')`='vendeur' de toute façon, mais le garde-fou `formatDetecte === 'contact'` évite tout effet).

- [ ] **Step 5: Bandeau format détecté (UX)**

Dans le rendu step 2, juste avant la ligne "X lignes détectées", ajouter un bandeau indiquant le format :

```jsx
          <div className="mb-3 text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-quai-navy/5 text-quai-navy">
            <Icon name="file-check" size="sm" /> Format détecté : {formatDetecte === 'bien' ? 'Export biens Modelo (propriétaires)' : 'Export contacts'}
          </div>
```

- [ ] **Step 6: Build**

Run: `cd client && npm run build`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ImportModal.jsx
git commit -m "feat(import): detection auto format Modelo (contact/bien) + delimiteur + categorie"
```

---

## Task 4 : Vérification live (les 2 fichiers réels)

**Files:** aucun (vérif).

- [ ] **Step 1: Lancer backend (3001) + Vite relances (5173, depuis client/), login admin.**

- [ ] **Step 2: Import du CSV CONTACT**
Contacts → Importer → `~/Downloads/Export-contacts-_08-06-2026.csv`. Vérifier :
- bandeau "Format détecté : Export contacts"
- mapping auto : Nom→Nom, Tél. port.→Téléphone, Suivi par→Conseiller, Origine→Source, Création→Date d'estimation, Type→Catégorie.
- aperçu correct. Importer. Compteur conseillers_non_reconnus = 1 (Tara ZOPPAS absente des users).
- Le contact LOLA apparaît, catégorie = acquereur, source contient LeBonCoin.

- [ ] **Step 3: Import du xlsx BIEN**
Importer → `~/Downloads/export-de-biens...meylan_08-06-2026.xlsx`. Vérifier :
- bandeau "Format détecté : Export biens Modelo (propriétaires)"
- le propriétaire M. Michaël MERCYANO importé : prenom=Michaël, nom=MERCYANO, catégorie=vendeur, notes contient "Réf TZ-8426 · ... · 143.00 m² · DPE B", source="Mandat TZ-8426".

- [ ] **Step 4: Nettoyage** — supprimer les contacts de test importés (LOLA, MERCYANO) via l'UI ou API, pour ne pas polluer la base.

- [ ] **Step 5: Tests helpers + build**
Run: `node client/test/modelo-import.test.js` (tous OK) ; `cd client && npm run build` (✓).

- [ ] **Step 6: Merge + push**
```bash
git checkout main
git merge --no-ff feat/import-modelo -m "merge: import Modelo reel (contacts + biens, detection auto format)"
export PATH="$HOME/.local/bin:$PATH"
git push origin main
```

## Notes

- "Tara ZOPPAS" n'existe pas dans les users démo → conseiller non résolu (attendu). En prod, créer les vrais conseillers pour que le matching fonctionne.
- Photo principale souvent vide dans l'export bien → photo_url null (normal).
- Délimiteur CSV `;` géré via delimitersToGuess.
- AUCUN emoji. Icônes Lucide.
- Le back importerContacts (chantier B) gère déjà source/conseiller/date/photo — pas de changement back.
