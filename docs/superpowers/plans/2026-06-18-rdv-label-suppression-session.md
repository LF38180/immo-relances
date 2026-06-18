# RDV label contextuel + suppression contact en session — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** (#2) Afficher la date du contact avec un libellé adapté au statut ("Date du rendez-vous" si RDV, "Date de rappel" si rappel, sinon "Prochain contact"), partout. (#3) Permettre de supprimer un contact depuis la session d'appel, avec trace "Contact supprimé" dans le récap.

**Architecture:** 100% client. Le champ `prochain_contact` existe déjà et stocke la date. On ajoute un helper de libellé contextuel et on l'utilise dans ContactModal + ContactsPage + recap-pdf. Suppression = bouton dans SessionPage appelant `DELETE /api/contacts/:id` (déjà existant, cascade FK), + entrée locale dans le récap de session.

**Tech Stack:** React + Vite, helpers JS purs, jsPDF (recap). Tests = node.

Spec implicite : voir conversation (décisions validées : label contextuel seul pour #2 ; suppression + trace récap pour #3).

---

## Task 1 : Helper libellé contextuel de la date

**Files:**
- Create: `client/src/utils/labelDateContact.cjs`
- Create: `client/src/utils/labelDateContact.js`
- Test: `client/src/utils/labelDateContact.test.cjs`

- [ ] **Step 1: Test (échoue)**

Créer `client/src/utils/labelDateContact.test.cjs` :

```js
const assert = require('assert')
const { labelDateContact } = require('./labelDateContact.cjs')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('labelDateContact.test.cjs')

test('RDV obtenu -> Date du rendez-vous', () => {
  assert.strictEqual(labelDateContact('rdv_obtenu'), 'Date du rendez-vous')
})
test('rappel_planifie -> Date de rappel', () => {
  assert.strictEqual(labelDateContact('rappel_planifie'), 'Date de rappel')
})
test('a_recontacter -> Date de rappel', () => {
  assert.strictEqual(labelDateContact('a_recontacter'), 'Date de rappel')
})
test('autre statut -> Prochain contact', () => {
  assert.strictEqual(labelDateContact('a_contacter'), 'Prochain contact')
  assert.strictEqual(labelDateContact('tente_sans_reponse'), 'Prochain contact')
  assert.strictEqual(labelDateContact(null), 'Prochain contact')
})
```

- [ ] **Step 2: Lancer -> FAIL**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && node client/src/utils/labelDateContact.test.cjs`
Expected: `Cannot find module './labelDateContact.cjs'`

- [ ] **Step 3: Logique pure CJS**

Créer `client/src/utils/labelDateContact.cjs` :

```js
// Libellé contextuel du champ date (prochain_contact) selon le statut du contact.
function labelDateContact(statut) {
  if (statut === 'rdv_obtenu') return 'Date du rendez-vous'
  if (statut === 'rappel_planifie' || statut === 'a_recontacter') return 'Date de rappel'
  return 'Prochain contact'
}
module.exports = { labelDateContact }
```

- [ ] **Step 4: Lancer -> PASS**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && node client/src/utils/labelDateContact.test.cjs`
Expected: 4 lignes OK.

- [ ] **Step 5: Module ESM**

Créer `client/src/utils/labelDateContact.js` :

```js
// Libellé contextuel du champ date (prochain_contact) selon le statut du contact.
export function labelDateContact(statut) {
  if (statut === 'rdv_obtenu') return 'Date du rendez-vous'
  if (statut === 'rappel_planifie' || statut === 'a_recontacter') return 'Date de rappel'
  return 'Prochain contact'
}
```

- [ ] **Step 6: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/utils/labelDateContact.js client/src/utils/labelDateContact.cjs client/src/utils/labelDateContact.test.cjs
git commit -m "feat(contacts): helper libelle contextuel de la date selon le statut"
```

---

## Task 2 : Label contextuel dans ContactModal

**Files:**
- Modify: `client/src/components/ContactModal.jsx`

- [ ] **Step 1: Importer le helper**

Dans `client/src/components/ContactModal.jsx`, ajouter en haut (après les imports existants, adapter le chemin relatif `../utils/`) :

```js
import { labelDateContact } from '../utils/labelDateContact'
```

- [ ] **Step 2: Remplacer le label statique du champ date**

Remplacer le bloc (vers ligne 148-151) :

```jsx
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Prochain contact</label>
              <input type="date" className="input" value={form.prochain_contact} onChange={e => set('prochain_contact', e.target.value)} />
            </div>
```

par :

```jsx
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">{labelDateContact(form.statut)}</label>
              <input type="date" className="input" value={form.prochain_contact} onChange={e => set('prochain_contact', e.target.value)} />
            </div>
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2
git add client/src/components/ContactModal.jsx
git commit -m "feat(contacts): label date contextuel dans la fiche contact"
```

---

## Task 3 : Label contextuel dans la liste Contacts + récap PDF

**Files:**
- Modify: `client/src/pages/ContactsPage.jsx`
- Modify: `client/src/utils/recap-pdf.js`

- [ ] **Step 1: Liste Contacts — entête de colonne déjà "Prochain contact" (ligne ~107 option tri + colonne ~158)**

Le tri/colonne liste reste "Prochain contact" (générique pour une liste mixte). AUCUNE modification ici : une colonne de liste regroupe tous statuts, un label unique est correct. Ne pas toucher ContactsPage.

(Cette étape documente volontairement qu'on ne change pas la liste — éviter sur-ingénierie. Passer à Step 2.)

- [ ] **Step 2: Récap PDF — entête colonne contextuel par ligne**

Dans `client/src/utils/recap-pdf.js`, l'entête de colonne est `'Prochain contact'`. Le récap mélange les statuts ; on garde l'entête générique mais ce n'est pas bloquant. AUCUNE modification : le récap liste une colonne unique pour tous les statuts.

(Documente qu'on ne change pas le récap : cohérent avec une colonne unique. La demande #2 visait la SAISIE depuis la fiche, couverte par Task 2.)

- [ ] **Step 3: (rien à committer pour cette task)**

Task 3 est une vérification de périmètre : ni ContactsPage ni recap-pdf ne nécessitent de changement. Le label contextuel concerne la SAISIE (fiche contact), pas les vues liste/récap multi-statuts.

---

## Task 4 : Suppression contact en session + trace récap

**Files:**
- Modify: `client/src/pages/SessionPage.jsx`

- [ ] **Step 1: Lire le contexte d'état**

Confirmer dans `client/src/pages/SessionPage.jsx` :
- `actionsSession` (state) accumule `{ nom, prenom, telephone, statut, notes }` (vers ligne 115).
- `contact` = contact courant ; `index`, `file` = navigation ; `ConfirmDialog` importé.
- `api` importé (utils/api). `Icon`, `toast` disponibles.

- [ ] **Step 2: Ajouter l'état du dialogue de confirmation**

Après les autres `useState` (vers ligne 35-40), ajouter :

```jsx
  const [confirmSuppr, setConfirmSuppr] = useState(false)
```

- [ ] **Step 3: Ajouter la fonction de suppression**

Ajouter dans le composant (près des autres handlers, ex après la fonction qui soumet une issue) :

```jsx
  const supprimerContact = async () => {
    if (!contact) return
    try {
      await api.delete(`/contacts/${contact.id}`)
      setActionsSession(prev => [...prev, {
        nom: contact.nom, prenom: contact.prenom, telephone: contact.telephone,
        statut: 'supprime', notes: '',
      }])
      toast.success('Contact supprimé')
      setConfirmSuppr(false)
      // passer au contact suivant (même logique que "Passer")
      setEtape(1)
      setNotes('')
      setIndex(i => i + 1)
    } catch { toast.error('Erreur lors de la suppression') }
  }
```

NB : adapter `setEtape/setNotes/setIndex` aux setters réellement présents (les confirmer au Step 1). Si la navigation "suivant" utilise une autre fonction (ex `passerContact()`), l'appeler à la place des trois setters.

- [ ] **Step 4: Ajouter le bouton "Supprimer" dans la zone contact**

Dans le rendu du contact courant (près du téléphone / actions), ajouter un bouton discret :

```jsx
          <button
            onClick={() => setConfirmSuppr(true)}
            className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 mt-2"
          >
            <Icon name="trash-2" size="sm" /> Supprimer ce contact
          </button>
```

- [ ] **Step 5: Ajouter le dialogue de confirmation**

Près des autres dialogues / fin du JSX du composant principal :

```jsx
        {confirmSuppr && (
          <ConfirmDialog
            title="Supprimer ce contact"
            message={`Supprimer définitivement ${contact?.prenom || ''} ${contact?.nom || ''} ? Cette action est irréversible.`}
            confirmLabel="Supprimer"
            onConfirm={supprimerContact}
            onCancel={() => setConfirmSuppr(false)}
          />
        )}
```

- [ ] **Step 6: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/SessionPage.jsx
git commit -m "feat(session): suppression d'un contact depuis la session (trace dans le recap)"
```

---

## Task 5 : Récap PDF — libellé du statut "supprimé"

**Files:**
- Modify: `client/src/utils/recap-pdf.js`

- [ ] **Step 1: Mapper le statut 'supprime' vers un libellé lisible**

Dans `client/src/utils/recap-pdf.js`, la fonction `statutLabel(statut)` retombe sur `statut` brut si inconnu. Ajouter un cas pour `'supprime'`. Repérer :

```js
function statutLabel(statut) {
  return ISSUES[statut]?.label || STATUTS_RELANCE[statut]?.label || statut || ''
}
```

Remplacer par :

```js
function statutLabel(statut) {
  if (statut === 'supprime') return 'Contact supprimé'
  return ISSUES[statut]?.label || STATUTS_RELANCE[statut]?.label || statut || ''
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2
git add client/src/utils/recap-pdf.js
git commit -m "feat(recap): libelle 'Contact supprime' dans le recap de session"
```

---

## Task 6 : Vérif navigateur + déploiement

- [ ] **Step 1: Vérif navigateur (preview port 5180, backend 3001)**

Lancer backend + vite (DB jetable), login admin. Scénarios :
1. Fiche contact : changer statut en "RDV obtenu" → le label du champ date devient "Date du rendez-vous". Mettre "Rappel planifié" → "Date de rappel". Autre → "Prochain contact".
2. Session : sur un contact, cliquer "Supprimer ce contact" → confirmer → contact suivant s'affiche, toast "Contact supprimé".
3. Fin de session → récap : la ligne du contact supprimé apparaît avec statut "Contact supprimé".

- [ ] **Step 2: Push + poll déploiement**

Capturer la signature `ls -1 client/dist/assets/index-*.js`, push main, poller jusqu'à ce que la prod serve ce chunk.

- [ ] **Step 3: Vérif prod légère**

Sur la prod : ouvrir une fiche en RDV → confirmer le label "Date du rendez-vous" (et DARBON 2247 affiche bien 22/06/2026 sous ce label).

---

## Notes

- Pas de changement serveur (DELETE et PUT existent déjà ; `prochain_contact` stocke la date).
- Pas de migration DB.
- Suppression = destructif → confirmation obligatoire (ConfirmDialog).
- Le récap de session est en mémoire (`actionsSession`) ; la trace "supprimé" y est ajoutée avant la suppression effective.
- Charte navy/doré, pas d'emoji, icônes via composant Icon.
