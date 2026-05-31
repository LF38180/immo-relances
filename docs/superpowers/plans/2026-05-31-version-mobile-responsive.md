# Version mobile responsive — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre ImmoProspect pleinement utilisable sur smartphone (~360–430 px) sans dézoomer : barre d'onglets en bas, panneaux de carte en bottom sheet, listes en 1 colonne, pour les 3 rôles (agent, manager, admin).

**Architecture:** Tout en Tailwind responsive avec le breakpoint `md` (768 px) : mobile par défaut, desktop dès `md:` (l'existant desktop reste inchangé). `AppHeader` devient une barre haute (desktop) + une barre d'onglets basse fixe (mobile). Les panneaux flottants des cartes deviennent des bottom sheets en mobile via des classes conditionnelles. Les grilles/tableaux passent en 1–2 colonnes mobile.

**Tech Stack:** React + Vite + Tailwind. Pas de nouvelle dépendance. Vérification visuelle en live (preview navigateur) à 375 / 390 / 768 px — il n'y a pas de tests unitaires CSS, les « tests » sont des contrôles scriptés dans le navigateur.

**Répertoire :** `/Users/loickferrucci/Desktop/immo-prospect/`
**Commit :** terminer chaque message par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Contexte réutilisé (lire avant de commencer)

- **`client/src/components/AppHeader.jsx`** : header unifié. Props `{ active, onNav, onAdmin, titre, children }`.
  `TABS` = 5 entrées `{ id, label, icon, page, managerOnly? }`. `onNav(page)` change de page. Filtrage
  `managerOnly` via `isManager`. Utilisé par TOUTES les pages.
- **`client/src/components/ui/Icon.jsx`** : `<Icon name="kebab-case" size="sm|md|lg|xl" />` (Lucide).
- **Pages** : `PotentielPage`, `CartePage` (Ciblage), `SecteursPage` + `TerrainPage` (Terrain), `ApporteursPage`,
  `PilotagePage`, `AdminPage`. Toutes rendent `<AppHeader .../>` en haut.
- **Overlays carte (position fixe `absolute`)** : `PotentielPanel` (`top-4 right-4 z-[1100] w-80`),
  `ZonePanel` (`absolute top-4 left-4 z-[1000] w-72`), `BandeauSources` (`bottom-4 left-4 z-[1000]`),
  `ScoreLegend` (`bottom-4 right-4 z-[1000]`), `TopQuartiers` (`top-4 right-4 z-[1000] w-64`),
  `CommuneSearch` (`top-4 left-1/2 -translate-x-1/2 z-[1000] w-64`).
- **Charte** : quai-navy/quai-gold, Playfair (titres), icônes Lucide, AUCUN emoji, tap-targets ≥ 44 px.
- Le `<meta viewport>` est déjà présent dans `client/index.html`.

**Convention de vérification (utilisée dans chaque tâche)** : on lance le backend + le preview, on règle la
largeur, et on contrôle via un script JS dans la page :
```js
// largeur mobile sans débordement horizontal
() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })
// => scrollW doit être <= clientW (+1px de tolérance). Sinon : débordement = échec.
```

---

## Task 1 : Barre d'onglets basse mobile dans `AppHeader`

**Files:**
- Modify: `client/src/components/AppHeader.jsx`

- [ ] **Step 1 : Réécrire `AppHeader` avec header haut (desktop) + barre basse (mobile)**

Remplacer tout le `return (...)` du composant par ceci (garde les imports, `TABS`, la logique `isManager`/`tabs`) :

```jsx
  return (
    <>
      {/* Barre haute : compacte en mobile, complète en desktop */}
      <header className="bg-quai-navy text-white px-3 md:px-4 py-2.5 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="Le Quai" className="h-7 w-auto flex-shrink-0" />
          {titre && <span className="font-display text-sm whitespace-nowrap hidden md:inline">{titre}</span>}
          {/* Onglets en haut : DESKTOP uniquement */}
          <nav className="hidden md:flex bg-white/10 rounded-lg p-0.5 text-xs">
            {tabs.map(t => (
              <button key={t.id} onClick={() => onNav(t.page)}
                className={`px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5 ${active === t.id ? 'bg-quai-gold text-quai-navy font-semibold' : 'text-white/80 hover:text-white'}`}>
                <Icon name={t.icon} size="sm" /> <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}
          {onAdmin && isManager && (
            <button onClick={onAdmin} className="text-white/70 hover:text-white p-1.5" aria-label="Administration"><Icon name="settings" size="md" /></button>
          )}
          <button onClick={logout} className="text-white/70 hover:text-white p-1.5" aria-label="Deconnexion"><Icon name="log-out" size="md" /></button>
        </div>
      </header>

      {/* Barre d'onglets basse : MOBILE uniquement */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1300] bg-quai-navy border-t border-white/10 flex justify-around items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabs.map(t => (
          <button key={t.id} onClick={() => onNav(t.page)} aria-label={t.label}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] transition ${active === t.id ? 'text-quai-gold font-semibold' : 'text-white/70'}`}>
            <Icon name={t.icon} size="md" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
```

Note : la barre basse est `fixed` et en `z-[1300]` (au-dessus des overlays carte qui sont en `z-[1000]`/`z-[1100]`).
Le `pb-[env(safe-area-inset-bottom)]` gère l'encoche des iPhone récents.

- [ ] **Step 2 : Ajouter un espace bas sur les pages pour ne pas masquer le contenu sous la barre**

La barre basse `fixed` recouvre ~56 px. Les pages à scroll vertical doivent réserver cet espace EN MOBILE.
On le fera page par page dans les tâches suivantes (classe `pb-20 md:pb-0` sur le conteneur scrollable).
Pour les pages pleine hauteur avec carte (Potentiel, Ciblage), la carte passera sous la barre mais les
overlays seront remontés (tâches 3–4).

- [ ] **Step 3 : Build**

Run: `npm --prefix client run build`
Expected: build OK, aucune erreur.

- [ ] **Step 4 : Vérif live — la barre basse apparaît en mobile, pas en desktop**

Lancer backend + preview (voir convention). À **375 px** : la barre d'onglets est en bas avec les 5 (ou 4 pour
agent) icônes ; les onglets du haut sont masqués. À **768 px** : onglets en haut, barre basse masquée.
Contrôle script : à 375 px, `document.querySelector('nav.fixed.bottom-0')` existe et est visible ;
à 768 px il est `display:none`.

- [ ] **Step 5 : Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add client/src/components/AppHeader.jsx
git commit -m "$(printf 'feat(mobile): barre onglets basse en mobile, onglets haut en desktop\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2 : Overlays des cartes — remonter au-dessus de la barre basse + recherche/légende compactes

**Files:**
- Modify: `client/src/components/BandeauSources.jsx`
- Modify: `client/src/components/ScoreLegend.jsx`
- Modify: `client/src/components/CommuneSearch.jsx`

Les overlays `bottom-4` seraient cachés par la barre basse (56 px). On les remonte en mobile, et on réduit la
largeur de la recherche pour les petits écrans.

- [ ] **Step 1 : `BandeauSources` — remonter en mobile**

Dans `client/src/components/BandeauSources.jsx`, remplacer `absolute bottom-4 left-4 z-[1000]` par :
`absolute bottom-20 left-3 md:bottom-4 md:left-4 z-[1000] max-w-[calc(100vw-1.5rem)]`

- [ ] **Step 2 : `ScoreLegend` — remonter en mobile**

Dans `client/src/components/ScoreLegend.jsx`, remplacer `card absolute bottom-4 right-4 z-[1000] text-xs` par :
`card absolute bottom-20 right-3 md:bottom-4 md:right-4 z-[1000] text-xs`

- [ ] **Step 3 : `CommuneSearch` — largeur adaptative**

Dans `client/src/components/CommuneSearch.jsx`, remplacer `absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-64` par :
`absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-[min(20rem,calc(100vw-1.5rem))]`

- [ ] **Step 4 : Build + vérif**

Run: `npm --prefix client run build` (OK attendu).
Vérif live à 375 px sur Potentiel : la légende et le bandeau sources ne sont PAS masqués par la barre basse ;
la recherche commune ne déborde pas de l'écran. Pas de scroll horizontal.

- [ ] **Step 5 : Commit**

```bash
git add client/src/components/BandeauSources.jsx client/src/components/ScoreLegend.jsx client/src/components/CommuneSearch.jsx
git commit -m "$(printf 'feat(mobile): overlays carte remontes au-dessus de la barre basse\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3 : `PotentielPanel` en bottom sheet sur mobile

**Files:**
- Modify: `client/src/components/PotentielPanel.jsx`

- [ ] **Step 1 : Rendre le conteneur responsive (panneau desktop / bottom sheet mobile)**

Dans `client/src/components/PotentielPanel.jsx`, remplacer la classe du `<div>` racine
(`absolute top-4 right-4 z-[1100] w-80 bg-white rounded-xl shadow-lg border border-quai-navy/10 text-quai-navy overflow-hidden`)
par :

```
fixed inset-x-0 bottom-0 z-[1200] w-full max-h-[70vh] overflow-y-auto rounded-t-2xl
  md:absolute md:inset-x-auto md:bottom-auto md:top-4 md:right-4 md:w-80 md:max-h-none md:rounded-xl
  bg-white shadow-lg border border-quai-navy/10 text-quai-navy
```

Explication : en mobile, ancré en bas pleine largeur (`fixed inset-x-0 bottom-0`), coins arrondis en haut,
hauteur max 70vh avec scroll interne, `z-[1200]` (au-dessus de la barre basse `z-[1300]` ? NON — voir Step 2).

- [ ] **Step 2 : Le bottom sheet doit passer AU-DESSUS de la barre d'onglets basse**

La barre basse est `z-[1300]`. Pour que le panneau de détail soit lisible (et son bouton de fermeture
atteignable), il doit être au-dessus : mettre le bottom sheet en `z-[1400]` en mobile. Corriger le `z` :
remplacer `z-[1200]` par `z-[1400]` dans la classe du Step 1, et garder `md:` sans z (le desktop garde `z-[1100]`
d'origine — ajouter `md:z-[1100]`). Classe finale du z : `z-[1400] md:z-[1100]`.

Ajouter aussi un padding bas `pb-4` pour que le dernier élément ne colle pas au bord.

- [ ] **Step 3 : Build + vérif live**

Run: `npm --prefix client run build` (OK).
À 375 px sur Potentiel : taper une commune → le détail monte du bas, pleine largeur, lisible, le bouton fermer (X)
est atteignable, la carte reste visible au-dessus. À 768 px : le panneau redevient flottant en haut à droite.

- [ ] **Step 4 : Commit**

```bash
git add client/src/components/PotentielPanel.jsx
git commit -m "$(printf 'feat(mobile): PotentielPanel en bottom sheet sur mobile\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4 : `ZonePanel` (Ciblage) en bottom sheet + `TopQuartiers` repliable mobile

**Files:**
- Modify: `client/src/components/ZonePanel.jsx`
- Modify: `client/src/components/TopQuartiers.jsx`

- [ ] **Step 1 : `ZonePanel` en bottom sheet mobile**

Dans `client/src/components/ZonePanel.jsx`, remplacer la classe racine `card absolute top-4 left-4 z-[1000] w-72`
par :

```
card fixed inset-x-0 bottom-0 z-[1400] w-full max-h-[70vh] overflow-y-auto rounded-t-2xl rounded-b-none
  md:absolute md:inset-x-auto md:bottom-auto md:top-4 md:left-4 md:w-72 md:max-h-none md:rounded-xl md:z-[1000]
```

- [ ] **Step 2 : `TopQuartiers` — masqué par défaut en mobile (évite de couvrir la carte)**

Le panneau Top 15 (`absolute top-4 right-4 z-[1000] w-64`) couvrirait la carte en mobile. On le masque sous `md`
(il reste accessible en desktop ; en mobile l'agent utilise la recherche + le tap direct). Dans
`client/src/components/TopQuartiers.jsx`, remplacer `absolute top-4 right-4 z-[1000] w-64` par :
`hidden md:block absolute top-4 right-4 z-[1000] w-64`

- [ ] **Step 3 : Build + vérif live**

Run: `npm --prefix client run build` (OK).
À 375 px sur Ciblage : taper un quartier → détail en bottom sheet, bouton « Choisir ce secteur » cliquable ;
le panneau Top 15 n'apparaît pas (carte dégagée) ; le toggle Vente/Gestion (passé via children) reste accessible
sans chevaucher (voir Task 5). À 768 px : ZonePanel flottant + Top 15 visible comme avant.

- [ ] **Step 4 : Commit**

```bash
git add client/src/components/ZonePanel.jsx client/src/components/TopQuartiers.jsx
git commit -m "$(printf 'feat(mobile): ZonePanel en bottom sheet, Top quartiers masque en mobile\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5 : Toggle Vente/Gestion (Ciblage) accessible en mobile

**Files:**
- Modify: `client/src/pages/CartePage.jsx`

Le toggle Vente/Gestion est passé en `children` de `AppHeader` (donc dans la barre haute). En mobile, la barre
haute est étroite ; le toggle doit rester visible et ne pas pousser les actions hors écran.

- [ ] **Step 1 : Vérifier le rendu du toggle dans la barre haute mobile**

Lancer le preview à 375 px sur Ciblage. Observer le bloc `children` (Vente/Gestion) dans l'en-tête. Si le toggle
tient à côté des icônes réglages/déconnexion sans débordement → ne rien changer, passer au Step 3.

- [ ] **Step 2 : Si débordement, compacter le toggle en mobile**

Dans `client/src/pages/CartePage.jsx`, le bloc passé en children de `<AppHeader>` contient deux boutons
"Vente"/"Gestion". Réduire leur padding en mobile : sur le conteneur du toggle, remplacer la classe existante
`bg-white/10 rounded-lg p-0.5 flex text-xs` par `bg-white/10 rounded-lg p-0.5 flex text-[11px] md:text-xs`,
et sur chaque bouton remplacer `px-3 py-1.5` par `px-2 md:px-3 py-1.5`. (Garde le reste identique.)

- [ ] **Step 3 : Build + vérif**

Run: `npm --prefix client run build` (OK).
À 375 px : le header de Ciblage tient sans débordement (`scrollW <= clientW`), le toggle Vente/Gestion et les
icônes réglages/déconnexion sont tous visibles et cliquables.

- [ ] **Step 4 : Commit**

```bash
git add client/src/pages/CartePage.jsx
git commit -m "$(printf 'feat(mobile): toggle Vente/Gestion compact en mobile\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6 : Terrain — liste secteurs + vue secteur en mobile

**Files:**
- Modify: `client/src/pages/SecteursPage.jsx`
- Modify: `client/src/pages/TerrainPage.jsx`

- [ ] **Step 1 : `SecteursPage` — réserver l'espace de la barre basse**

Dans `client/src/pages/SecteursPage.jsx`, sur le conteneur principal qui scrolle (le `<div className="max-w-4xl mx-auto p-6">`),
remplacer `max-w-4xl mx-auto p-6` par `max-w-4xl mx-auto p-4 md:p-6 pb-24 md:pb-6`. La grille des secteurs
(`grid grid-cols-1 md:grid-cols-2 gap-4`) est déjà responsive — ne pas y toucher.

- [ ] **Step 2 : `TerrainPage` — vérifier carte + liste empilées et modale de saisie en mobile**

Lire `client/src/pages/TerrainPage.jsx`. Repérer le conteneur carte + la liste d'adresses + la modale de saisie
de passage (`PassageForm`). Objectifs mobile :
  (a) la carte et la liste s'empilent verticalement (1 colonne) sous `md` ;
  (b) la liste réserve `pb-24 md:pb-6` pour ne pas finir sous la barre basse ;
  (c) la modale `PassageForm` est lisible (voir Task 8).
Si la mise en page utilise une grille/flex horizontale type `flex` ou `grid-cols-2` sans préfixe responsive,
la préfixer pour qu'elle soit `flex-col md:flex-row` (ou `grid-cols-1 md:grid-cols-2`). Appliquer le strict
nécessaire d'après le code réel lu.

- [ ] **Step 3 : Build + vérif live (3 rôles)**

Run: `npm --prefix client run build` (OK).
À 375 px : Terrain liste en 1 colonne, bouton « Créer un secteur » visible et cliquable (vérifier pour un compte
**agent** ET un compte **manager** — les deux peuvent créer). Ouvrir un secteur → carte + liste empilées,
défilables, rien sous la barre basse. Pas de scroll horizontal.

- [ ] **Step 4 : Commit**

```bash
git add client/src/pages/SecteursPage.jsx client/src/pages/TerrainPage.jsx
git commit -m "$(printf 'feat(mobile): Terrain liste et vue secteur responsives\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7 : Apporteurs + Pilotage en mobile

**Files:**
- Modify: `client/src/pages/ApporteursPage.jsx`
- Modify: `client/src/pages/PilotagePage.jsx`

- [ ] **Step 1 : `ApporteursPage` — pipeline en scroll horizontal + espace bas**

Lire `client/src/pages/ApporteursPage.jsx`. Le pipeline a 5 colonnes (Signalé/Contacté/Mandat/Vente/Perdu).
En mobile : permettre le **défilement horizontal** du pipeline plutôt que de l'écraser. Sur le conteneur du
pipeline (la rangée des 5 colonnes), s'assurer qu'il a `flex gap-... overflow-x-auto` avec des colonnes à largeur
minimale (`min-w-[14rem]` par colonne) en mobile, et le layout actuel en desktop. Adapter selon le code réel.
Sur le conteneur de page scrollable, ajouter `pb-24 md:pb-6`. Les sous-onglets (Affaires/Apporteurs/Tableau de
bord) doivent rester accessibles (les rendre `overflow-x-auto` si nécessaire).

- [ ] **Step 2 : `PilotagePage` — KPI en 2 colonnes mobile + tableaux scrollables**

Lire `client/src/pages/PilotagePage.jsx`. Les 5 cartes KPI sont sur une ligne. En mobile : passer en
**grille 2 colonnes** (`grid grid-cols-2 md:grid-cols-5 gap-3`). Pour chaque `<table>` (activité par agent),
l'envelopper d'un `<div className="overflow-x-auto">` si ce n'est pas déjà le cas, pour éviter le débordement.
Vérifier que les graphiques recharts utilisent `ResponsiveContainer` (width="100%") ; si un graphe a une largeur
fixe, le passer en responsive. Conteneur de page scrollable : `pb-24 md:pb-6`.

- [ ] **Step 3 : Build + vérif live (manager/admin)**

Run: `npm --prefix client run build` (OK).
À 375 px : Apporteurs — pipeline défilable horizontalement sans casser la page, modales OK (Task 8) ;
Pilotage (connecté en **manager**) — 5 KPI en 2 colonnes, tableaux qui ne débordent pas, graphes à la bonne
largeur. Pas de scroll horizontal de page (le scroll-x est interne au pipeline / aux tableaux uniquement).

- [ ] **Step 4 : Commit**

```bash
git add client/src/pages/ApporteursPage.jsx client/src/pages/PilotagePage.jsx
git commit -m "$(printf 'feat(mobile): Apporteurs pipeline scrollable, Pilotage KPI 2 colonnes\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8 : Modales + page Admin en mobile

**Files:**
- Modify: `client/src/components/PassageForm.jsx`
- Modify: `client/src/components/AffaireModal.jsx`
- Modify: `client/src/components/ApporteurModal.jsx`
- Modify: `client/src/pages/AdminPage.jsx`
- Modify: `client/src/pages/SecteursPage.jsx` (modale CreerSecteurModal interne)

- [ ] **Step 1 : Rendre les modales pleine largeur et hauteur maîtrisée en mobile**

Pour chaque modale ci-dessus, repérer le conteneur du dialogue (souvent
`bg-white rounded-2xl ... w-full max-w-lg max-h-[90vh] flex flex-col` dans un overlay `fixed inset-0`). Objectif
mobile : pleine largeur avec marge minimale, hauteur ≤ 90vh, scroll interne, boutons d'action toujours visibles.
Si la classe du dialogue contient `max-w-lg` ou `max-w-xl` sans préfixe, la laisser (le `w-full` + le padding de
l'overlay suffisent) MAIS vérifier que l'overlay parent a un padding mobile faible : remplacer un éventuel `p-4`
de l'overlay par `p-2 md:p-4`, et s'assurer que le dialogue a bien `max-h-[90vh] overflow-y-auto` (ou un body
interne scrollable). Conserver `z-[1100]` (ou plus) pour rester au-dessus des cartes.

Appliquer ce principe à : `PassageForm.jsx`, `AffaireModal.jsx`, `ApporteurModal.jsx`, et la modale
`CreerSecteurModal` (fonction en bas de `SecteursPage.jsx`). N'appliquer que les ajustements réellement
nécessaires d'après le code lu (ne pas casser le desktop).

- [ ] **Step 2 : `AdminPage` responsive + espace bas**

Lire `client/src/pages/AdminPage.jsx`. Mettre les grilles/formulaires en 1 colonne mobile (`grid-cols-1 md:grid-cols-...`),
champs pleine largeur, conteneur scrollable avec `pb-24 md:pb-6`, et envelopper tout `<table>` dans
`overflow-x-auto`. Adapter selon le code réel.

- [ ] **Step 3 : Build + vérif live (admin)**

Run: `npm --prefix client run build` (OK).
À 375 px, connecté en **admin** : ouvrir la modale de création de secteur (Terrain), la modale de saisie de
passage (depuis un secteur), les modales Apporteurs → toutes lisibles, scrollables, boutons Annuler/Valider
atteignables sans dézoomer. Page Admin : pas de débordement, tableaux scrollables.

- [ ] **Step 4 : Commit**

```bash
git add client/src/components/PassageForm.jsx client/src/components/AffaireModal.jsx client/src/components/ApporteurModal.jsx client/src/pages/AdminPage.jsx client/src/pages/SecteursPage.jsx
git commit -m "$(printf 'feat(mobile): modales et page Admin responsives\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9 : Recette finale multi-rôles + déploiement

**Files:**
- Modify: `REPRISE.md`
- Modify: `server/data/prospect.db.gz` (seulement si des données de test ont été créées pendant la recette)

- [ ] **Step 1 : Recette complète à 375 / 390 / 768 px pour les 3 rôles**

Lancer backend + preview. Pour chaque largeur (375, 390, 768) et chaque rôle (agent / manager / admin), parcourir
les 5 pages (+ Admin pour admin/manager) et vérifier, via screenshot ET le script de débordement :
- `scrollW <= clientW + 1` (aucun débordement horizontal) sur chaque page ;
- aucun chevauchement visible (en-tête, barre basse, panneaux, légende) ;
- tous les boutons-clés cliquables sans dézoomer : changement d'onglet (barre basse), Vente/Gestion, recherche
  commune, « Choisir ce secteur », « Créer un secteur » (agent + manager), saisie de passage, réglages (admin) ;
- cartes : bottom sheet s'ouvre au-dessus de la carte et de la barre basse, carte visible ;
- à 768 px : retour au layout desktop (onglets en haut, panneaux flottants) intact.

Comptes : `admin@lequai-immobilier.com / admin123`, `manager@lequai-immobilier.com / manager123`,
`agent@lequai-immobilier.com / agent123`.

- [ ] **Step 2 : Nettoyer d'éventuelles données de test + recompresser la DB si modifiée**

Si la recette a créé des secteurs/passages de test :
```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const {db}=require('./server/src/database'); db.prepare('DELETE FROM secteurs').run(); db.prepare('DELETE FROM passages').run(); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"
gzip -9 -c server/data/prospect.db > server/data/prospect.db.gz
```
Sinon, sauter cette étape.

- [ ] **Step 3 : Lancer la suite de tests backend (non-régression) + build final**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
for t in server/test/*.test.js; do JWT_SECRET=dev node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done
npm --prefix client run build
```
Expected: aucun FAIL, build OK.

- [ ] **Step 4 : Mettre à jour REPRISE.md**

Dans `/Users/loickferrucci/Desktop/immo-prospect/REPRISE.md`, ajouter une ligne indiquant que la version mobile
responsive est livrée (barre d'onglets basse, bottom sheets cartes, listes 1 colonne, vérifié 375/390/768 px pour
les 3 rôles).

- [ ] **Step 5 : Commit + merge + push (déclenche Railway)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add REPRISE.md server/data/prospect.db.gz 2>/dev/null; git add REPRISE.md
git commit -m "$(printf 'docs: version mobile responsive livree (maj REPRISE)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git checkout main && git merge --no-ff <branche> -m "feat(mobile): version responsive complete (5 pages, 3 roles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
(remplacer `<branche>` par la branche de travail).

- [ ] **Step 6 : Vérifier la prod**

Ouvrir https://immo-prospect-production.up.railway.app sur un viewport mobile (375 px) après redéploiement ;
confirmer la barre basse + une carte avec bottom sheet.

---

## Self-review du plan

- **Couverture spec** : navigation barre basse (T1) · overlays remontés (T2) · bottom sheet Potentiel (T3) ·
  bottom sheet Ciblage + Top15 masqué (T4) · toggle Vente/Gestion (T5) · Terrain liste+vue+create (T6) ·
  Apporteurs pipeline + Pilotage KPI/tableaux/graphes (T7) · modales + Admin (T8) · recette 3 rôles + 3 largeurs +
  déploiement (T9). ✅ Toutes les sections de la spec (3.1→3.5, §5 vérif, 3 rôles) ont une tâche.
- **Cohérence z-index** : barre basse `z-[1300]`, bottom sheets cartes `z-[1400] md:z-[…]`, overlays `z-[1000]`,
  modales `z-[1100]+`. Le bottom sheet (1400) passe au-dessus de la barre basse (1300) — voulu (bouton fermer
  atteignable). Les modales (1100) s'ouvrent depuis des pages sans barre basse fixe au-dessus d'elles en plein
  écran — OK. Cohérent.
- **Placeholders** : les tâches 6/7/8 demandent de « lire le code réel puis adapter » car ces fichiers n'ont pas
  été lus intégralement ; les transformations exactes (1 colonne, scroll-x, pb-24, ResponsiveContainer) sont
  spécifiées. Acceptable pour du responsif où le détail dépend du markup existant — l'implémenteur lit puis
  applique le motif donné. Pas de "TODO" vague.
- **Breakpoint** : `md` (768 px) utilisé partout, cohérent avec la spec.
