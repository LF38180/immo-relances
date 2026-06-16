# Scripts d'appel avec mise en forme — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux managers/admins de mettre en gras/italique/souligné le texte des scripts d'appel, et l'afficher formaté à tous les utilisateurs.

**Architecture:** Éditeur WYSIWYG `contentEditable` maison (barre G/I/U + `document.execCommand`), stockage HTML dans la colonne `contenu` existante, rendu sécurisé via DOMPurify (déjà dans le bundle). Rétrocompatible : les anciens scripts en texte brut s'affichent comme avant. Droits inchangés (manager + admin éditent).

**Tech Stack:** React + Vite, DOMPurify, lucide-react (via composant Icon), Tailwind (charte navy/doré). Tests = scripts node (`assert`).

Spec : `docs/superpowers/specs/2026-06-16-scripts-mise-en-forme-design.md`

---

## File Structure

| Fichier | Responsabilité | Action |
|---------|----------------|--------|
| `client/src/components/ui/Icon.jsx` | Ajouter icônes bold/italic/underline | Modify |
| `client/src/utils/scriptContenu.js` | Helpers : whitelist sanitize + détection HTML + rendu | Create |
| `client/src/components/RichTextEditor.jsx` | Éditeur visuel (barre + zone contentEditable) | Create |
| `client/src/pages/ScriptsPage.jsx` | Intègre l'éditeur (form) et le helper (ScriptCard) | Modify |
| `server/test/scripts-format.test.js` | Test CRUD conserve le HTML | Create |

DOMPurify est déjà une dépendance transitive (chunk `purify.es` dans le build). Vérifier en Task 0 qu'il est importable comme `dompurify`, sinon l'ajouter aux deps client.

---

## Task 0 : Vérifier la disponibilité de DOMPurify

**Files:** aucun (vérification).

- [ ] **Step 1: Vérifier que dompurify est résolvable côté client**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && node -e "require.resolve('dompurify', {paths:['./client/node_modules']}); console.log('dompurify OK')"
```
Expected: `dompurify OK`

- [ ] **Step 2: Si absent, l'installer**

Seulement si le step 1 échoue :
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm --prefix client install dompurify
```
Expected: ajout de `dompurify` dans `client/package.json` dependencies.

- [ ] **Step 3: Commit (seulement si install effectuée)**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/package.json client/package-lock.json
git commit -m "chore(client): dompurify en dependance directe (mise en forme scripts)"
```

---

## Task 1 : Ajouter les icônes bold / italic / underline

**Files:**
- Modify: `client/src/components/ui/Icon.jsx`

- [ ] **Step 1: Ajouter les imports Lucide**

Dans `client/src/components/ui/Icon.jsx`, le bloc d'import nommé commence par `import {` et finit par `} from 'lucide-react'`. Ajouter `Bold, Italic, Underline` à la liste importée. Concrètement, remplacer la ligne :

```js
  Pin, Plus, RefreshCw, Search, Settings, Star, Table, Tag, Trash2, TriangleAlert, Trophy,
```

par :

```js
  Pin, Plus, RefreshCw, Search, Settings, Star, Table, Tag, Trash2, TriangleAlert, Trophy,
  Bold, Italic, Underline,
```

- [ ] **Step 2: Ajouter les entrées au MAP**

Dans le même fichier, dans l'objet `MAP`, ajouter ces 3 clés. Remplacer la ligne :

```js
  'trophy': Trophy, 'upload': Upload, 'user': User, 'users': Users, 'voicemail': Voicemail, 'x': X,
```

par :

```js
  'trophy': Trophy, 'upload': Upload, 'user': User, 'users': Users, 'voicemail': Voicemail, 'x': X,
  'bold': Bold, 'italic': Italic, 'underline': Underline,
```

- [ ] **Step 3: Vérifier le build**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -3
```
Expected: `✓ built` sans erreur.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/components/ui/Icon.jsx
git commit -m "feat(ui): icones bold/italic/underline pour l'editeur de scripts"
```

---

## Task 2 : Helpers sanitize + détection HTML (avec tests)

**Files:**
- Create: `client/src/utils/scriptContenu.js`
- Test: `client/src/utils/scriptContenu.test.js`

Ce module isole la logique de sécurité et de rétrocompat. Testé sans navigateur :
DOMPurify nécessite un DOM, donc le test couvre uniquement `contientHtml` (pure).
Le sanitize est validé en vérif navigateur live (Task 5).

- [ ] **Step 1: Écrire le test de détection HTML (qui échoue)**

Créer `client/src/utils/scriptContenu.test.js` :

```js
// Test pur (sans DOM) de contientHtml. Lance : node client/src/utils/scriptContenu.test.js
const assert = require('assert')
const { contientHtml } = require('./scriptContenu.cjs')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('scriptContenu.test.js')

test('texte brut multi-lignes -> pas de HTML', () => {
  assert.strictEqual(contientHtml('Bonjour [Prénom],\nComment allez-vous ?'), false)
})

test('contenu avec <b> -> HTML', () => {
  assert.strictEqual(contientHtml('Bonjour <b>important</b>'), true)
})

test('contenu avec <br> -> HTML', () => {
  assert.strictEqual(contientHtml('ligne1<br>ligne2'), true)
})

test('chaine vide -> pas de HTML', () => {
  assert.strictEqual(contientHtml(''), false)
})

test('texte avec < seul (math) -> pas de HTML', () => {
  assert.strictEqual(contientHtml('si x < 3 alors'), false)
})
```

Note : le test importe `./scriptContenu.cjs` (version CommonJS de la fonction pure)
parce que le test tourne sous node sans bundler. Le module ESM réel
(`scriptContenu.js`) ré-exporte la même logique pour l'app.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && node client/src/utils/scriptContenu.test.js
```
Expected: FAIL — `Cannot find module './scriptContenu.cjs'`.

- [ ] **Step 3: Créer la logique pure CommonJS**

Créer `client/src/utils/scriptContenu.cjs` :

```js
// Logique pure partagée (testable sous node). Pas d'import DOM ici.
const BALISES = /<(b|strong|i|em|u|br|div|p)(\s|>|\/)/i

// Vrai si le contenu contient une de nos balises de mise en forme connues.
// Un "<" isolé (ex: "x < 3") ne déclenche pas la détection.
function contientHtml(contenu) {
  if (!contenu) return false
  return BALISES.test(contenu)
}

module.exports = { contientHtml, BALISES }
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && node client/src/utils/scriptContenu.test.js
```
Expected: 5 lignes `OK`.

- [ ] **Step 5: Créer le module ESM consommé par l'app**

Créer `client/src/utils/scriptContenu.js` :

```js
import DOMPurify from 'dompurify'

// Balises de mise en forme autorisées : gras, italique, souligné + structure minimale.
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'p']
const BALISES = /<(b|strong|i|em|u|br|div|p)(\s|>|\/)/i

// Vrai si le contenu contient une de nos balises connues (sinon = texte brut hérité).
export function contientHtml(contenu) {
  if (!contenu) return false
  return BALISES.test(contenu)
}

// Nettoie le HTML : ne garde que G/I/U + sauts/paragraphes, aucun attribut.
export function sanitizeContenu(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}
```

- [ ] **Step 6: Vérifier le build**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -3
```
Expected: `✓ built` sans erreur.

- [ ] **Step 7: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/utils/scriptContenu.js client/src/utils/scriptContenu.cjs client/src/utils/scriptContenu.test.js
git commit -m "feat(scripts): helpers sanitize + detection HTML (retrocompat)"
```

---

## Task 3 : Composant RichTextEditor

**Files:**
- Create: `client/src/components/RichTextEditor.jsx`

Composant non testé en unitaire (contentEditable + execCommand = besoin d'un vrai
navigateur). Validé en vérif navigateur live (Task 5).

- [ ] **Step 1: Créer le composant**

Créer `client/src/components/RichTextEditor.jsx` :

```jsx
import { useRef, useEffect, useState, useCallback } from 'react'
import Icon from './ui/Icon'

const BOUTONS = [
  { cmd: 'bold', icon: 'bold', label: 'Gras' },
  { cmd: 'italic', icon: 'italic', label: 'Italique' },
  { cmd: 'underline', icon: 'underline', label: 'Souligné' },
]

// Éditeur de texte enrichi minimal : gras / italique / souligné.
// value = HTML string, onChange(html) remonte le HTML brut (sanitize au save côté parent).
export default function RichTextEditor({ value, onChange }) {
  const ref = useRef(null)
  const [actifs, setActifs] = useState({ bold: false, italic: false, underline: false })

  // Initialise le contenu une seule fois (évite de casser la position du curseur en frappe).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const majActifs = useCallback(() => {
    setActifs({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    })
  }, [])

  const exec = (cmd) => {
    document.execCommand(cmd, false, null)
    if (ref.current) onChange(ref.current.innerHTML)
    majActifs()
    if (ref.current) ref.current.focus()
  }

  const onInput = () => { if (ref.current) onChange(ref.current.innerHTML) }

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {BOUTONS.map(b => (
          <button
            key={b.cmd}
            type="button"
            aria-label={b.label}
            aria-pressed={actifs[b.cmd]}
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec(b.cmd)}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded border transition-colors ${
              actifs[b.cmd]
                ? 'bg-quai-gold/20 border-quai-gold text-quai-navy'
                : 'bg-white border-quai-border text-quai-muted hover:text-quai-navy hover:border-quai-gold/50'
            }`}
          >
            <Icon name={b.icon} size="sm" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Contenu du script"
        onInput={onInput}
        onKeyUp={majActifs}
        onMouseUp={majActifs}
        className="input resize-none min-h-[12rem] overflow-y-auto whitespace-pre-wrap text-left"
        suppressContentEditableWarning
      />
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le build**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -3
```
Expected: `✓ built` sans erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/components/RichTextEditor.jsx
git commit -m "feat(scripts): composant RichTextEditor (barre G/I/U + contentEditable)"
```

---

## Task 4 : Intégrer l'éditeur et le rendu dans ScriptsPage

**Files:**
- Modify: `client/src/pages/ScriptsPage.jsx`

- [ ] **Step 1: Ajouter les imports (lazy editor + helpers)**

Dans `client/src/pages/ScriptsPage.jsx`, après la ligne :

```js
import { useState, useEffect } from 'react'
```

remplacer par :

```js
import { useState, useEffect, lazy, Suspense } from 'react'
```

Puis, après la ligne :

```js
import ConfirmDialog from '../components/ui/ConfirmDialog'
```

ajouter :

```js
import { contientHtml, sanitizeContenu } from '../utils/scriptContenu'

const RichTextEditor = lazy(() => import('../components/RichTextEditor'))
```

- [ ] **Step 2: Sanitize le contenu HTML à la sauvegarde**

Dans la fonction `save`, remplacer :

```js
  const save = async () => {
    if (!form.titre || !form.contenu) { toast.error('Titre et contenu requis'); return }
    try {
      if (editId) {
        await api.put(`/scripts/${editId}`, form)
        toast.success('Script mis à jour')
      } else {
        await api.post('/scripts', form)
        toast.success('Script créé')
      }
      setEditId(null); setShowNew(false); load()
    } catch { toast.error('Erreur') }
  }
```

par :

```js
  const save = async () => {
    if (!form.titre || !form.contenu) { toast.error('Titre et contenu requis'); return }
    const payload = { ...form, contenu: sanitizeContenu(form.contenu) }
    try {
      if (editId) {
        await api.put(`/scripts/${editId}`, payload)
        toast.success('Script mis à jour')
      } else {
        await api.post('/scripts', payload)
        toast.success('Script créé')
      }
      setEditId(null); setShowNew(false); load()
    } catch { toast.error('Erreur') }
  }
```

- [ ] **Step 3: Remplacer le textarea par l'éditeur**

Remplacer le bloc :

```jsx
            <div className="mb-3">
              <label className="block text-xs font-medium text-quai-muted mb-1">Contenu du script</label>
              <textarea className="input resize-none" rows={8} value={form.contenu}
                onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))}
                placeholder="Rédigez votre script… Utilisez [Prénom], [Votre prénom], etc." />
            </div>
```

par :

```jsx
            <div className="mb-3">
              <label className="block text-xs font-medium text-quai-muted mb-1">Contenu du script</label>
              <Suspense fallback={<div className="input min-h-[12rem] text-quai-muted">Chargement de l'éditeur…</div>}>
                <RichTextEditor
                  key={editId ?? 'nouveau'}
                  value={form.contenu}
                  onChange={html => setForm(f => ({ ...f, contenu: html }))}
                />
              </Suspense>
            </div>
```

Note : `key={editId ?? 'nouveau'}` force le remontage de l'éditeur quand on
change de script édité, pour ré-initialiser proprement son `innerHTML`.

- [ ] **Step 4: Rendre le contenu formaté dans ScriptCard**

Dans le composant `ScriptCard`, remplacer le bloc :

```jsx
      {open && (
        <div className="mt-3 p-4 bg-quai-light rounded-lg text-sm text-quai-text whitespace-pre-wrap border-l-4 border-quai-gold">
          {script.contenu}
        </div>
      )}
```

par :

```jsx
      {open && (
        contientHtml(script.contenu) ? (
          <div
            className="mt-3 p-4 bg-quai-light rounded-lg text-sm text-quai-text border-l-4 border-quai-gold"
            dangerouslySetInnerHTML={{ __html: sanitizeContenu(script.contenu) }}
          />
        ) : (
          <div className="mt-3 p-4 bg-quai-light rounded-lg text-sm text-quai-text whitespace-pre-wrap border-l-4 border-quai-gold">
            {script.contenu}
          </div>
        )
      )}
```

- [ ] **Step 5: Vérifier le build**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -3
```
Expected: `✓ built` sans erreur.

- [ ] **Step 6: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/ScriptsPage.jsx
git commit -m "feat(scripts): editeur de mise en forme + rendu securise dans ScriptsPage"
```

---

## Task 5 : Test serveur (le HTML survit au CRUD) + vérif navigateur

**Files:**
- Create: `server/test/scripts-format.test.js`

- [ ] **Step 1: Écrire le test serveur**

Créer `server/test/scripts-format.test.js` :

```js
const assert = require('assert')

// DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-test-scripts-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('scripts-format.test.js')

test('insert + read conserve le HTML de mise en forme', () => {
  const html = 'Bonjour <b>important</b> puis <i>doux</i> et <u>souligne</u>'
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test format', html, 0)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, html)
})

test('update conserve le HTML', () => {
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test maj', 'avant', 0)
  const html = 'apres <b>gras</b>'
  db.prepare('UPDATE scripts SET contenu = ? WHERE id = ?').run(html, info.lastInsertRowid)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, html)
})

test('texte brut multi-lignes inchange (retrocompat)', () => {
  const brut = 'Ligne 1\nLigne 2\nLigne 3'
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test brut', brut, 0)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, brut)
})
```

- [ ] **Step 2: Lancer le test serveur**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/scripts-format.test.js
```
Expected: 3 lignes `OK`.

- [ ] **Step 3: Relancer le test helper client (non-régression)**

Run:
```bash
cd /Users/loickferrucci/Desktop/immo-relances && node client/src/utils/scriptContenu.test.js
```
Expected: 5 lignes `OK`.

- [ ] **Step 4: Vérif navigateur live**

Lancer le preview (workaround port 5180) :
```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm --prefix client run dev -- --port 5180 --strictPort
```
Puis, connecté en admin sur `http://localhost:5180`, page « Scripts d'appel » :
1. Cliquer « Nouveau script » (ou « Modifier » un script existant).
2. Vérifier que la barre G / I / U s'affiche (icônes, pas des ronds).
3. Taper du texte, le sélectionner, cliquer G → le texte passe en gras dans l'éditeur ; le bouton G devient actif (fond doré).
4. Sauvegarder → déplier la carte du script → le gras s'affiche dans le rendu.
5. Déplier un ancien script (texte brut) → sauts de ligne préservés, pas de balises visibles.

Critère de succès : les 3 styles fonctionnent à l'édition et au rendu ; les anciens scripts restent lisibles.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add server/test/scripts-format.test.js
git commit -m "test(scripts): le HTML de mise en forme survit au CRUD"
```

---

## Task 6 : Déploiement et vérification prod

- [ ] **Step 1: Push sur main**

```bash
cd /Users/loickferrucci/Desktop/immo-relances && git push origin main
```
Railway redéploie automatiquement.

- [ ] **Step 2: Vérifier le déploiement (signature = nouveau index chunk)**

Récupérer le nom du nouveau `index-*.js` du build local :
```bash
cd /Users/loickferrucci/Desktop/immo-relances && ls -1 client/dist/assets/index-*.js
```
Puis poller la prod jusqu'à ce qu'elle serve ce chunk :
```bash
BASE="https://immo-relances-production.up.railway.app"
curl -s "$BASE/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
```
Expected (une fois déployé) : le nom du chunk local.

- [ ] **Step 3: Vérif fonctionnelle prod**

Sur la prod en admin, refaire le scénario de Task 5 step 4 (créer/éditer un script avec du gras, vérifier le rendu). Confirmer qu'un script existant non formaté reste lisible.

---

## Notes d'implémentation

- **Pas d'emoji** dans l'UI (charte). Icônes via composant `Icon` uniquement.
- **Charte** navy `#0D0D2B` / doré `#C9A96E`, police Jost — réutiliser les classes `quai-*` existantes.
- **Sécurité** : double sanitize (save + affichage), whitelist stricte sans attributs. Aucun `<a>`, `<script>`, `on*`, `style`.
- **DRY** : la whitelist et la détection vivent dans `scriptContenu.js` (un seul endroit).
- **Routes serveur et schéma DB inchangés** — la colonne `contenu TEXT` accueille le HTML sans migration.
