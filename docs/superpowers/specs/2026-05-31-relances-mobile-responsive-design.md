# ImmoRelances — Version mobile responsive + légère — Spec de conception

> Projet : **ImmoRelances** (`/Users/loickferrucci/Desktop/immo-relances/`)
> Date : 2026-05-31 · Statut : conception validée, prêt pour plan d'implémentation

## 1. Objectif

Rendre ImmoRelances pleinement utilisable sur smartphone (tous écrans, ~360–430 px), sans dézoomer, pour les
**trois rôles** (agent, manager, admin), et appliquer une optimisation de légèreté sans risque (compression gzip).

Constat actuel : l'app utilise une **sidebar latérale fixe** (`w-60`, repliable `w-16`). Sur mobile, cette sidebar
occupe les 2/3 de l'écran et écrase le contenu (illisible), même si techniquement il n'y a pas de débordement
horizontal. Le `<meta viewport>` est présent (`viewport-fit=cover`). Responsive partiel via quelques breakpoints.

## 2. Décisions de cadrage (brainstorming)

| Sujet | Décision |
|---|---|
| Navigation mobile | Sidebar masquée → **barre d'onglets fixe en bas** (cohérent avec ImmoProspect) |
| Périmètre | **Les 6 pages** + modales + compression gzip serveur |
| Légèreté | Compression gzip (gain net, zéro risque) ; pas de refonte lourde |
| Breakpoint | `md` (768 px) : mobile par défaut, desktop dès `md:` (sidebar desktop inchangée) |

## 3. Composants à adapter

### 3.1 `client/src/components/Layout.jsx` — le cœur du chantier

Navigation actuelle = sidebar (`<aside>`) + topbar (`<div>` titre). `NAV_ITEMS` = 6 entrées
`{ id, label, icon, roles }`, filtrées par `roles.includes(user.role)`. `onNavigate(id)` change de page.

- **Mobile (<768 px)** :
  - La sidebar `<aside>` est **masquée** (`hidden md:flex`).
  - Une **barre d'onglets fixe en bas** (`md:hidden fixed bottom-0 inset-x-0 z-[1300] bg-quai-navy`) affiche les
    entrées visibles selon le rôle (agent 4 : dashboard/session/contacts/scripts ; manager +supervision ;
    admin +administration). Icône + label court, tap-target ≥ 56 px, actif en quai-gold,
    `pb-[env(safe-area-inset-bottom)]` pour l'encoche.
  - Le **contenu** (`<main>`) prend toute la largeur ; la topbar du haut reste (titre de page). La **déconnexion**,
    qui était en bas de la sidebar, doit rester accessible en mobile (l'ajouter dans la topbar en mobile, ou
    comme dernière entrée de la barre basse — choix : icône déconnexion dans la topbar mobile à droite).
  - Le conteneur de contenu scrollable réserve l'espace de la barre basse (`pb-20`/`pb-24` en mobile).
- **Desktop (≥768 px)** : sidebar + topbar inchangées ; barre basse masquée (`md:hidden`).

### 3.2 Les 6 pages (`DashboardPage`, `SessionPage`, `ContactsPage`, `ScriptsPage`, `SupervisionPage`, `AdminPage`)

Pour chaque page (lire le markup réel avant d'adapter) :
- **Grilles** de KPI / cartes → 1 colonne mobile, multi-colonnes dès `md:` (`grid-cols-1 md:grid-cols-N`).
- **Tableaux** (contacts, supervision, listes) → envelopper dans `<div className="overflow-x-auto">` pour éviter
  le débordement horizontal ; ou affichage en cartes empilées si plus lisible (au cas par cas).
- **Conteneur scrollable** de page → `pb-24 md:pb-6` (espace barre basse).
- **`SessionPage`** (écran d'appel, page la plus utilisée) : script + actions d'appel lisibles, boutons (statut
  d'appel, navigation contact suivant) atteignables au pouce, pas de chevauchement.
- Padding de page réduit en mobile (`p-4 md:p-6`) pour gagner de l'espace.

### 3.3 Modales (`ui/Modal.jsx`, `ContactModal.jsx`, `ImportModal.jsx`, `ui/ConfirmDialog.jsx`)

- Pleine largeur mobile (overlay `p-2 md:p-4`), dialogue `w-full max-h-[90vh]` + corps `overflow-y-auto`,
  boutons d'action toujours visibles sans dézoomer. Conserver le z-index au-dessus de la barre basse si la modale
  peut s'ouvrir par-dessus (z ≥ 1400 en mobile, ou la barre basse en dessous).

### 3.4 Légèreté — compression gzip serveur

- Ajouter le middleware `compression` dans `server/src/index.js` (installer `compression` si absent), monté avant
  les routes, comme sur ImmoProspect. Gain net sur les réponses JSON (listes de contacts, etc.), zéro changement
  fonctionnel/visuel.

## 4. Contraintes de charte (inchangées)

- Couleurs quai-navy / quai-gold, icônes Lucide via `Icon`, **aucun emoji**, tap-targets ≥ 44 px.

## 5. Vérification

Test **en live navigateur** à **375 / 390 / 768 px**, pour **chacun des 3 rôles** (agent, manager, admin), sur
chaque page :
- pas de débordement horizontal (`scrollW <= clientW + 1`) ;
- aucun chevauchement (topbar, barre basse, panneaux, modales) ;
- tous les boutons-clés atteignables sans dézoomer (navigation barre basse, déconnexion, actions Session,
  création/édition contact, import) ;
- barre basse correcte selon le rôle (agent 4 / manager 5 / admin 6 entrées) ;
- à 768 px : retour au layout desktop (sidebar) intact ;
- compression : vérifier qu'une réponse API arrive bien en `Content-Encoding: gzip`.

## 6. Hors périmètre

- Pas d'application native (web-app responsive).
- Pas de refonte fonctionnelle : on adapte l'affichage.
- Pas d'optimisation lourde du bundle au-delà de la compression gzip (chantier séparé si besoin).
