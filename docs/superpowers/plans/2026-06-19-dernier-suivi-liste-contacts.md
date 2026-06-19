# Colonne "Dernier suivi" liste Contacts — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Afficher le dernier suivi (issue + note + date de la dernière relance) de chaque contact dans la liste Contacts, sans ouvrir la fiche.

**Architecture:** Serveur : la requête `GET /contacts` joint la relance la plus récente de chaque contact (3 champs ajoutés). Client : nouvelle colonne "Dernier suivi" (badge issue + date + note tronquée avec tooltip).

**Tech Stack:** Express + better-sqlite3, React, date-fns. Tests = node.

Spec : `docs/superpowers/specs/2026-06-19-dernier-suivi-liste-contacts-design.md`

---

## Task 1 : Serveur — joindre la dernière relance

**Files:**
- Modify: `server/src/routes/contactRoutes.js`
- Test: `server/test/dernier-suivi.test.js`

Contexte (vérifié) : la requête liste est (ligne ~43) :
```js
const contacts = db.prepare(`SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to ${where} ORDER BY contacts.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```
Table `relances` : `id, contact_id, issue, notes, created_at`.

- [ ] **Step 1: Écrire le test serveur**

Créer `server/test/dernier-suivi.test.js` :

```js
const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-suivi-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('dernier-suivi.test.js')

const AGENT = db.prepare("SELECT id FROM users WHERE role='agent'").get().id
const c1 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('AVEC','Relance','0600000001','autre','a_contacter')").run().lastInsertRowid
const c2 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('SANS','Relance','0600000002','autre','a_contacter')").run().lastInsertRowid

db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now','-2 days'))").run(c1, AGENT, 'contacte', 'vieille note', 'autre')
db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now'))").run(c1, AGENT, 'rdv_obtenu', 'derniere note RDV', 'projet')

// requête identique à celle de l'endpoint (sous-requête dernière relance)
function listeAvecSuivi() {
  return db.prepare(`
    SELECT contacts.id, contacts.nom,
      dr.issue AS derniere_issue, dr.notes AS derniere_note, dr.created_at AS derniere_relance_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY contacts.id ASC
  `).all()
}

test('contact avec relances -> derniere relance (la plus recente)', () => {
  const rows = listeAvecSuivi()
  const r = rows.find(x => x.id === c1)
  assert.strictEqual(r.derniere_issue, 'projet')
  assert.strictEqual(r.derniere_note, 'derniere note RDV')
  assert.ok(r.derniere_relance_date)
})

test('contact sans relance -> champs null', () => {
  const rows = listeAvecSuivi()
  const r = rows.find(x => x.id === c2)
  assert.strictEqual(r.derniere_issue, null)
  assert.strictEqual(r.derniere_note, null)
  assert.strictEqual(r.derniere_relance_date, null)
})
```

- [ ] **Step 2: Lancer le test**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/dernier-suivi.test.js`
Expected: 2 OK. (Le test valide la requête SQL que l'endpoint utilisera.)

- [ ] **Step 3: Modifier la requête liste de l'endpoint**

Dans `server/src/routes/contactRoutes.js`, remplacer la ligne de la requête liste :

```js
  const contacts = db.prepare(`SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to ${where} ORDER BY contacts.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```

par :

```js
  const contacts = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom,
      dr.issue AS derniere_issue, dr.notes AS derniere_note, dr.created_at AS derniere_relance_date
    FROM contacts
    LEFT JOIN users u ON u.id = contacts.assigned_to
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ${where}
    ORDER BY contacts.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```

- [ ] **Step 4: Relancer le test**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/dernier-suivi.test.js`
Expected: 2 OK.

- [ ] **Step 5: Vérif non-régression (les autres tests serveur)**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && for t in server/test/*.test.js; do JWT_SECRET=dev node "$t" 2>&1 | grep -E "FAIL" && echo "REGRESSION dans $t" || true; done; echo "fin"`
Expected: aucune ligne FAIL.

- [ ] **Step 6: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add server/src/routes/contactRoutes.js server/test/dernier-suivi.test.js
git commit -m "feat(contacts): la liste renvoie le dernier suivi (issue/note/date)"
```

---

## Task 2 : Client — colonne "Dernier suivi"

**Files:**
- Modify: `client/src/pages/ContactsPage.jsx`

Contexte (vérifié) : `ContactsPage.jsx` importe déjà `{ CATEGORIES, STATUTS }` de constants, `format` de date-fns. La table a une entête (8 `<th>`) et des cellules. `ISSUES` est exporté par `../utils/constants` (structure `{ issue: { label, icon } }`).

- [ ] **Step 1: Importer ISSUES**

Remplacer :
```js
import { CATEGORIES, STATUTS } from '../utils/constants'
```
par :
```js
import { CATEGORIES, STATUTS, ISSUES } from '../utils/constants'
```

- [ ] **Step 2: Ajouter l'entête de colonne**

Repérer l'entête (les `<th>`), après :
```jsx
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Statut</th>
```
ajouter juste après :
```jsx
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Dernier suivi</th>
```

- [ ] **Step 3: Ajouter la cellule correspondante**

Repérer la cellule Statut dans le `<tr>` :
```jsx
                  <td className="px-4 py-3 flex flex-wrap gap-1"><StatutBadge statut={c.statut} /></td>
```
ajouter juste après :
```jsx
                  <td className="px-4 py-3 text-xs">
                    {c.derniere_issue || c.derniere_note ? (
                      <div className="max-w-[16rem]">
                        <div className="flex items-center gap-1.5 text-quai-muted">
                          <span className="font-medium text-quai-navy">{ISSUES[c.derniere_issue]?.label || c.derniere_issue || 'Suivi'}</span>
                          {c.derniere_relance_date && <span>· {format(new Date(c.derniere_relance_date.replace(' ', 'T') + 'Z'), 'dd/MM/yyyy')}</span>}
                        </div>
                        {c.derniere_note && (
                          <div className="text-quai-text truncate" title={c.derniere_note}>
                            {c.derniere_note.length > 40 ? c.derniere_note.slice(0, 40) + '…' : c.derniere_note}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-quai-muted">—</span>
                    )}
                  </td>
```

NB : `derniere_relance_date` est en UTC ('YYYY-MM-DD HH:MM:SS'). On la convertit en
ISO UTC (`.replace(' ', 'T') + 'Z'`) pour que `new Date` l'interprète en UTC puis
l'affiche en heure locale. Pour une simple date dd/MM/yyyy, l'écart de fuseau est
sans incidence pratique.

- [ ] **Step 4: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/ContactsPage.jsx
git commit -m "feat(contacts): colonne Dernier suivi dans la liste"
```

---

## Task 3 : Vérif navigateur + déploiement

- [ ] **Step 1: Vérif live (backend 3001 + vite 5180)**

Seed : un contact avec 2 relances (dont une récente avec note), un contact sans relance.
Login, onglet Contacts :
1. La colonne "Dernier suivi" affiche l'issue (label) + date + note tronquée pour le contact avec relances.
2. Survol de la note tronquée → tooltip avec le texte complet.
3. Contact sans relance → "—".

- [ ] **Step 2: Push + poll**

`ls -1 client/dist/assets/index-*.js` pour la signature, push main, poller la prod.

- [ ] **Step 3: Vérif prod**

Onglet Contacts en prod : la colonne affiche le dernier suivi des contacts réels (ex ceux appelés par Chrystelle aujourd'hui).

---

## Notes

- Pas de migration. La sous-requête s'exécute sur la page paginée (50) → coût négligeable.
- Réutilise `ISSUES` (constants) pour le label, `format` (date-fns) pour la date.
- Note tronquée à 40 caractères + tooltip `title` pour le texte complet.
- Charte navy/doré, pas d'emoji.
