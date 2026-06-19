# Tri par colonne + suivi dans l'export — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** (1) Trier la liste Contacts en cliquant un menu sur chaque colonne (croissant/décroissant/réinitialiser). (2) Inclure le dernier suivi (issue+note+date) dans l'export CSV.

**Architecture:** Serveur : whitelist de tri élargie (+ telephone, ville, derniere_relance_date) ; export joint la dernière relance. Client : entêtes avec menu de tri maison (réutilise sort/order existant).

**Tech Stack:** Express + better-sqlite3, React, lucide Icon. Tests = node.

Spec : `docs/superpowers/specs/2026-06-19-tri-colonnes-export-suivi-design.md`

---

## Task 1 : Serveur — whitelist tri + export avec dernier suivi

**Files:**
- Modify: `server/src/routes/contactRoutes.js`
- Test: `server/test/export-suivi.test.js`

Contexte vérifié :
- `validSorts` (ligne 38) : `['score_priorite', 'nom', 'date_dernier_contact', 'prochain_contact', 'created_at', 'categorie', 'statut']`.
- La requête liste expose déjà l'alias `derniere_relance_date` (LEFT JOIN dernière relance).
- Export (lignes 277-290) : `SELECT * FROM contacts ORDER BY nom`, header + rows en dur.

- [ ] **Step 1: Test export (échoue)**

Créer `server/test/export-suivi.test.js` :

```js
const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-exp-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('export-suivi.test.js')

const AGENT = db.prepare("SELECT id FROM users WHERE role='agent'").get().id
const c1 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('EXPORTE','Jean','0600000001','autre','a_contacter')").run().lastInsertRowid
db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now'))").run(c1, AGENT, 'rdv_obtenu', 'note de suivi export', 'projet')

// reproduit la requête export (avec dernière relance) que l'endpoint utilisera
function exportRows() {
  return db.prepare(`
    SELECT contacts.*,
      dr.issue AS dernier_suivi_issue, dr.notes AS dernier_suivi_note, dr.created_at AS dernier_suivi_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY contacts.nom
  `).all()
}

test('export inclut le dernier suivi du contact', () => {
  const rows = exportRows()
  const r = rows.find(x => x.id === c1)
  assert.strictEqual(r.dernier_suivi_issue, 'projet')
  assert.strictEqual(r.dernier_suivi_note, 'note de suivi export')
  assert.ok(r.dernier_suivi_date)
})
```

- [ ] **Step 2: Lancer**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/export-suivi.test.js`
Expected: 1 OK (valide la requête SQL).

- [ ] **Step 3: Élargir la whitelist de tri**

Dans `server/src/routes/contactRoutes.js`, remplacer :

```js
  const validSorts = ['score_priorite', 'nom', 'date_dernier_contact', 'prochain_contact', 'created_at', 'categorie', 'statut'];
```

par :

```js
  const validSorts = ['score_priorite', 'nom', 'telephone', 'ville', 'date_dernier_contact', 'prochain_contact', 'created_at', 'categorie', 'statut', 'derniere_relance_date'];
```

- [ ] **Step 4: Adapter l'ORDER BY pour l'alias derniere_relance_date**

Toujours dans la requête liste, le `ORDER BY contacts.${sortCol}` préfixe `contacts.`,
ce qui casserait pour l'alias `derniere_relance_date` (pas une colonne de contacts).
Repérer :

```js
    ORDER BY contacts.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```

Remplacer par (préfixe `contacts.` seulement si la colonne appartient à contacts) :

```js
    ORDER BY ${sortCol === 'derniere_relance_date' ? 'derniere_relance_date' : 'contacts.' + sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
```

- [ ] **Step 5: Export — joindre la dernière relance + 3 colonnes**

Remplacer tout le handler export :

```js
router.get('/export/csv', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY nom').all();
  const header = 'id,nom,prenom,telephone,telephone2,email,adresse,code_postal,ville,categorie,statut,score_priorite,potentiel,date_dernier_contact,prochain_contact,nombre_tentatives,notes,tags,created_at\n';
  const rows = contacts.map(c =>
    [c.id, c.nom, c.prenom, c.telephone, c.telephone2, c.email, c.adresse, c.code_postal, c.ville,
     c.categorie, c.statut, c.score_priorite, c.potentiel, c.date_dernier_contact, c.prochain_contact,
     c.nombre_tentatives, (c.notes || '').replace(/,/g, ';').replace(/\n/g, ' '), c.tags, c.created_at]
    .map(v => `"${v ?? ''}"`)
    .join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts_export.csv"');
  res.send('﻿' + header + rows);
});
```

par :

```js
const ISSUE_LABEL_EXPORT = {
  sans_reponse: 'Sans réponse', projet: 'Projet (estimation/RDV)',
  rappel: 'A recontacter plus tard', demenage: "N'habite plus a l'adresse",
  sans_projet: 'Plus de projet', autre: 'Autre',
};

router.get('/export/csv', (req, res) => {
  const contacts = db.prepare(`
    SELECT contacts.*,
      dr.issue AS dernier_suivi_issue, dr.notes AS dernier_suivi_note, dr.created_at AS dernier_suivi_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY contacts.nom
  `).all();
  const clean = (v) => (v || '').replace(/,/g, ';').replace(/\n/g, ' ');
  const header = 'id,nom,prenom,telephone,telephone2,email,adresse,code_postal,ville,categorie,statut,score_priorite,potentiel,date_dernier_contact,prochain_contact,nombre_tentatives,notes,tags,created_at,dernier_suivi_issue,dernier_suivi_note,dernier_suivi_date\n';
  const rows = contacts.map(c =>
    [c.id, c.nom, c.prenom, c.telephone, c.telephone2, c.email, c.adresse, c.code_postal, c.ville,
     c.categorie, c.statut, c.score_priorite, c.potentiel, c.date_dernier_contact, c.prochain_contact,
     c.nombre_tentatives, clean(c.notes), c.tags, c.created_at,
     c.dernier_suivi_issue ? (ISSUE_LABEL_EXPORT[c.dernier_suivi_issue] || c.dernier_suivi_issue) : '',
     clean(c.dernier_suivi_note), c.dernier_suivi_date || '']
    .map(v => `"${v ?? ''}"`)
    .join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts_export.csv"');
  res.send('﻿' + header + rows);
});
```

- [ ] **Step 6: Relancer le test + non-régression**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/export-suivi.test.js`
Expected: 1 OK.
Run: `cd /Users/loickferrucci/Desktop/immo-relances && for t in server/test/*.test.js; do JWT_SECRET=dev node "$t" 2>&1 | grep FAIL && echo "REGRESSION $t" || true; done; echo fin`
Expected: aucune ligne FAIL.

- [ ] **Step 7: Vérif HTTP du tri par derniere_relance_date (ne plante pas)**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
rm -f /tmp/immo-tri.db
DB_PATH=/tmp/immo-tri.db JWT_SECRET=dev PORT=3001 node server/src/index.js > /tmp/tri.log 2>&1 &
sleep 2
T=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@lequai-immobilier.com","password":"admin123"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')
curl -s -o /dev/null -w "tri derniere_relance_date HTTP %{http_code}\n" "http://localhost:3001/api/contacts?sort=derniere_relance_date&order=ASC" -H "Authorization: Bearer $T"
curl -s -o /dev/null -w "export HTTP %{http_code}\n" "http://localhost:3001/api/contacts/export/csv" -H "Authorization: Bearer $T"
lsof -tiTCP:3001 -sTCP:LISTEN | xargs kill 2>/dev/null; rm -f /tmp/immo-tri.db
```
Expected: les 2 → HTTP 200.

- [ ] **Step 8: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add server/src/routes/contactRoutes.js server/test/export-suivi.test.js
git commit -m "feat(contacts): tri par telephone/ville/dernier suivi + export inclut le dernier suivi"
```

---

## Task 2 : Client — menu de tri sur les colonnes

**Files:**
- Modify: `client/src/pages/ContactsPage.jsx`

Contexte : états `sort`/`order` + setters existent. Le `<thead>` a 9 `<th>` simples
(lignes 141-149). `Icon` importé. Clic ailleurs doit fermer le menu.

- [ ] **Step 1: Ajouter l'état du menu ouvert + un effet de fermeture**

Après les états existants (vers le haut du composant, près des autres useState),
ajouter :

```jsx
  const [menuTri, setMenuTri] = useState(null) // clé de colonne dont le menu est ouvert
```

Et, près des autres `useEffect`, ajouter un effet qui ferme le menu au clic global :

```jsx
  useEffect(() => {
    if (!menuTri) return
    const close = () => setMenuTri(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuTri])
```

- [ ] **Step 2: Ajouter un composant ColonneTriable (DRY) dans le fichier**

En bas du fichier (après la fonction principale `ContactsPage`, niveau module),
ajouter :

```jsx
function ColonneTriable({ label, cle, sort, order, menuTri, setMenuTri, setSort, setOrder, setPage }) {
  const actif = sort === cle
  const fleche = actif ? (order === 'ASC' ? ' ↑' : ' ↓') : ''
  const choisir = (e, newOrder) => {
    e.stopPropagation()
    if (newOrder === null) { setSort('score_priorite'); setOrder('DESC') }
    else { setSort(cle); setOrder(newOrder) }
    setPage(1)
    setMenuTri(null)
  }
  return (
    <th className="text-left px-4 py-3 font-medium text-quai-muted relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuTri(menuTri === cle ? null : cle) }}
        className="inline-flex items-center gap-1 hover:text-quai-navy"
      >
        {label}{fleche}
        <Icon name="chevron-down" size="sm" className="opacity-50" />
      </button>
      {menuTri === cle && (
        <div className="absolute z-20 mt-1 left-4 bg-white border border-quai-border rounded-lg shadow-lg text-sm text-quai-text min-w-[180px] py-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="block w-full text-left px-3 py-2 hover:bg-quai-light" onClick={(e) => choisir(e, 'ASC')}>Tri croissant</button>
          <button type="button" className="block w-full text-left px-3 py-2 hover:bg-quai-light" onClick={(e) => choisir(e, 'DESC')}>Tri décroissant</button>
          <button type="button" className="block w-full text-left px-3 py-2 hover:bg-quai-light text-quai-muted" onClick={(e) => choisir(e, null)}>Réinitialiser le tri</button>
        </div>
      )}
    </th>
  )
}
```

- [ ] **Step 3: Remplacer le bloc des 9 `<th>`**

Remplacer :

```jsx
              <tr>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Téléphone</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Ville</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Dernier suivi</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Score</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Dernier contact</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Prochain</th>
              </tr>
```

par :

```jsx
              <tr>
                {[
                  ['Nom', 'nom'], ['Téléphone', 'telephone'], ['Ville', 'ville'],
                  ['Catégorie', 'categorie'], ['Statut', 'statut'],
                  ['Dernier suivi', 'derniere_relance_date'], ['Score', 'score_priorite'],
                  ['Dernier contact', 'date_dernier_contact'], ['Prochain', 'prochain_contact'],
                ].map(([label, cle]) => (
                  <ColonneTriable
                    key={cle} label={label} cle={cle}
                    sort={sort} order={order} menuTri={menuTri} setMenuTri={setMenuTri}
                    setSort={setSort} setOrder={setOrder} setPage={setPage}
                  />
                ))}
              </tr>
```

- [ ] **Step 4: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/ContactsPage.jsx
git commit -m "feat(contacts): menu de tri (croissant/decroissant/reinitialiser) sur chaque colonne"
```

---

## Task 3 : Vérif navigateur + déploiement

- [ ] **Step 1: Vérif live**

Seed quelques contacts (noms/villes/scores variés, certains avec relance récente).
Onglet Contacts :
1. Cliquer l'icône d'une colonne (ex Nom) → menu → "Tri croissant" → liste triée A→Z, flèche ↑ sur Nom.
2. "Tri décroissant" → Z→A, flèche ↓.
3. "Réinitialiser" → revient au tri Score décroissant.
4. Tri "Dernier suivi" → ordonne par date de dernière relance (pas d'erreur).
5. Cliquer ailleurs → le menu se ferme.
6. Export → ouvrir le CSV → colonnes `dernier_suivi_issue/note/date` présentes et remplies.

- [ ] **Step 2: Push + poll**

`ls -1 client/dist/assets/index-*.js`, push, poller la prod.

- [ ] **Step 3: Vérif prod**

Trier une colonne en prod ; exporter et vérifier les colonnes de suivi.

---

## Notes

- Tri reste serveur (sur toute la base, pas juste la page). Pas de migration.
- Le dropdown "Trier" existant est conservé (partage sort/order).
- `derniere_relance_date` triable via l'alias de la sous-requête (NULL en dernier/premier selon sens — acceptable).
- Charte navy/doré, pas d'emoji, Icon pour les chevrons.
