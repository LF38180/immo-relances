# ImmoRelances mobile responsive + léger — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre ImmoRelances utilisable sur smartphone (~360–430 px) sans dézoomer : sidebar remplacée par une barre d'onglets en bas en mobile, pages/tableaux/modales adaptés, pour les 3 rôles ; + compression gzip serveur.

**Architecture:** Tout en Tailwind responsive, breakpoint `md` (768 px). `Layout.jsx` : sidebar `hidden md:flex` + nouvelle barre d'onglets basse `md:hidden fixed bottom-0`. Pages : padding réduit + `pb-24 md:pb-6` + tableaux en `overflow-x-auto`. Modales (via le `Modal.jsx` partagé) : overlay `p-2 md:p-4`. Légèreté : middleware `compression` dans le serveur.

**Tech Stack:** React + Vite + Tailwind + Node/Express. Vérification visuelle live (preview navigateur) à 375 / 390 / 768 px. Pas de tests unitaires CSS — les « tests » sont des contrôles scriptés dans le navigateur (débordement = `scrollW <= clientW + 1`).

**Répertoire :** `/Users/loickferrucci/Desktop/immo-relances/`
**Backend dev sur port 3001**, Vite proxy `/api` → 3001. Comptes : `admin@lequai-immobilier.com / admin123`,
`agent@... / agent123` (et manager si présent).
**Commit :** terminer chaque message par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Contexte réutilisé (lire avant de commencer)

- **`client/src/components/Layout.jsx`** : sidebar (`<aside className="w-60 ...">` repliable `w-16`) + topbar
  (`<div className="bg-white border-b ...">` avec titre de page). `NAV_ITEMS` = 6 entrées
  `{ id, label, icon, roles }` (dashboard, session, contacts, scripts, supervision[manager,admin],
  admin[admin]). `onNavigate(id)`, `page` (id courant), `logout()` du hook `useAuth`. La déconnexion est en bas
  de la sidebar.
- **Pages** : `DashboardPage`, `SessionPage`, `ContactsPage`, `ScriptsPage`, `SupervisionPage`, `AdminPage`.
  Conteneur racine commun : `flex-1 overflow-y-auto p-6 bg-quai-light`. `ContactsPage` et `SupervisionPage`
  contiennent des `<table>`.
- **`client/src/components/ui/Modal.jsx`** : modale partagée. Overlay `fixed inset-0 ... z-50 p-4`, dialogue
  `w-full max-w-... max-h-[90vh] flex flex-col`, corps `flex-1 overflow-y-auto p-5`. Utilisée par `ContactModal`,
  `ImportModal`. `ConfirmDialog.jsx` est une modale distincte (vérifier son markup).
- **`client/src/components/ui/Icon.jsx`** : `<Icon name="kebab-case" size="sm|md|lg" />` (Lucide).
- **`server/src/index.js`** : Express. Middlewares montés en haut (`cors`, `express.json`), puis routes
  `app.use('/api/...')`. `compression` PAS installé.
- Charte : quai-navy/quai-gold, icônes Lucide, AUCUN emoji, tap-targets ≥ 44 px. `<meta viewport>` déjà présent.

**Convention de vérification** : backend (port 3001) + preview ; régler la largeur ; injecter le token dans
`localStorage` ; contrôler `document.documentElement.scrollWidth - clientWidth <= 1` sur chaque page.

---

## Task 1 : Barre d'onglets basse mobile dans `Layout.jsx`

**Files:**
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1 : Masquer la sidebar en mobile**

Dans `client/src/components/Layout.jsx`, sur le `<aside>` (la sidebar), ajouter `hidden md:flex` au début de sa
className. La className actuelle commence par `${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-quai-navy flex flex-col ...`.
La remplacer par : `${collapsed ? 'w-16' : 'w-60'} hidden md:flex flex-shrink-0 bg-quai-navy flex-col transition-all duration-200`
(on retire le `flex` simple — `md:flex` le réactive en desktop ; `flex-col` reste).

- [ ] **Step 2 : Rendre la déconnexion accessible dans la topbar en mobile**

Dans la topbar (`<div className="bg-white border-b border-quai-border px-6 py-3 flex items-center justify-between flex-shrink-0">`),
le bloc de droite contient un texte `Le Quai de l'Immobilier — Gestion des relances`. Remplacer ce bloc de droite par :

```jsx
          <div className="flex items-center gap-3">
            <span className="text-xs text-quai-muted hidden md:inline">Le Quai de l'Immobilier — Gestion des relances</span>
            <button onClick={logout} aria-label="Déconnexion"
              className="md:hidden text-quai-muted hover:text-quai-navy p-1.5">
              <Icon name="log-out" size="md" />
            </button>
          </div>
```

(Le `logout` est déjà disponible via `useAuth` dans ce composant.)

- [ ] **Step 3 : Ajouter la barre d'onglets basse + l'espace bas du contenu**

Juste avant la fermeture `</main>` (à la fin du `<main className="flex-1 ...">`), insérer la barre basse. Et
ajouter un padding bas au conteneur de contenu. Comme le contenu est `{children}` (les pages gèrent leur propre
scroll), on ajoute la barre comme dernier enfant de `<main>` :

```jsx
        {/* Barre d'onglets basse : MOBILE uniquement */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1300] bg-quai-navy border-t border-white/10 flex justify-around items-stretch pb-[env(safe-area-inset-bottom)]">
          {visibleNav.map(item => (
            <button key={item.id} onClick={() => onNavigate(item.id)} aria-label={item.label}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] transition ${page === item.id ? 'text-quai-gold font-semibold' : 'text-white/70'}`}>
              <Icon name={item.icon} size="md" />
              <span className="truncate max-w-full px-0.5">{item.label}</span>
            </button>
          ))}
        </nav>
```

`visibleNav` est déjà calculé dans le composant (filtré par rôle). La barre est `fixed` donc hors flux : pour que
le bas des pages ne soit pas masqué, la Task 2 ajoute `pb-24 md:pb-6` sur le conteneur scrollable de chaque page.

- [ ] **Step 4 : Build**

Run: `npm --prefix client run build`
Expected: build OK.

- [ ] **Step 5 : Vérif live — barre basse en mobile, sidebar en desktop**

Backend (port 3001) + preview à **375 px** : la sidebar n'apparaît pas ; une barre d'onglets est en bas (6 entrées
pour admin) ; la déconnexion est dans la topbar. À **768 px** : sidebar visible, barre basse masquée. Pas de
débordement horizontal.

- [ ] **Step 6 : Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/components/Layout.jsx
git commit -m "$(printf 'feat(mobile): barre onglets basse en mobile, sidebar en desktop\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2 : Pages — padding mobile + espace barre basse + tableaux scrollables

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`
- Modify: `client/src/pages/ScriptsPage.jsx`
- Modify: `client/src/pages/SupervisionPage.jsx`
- Modify: `client/src/pages/AdminPage.jsx`
- Modify: `client/src/pages/ContactsPage.jsx`
- Modify: `client/src/pages/SessionPage.jsx`

- [ ] **Step 1 : Conteneur racine de chaque page — padding mobile + espace bas**

Dans `DashboardPage.jsx`, `ScriptsPage.jsx`, `SupervisionPage.jsx`, `AdminPage.jsx`, repérer le conteneur racine
`flex-1 overflow-y-auto p-6 bg-quai-light` et le remplacer par
`flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light`.

Pour `ContactsPage.jsx` et `SessionPage.jsx` : lire le conteneur racine réel et appliquer la même logique
(padding `p-4 md:p-6` + `pb-24 md:pb-6` sur le conteneur qui scrolle). Adapter selon le markup réel.

- [ ] **Step 2 : Grilles de KPI/cartes en 1 colonne mobile**

Dans chaque page, repérer les grilles de type `grid grid-cols-N` ou `md:grid-cols-N`/`lg:grid-cols-N` SANS base
mobile à 1 colonne, et s'assurer qu'elles commencent par `grid-cols-1` puis `md:grid-cols-N`. Exemple : une grille
`grid grid-cols-4 gap-4` devient `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4`. Appliquer au cas par cas
d'après le markup réel (ne pas casser les grilles déjà responsives).

- [ ] **Step 3 : Tableaux en `overflow-x-auto` (Contacts, Supervision)**

Dans `ContactsPage.jsx` et `SupervisionPage.jsx`, envelopper chaque `<table>` dans un conteneur défilable s'il ne
l'est pas déjà : `<div className="overflow-x-auto"> ... <table> ... </table> ... </div>`. Cela évite le débordement
horizontal de la page sur mobile (le scroll devient interne au tableau).

- [ ] **Step 4 : `SessionPage` — écran d'appel lisible au pouce**

Lire `SessionPage.jsx`. Objectif mobile : le script d'appel et les boutons d'action (statut d'appel, contact
suivant, etc.) doivent être lisibles et atteignables sans dézoomer. Si des éléments sont en disposition
horizontale (`flex` / `grid-cols-N` sans préfixe), les empiler en mobile (`flex-col md:flex-row` /
`grid-cols-1 md:grid-cols-N`). Les boutons d'action principaux : pleine largeur ou en grille 2 colonnes en mobile
pour un bon tap-target. Appliquer le strict nécessaire d'après le code réel.

- [ ] **Step 5 : Build + vérif live (parcours des 6 pages)**

Run: `npm --prefix client run build` (OK attendu).
À 375 px, parcourir Dashboard, Session, Contacts, Scripts (+ Supervision/Admin en admin) : aucun débordement
horizontal de page (`scrollW <= clientW + 1`), contenu lisible, dernier élément non masqué par la barre basse,
tableaux défilables horizontalement à l'intérieur de leur cadre.

- [ ] **Step 6 : Commit**

```bash
git add client/src/pages/DashboardPage.jsx client/src/pages/ScriptsPage.jsx client/src/pages/SupervisionPage.jsx client/src/pages/AdminPage.jsx client/src/pages/ContactsPage.jsx client/src/pages/SessionPage.jsx
git commit -m "$(printf 'feat(mobile): pages responsives (padding, espace barre basse, tableaux scrollables)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3 : Modales en mobile

**Files:**
- Modify: `client/src/components/ui/Modal.jsx`
- Modify: `client/src/components/ui/ConfirmDialog.jsx`

Le `Modal.jsx` partagé a déjà `w-full max-h-[90vh] flex flex-col` + corps scrollable : il suffit de réduire le
padding de l'overlay en mobile pour gagner de la largeur. `ContactModal` et `ImportModal` utilisent ce `Modal`,
donc une seule modif les couvre.

- [ ] **Step 1 : `Modal.jsx` — overlay padding mobile + z au-dessus de la barre basse**

Dans `client/src/components/ui/Modal.jsx`, sur l'overlay
`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-scrim`, remplacer `z-50 p-4` par
`z-[1400] p-2 md:p-4` (z-[1400] pour passer au-dessus de la barre basse `z-[1300]`).

- [ ] **Step 2 : `ConfirmDialog.jsx` — même traitement**

Lire `client/src/components/ui/ConfirmDialog.jsx`. Repérer son overlay `fixed inset-0 ... p-4` (et son éventuel
`z-50`) et appliquer `z-[1400] p-2 md:p-4`. S'assurer que le dialogue a `max-h-[90vh]` (ajouter si absent) pour ne
pas déborder en hauteur sur petit écran. Adapter selon le markup réel.

- [ ] **Step 3 : Build + vérif live**

Run: `npm --prefix client run build` (OK).
À 375 px : ouvrir une modale de contact (Contacts → éditer/créer), l'import (Contacts → importer), et un
ConfirmDialog (ex. suppression) → toutes lisibles pleine largeur, scrollables, boutons d'action atteignables,
affichées au-dessus de la barre basse.

- [ ] **Step 4 : Commit**

```bash
git add client/src/components/ui/Modal.jsx client/src/components/ui/ConfirmDialog.jsx
git commit -m "$(printf 'feat(mobile): modales pleine largeur et au-dessus de la barre basse\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4 : Légèreté — compression gzip serveur

**Files:**
- Modify: `server/src/index.js`
- Modify: `package.json` (dépendance `compression`)

- [ ] **Step 1 : Installer `compression`**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
npm install compression
```
Expected: ajout dans `dependencies`, 0 vulnérabilité.

- [ ] **Step 2 : Monter le middleware avant les routes**

Dans `server/src/index.js`, après `const path = require('path');` ajouter `const compression = require('compression');`.
Puis, juste avant `app.use(cors({...}))`, ajouter :

```js
// Compression gzip des réponses (listes de contacts, etc.) — gain net sur mobile/4G.
app.use(compression());
```

- [ ] **Step 3 : Vérif — réponse API en gzip**

Lancer le backend (port 3001). Se connecter pour obtenir un token, puis :
```bash
curl -s -H "Authorization: Bearer <TOKEN>" --compressed -o /dev/null -w "gzip ok\n" http://localhost:3001/api/contacts
curl -s -H "Authorization: Bearer <TOKEN>" -H "Accept-Encoding: identity" -o /dev/null -w "  sans gzip: %{size_download} o\n" http://localhost:3001/api/contacts
curl -s -H "Authorization: Bearer <TOKEN>" --compressed -o /dev/null -w "  avec gzip: %{size_download} o\n" http://localhost:3001/api/contacts
```
Expected : la taille « avec gzip » est nettement inférieure à « sans gzip » (si la liste de contacts est non
triviale). Au minimum, aucune erreur et l'app fonctionne toujours.

- [ ] **Step 4 : Commit**

```bash
git add server/src/index.js package.json package-lock.json
git commit -m "$(printf 'perf: compression gzip des reponses API\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5 : Recette finale multi-rôles + déploiement

**Files:**
- Modify: `docs/` (mise à jour éventuelle) / aucun fichier de code

- [ ] **Step 1 : Recette à 375 / 390 / 768 px pour les 3 rôles**

Lancer backend + preview. Pour chaque largeur (375, 390, 768) et chaque rôle (agent / manager / admin),
parcourir les pages accessibles et vérifier (screenshot + script de débordement) :
- `scrollW <= clientW + 1` sur chaque page ;
- aucun chevauchement (topbar, barre basse, modales) ;
- boutons-clés cliquables sans dézoomer : navigation barre basse, déconnexion (topbar mobile), actions Session,
  créer/éditer contact, importer ;
- barre basse correcte par rôle : agent 4 entrées (dashboard/session/contacts/scripts), manager +supervision (5),
  admin +administration (6) ;
- à 768 px : sidebar de retour, barre basse masquée, layout desktop intact.

- [ ] **Step 2 : Tests backend éventuels + build final**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
ls server/test/ 2>/dev/null && for t in server/test/*.test.js; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done
npm --prefix client run build
```
Expected : aucun FAIL si des tests existent, build OK. (S'il n'y a pas de dossier `server/test`, ignorer cette
partie.)

- [ ] **Step 3 : Commit (si modifs résiduelles) + merge + push (déclenche le déploiement)**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git checkout main && git merge --no-ff <branche> -m "feat(mobile): ImmoRelances responsive complet (6 pages, 3 roles) + gzip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
(remplacer `<branche>` par la branche de travail). Le push sur `main` déclenche le redéploiement Railway
(`immo-relances-production.up.railway.app`).

- [ ] **Step 4 : Vérifier la prod**

Après redéploiement, ouvrir `https://immo-relances-production.up.railway.app` en viewport mobile (375 px) ;
confirmer la barre d'onglets basse + une page lisible sans dézoomer.

---

## Self-review du plan

- **Couverture spec** : sidebar→barre basse + déconnexion topbar (T1) · pages padding/espace/grilles/tableaux +
  SessionPage (T2) · modales Modal+ConfirmDialog (T3) · compression gzip (T4) · recette 3 rôles + 3 largeurs +
  déploiement (T5). ✅ Toutes les sections de la spec (3.1→3.4, §5 vérif, 3 rôles) ont une tâche.
- **Placeholders** : les tâches 2/4 demandent de « lire le markup réel puis adapter » pour les grilles/SessionPage
  car ces fichiers n'ont pas été lus en entier ; les transformations exactes (classes Tailwind, `pb-24`,
  `overflow-x-auto`, `p-2 md:p-4`) sont fournies. Acceptable pour du responsive. Pas de « TODO » vague.
- **Cohérence z-index** : barre basse `z-[1300]`, modales `z-[1400]` (au-dessus). Cohérent.
- **Cohérence noms** : `visibleNav`, `logout`, `onNavigate`, `page` réutilisés tels qu'ils existent dans
  `Layout.jsx`. Breakpoint `md` partout. ✅
