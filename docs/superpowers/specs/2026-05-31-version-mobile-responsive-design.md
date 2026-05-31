# Version mobile responsive — Spec de conception

> Projet : **ImmoProspect** (`/Users/loickferrucci/Desktop/immo-prospect/`)
> Date : 2026-05-31 · Statut : conception validée, prêt pour plan d'implémentation

## 1. Objectif

Rendre ImmoProspect **pleinement utilisable sur smartphone** (tous écrans, ~360 à 430 px de large),
sans avoir à dézoomer pour lire ou pour atteindre un bouton. Une vraie version responsive, pour les
**trois rôles** : agent, manager, admin.

Constat actuel : l'app a été pensée desktop. Sous ~768 px, l'en-tête se casse (les 5 onglets + le toggle
Vente/Gestion se chevauchent). Le `<meta viewport>` est présent et quelques breakpoints Tailwind existent,
mais le travail est partiel.

## 2. Décisions de cadrage (brainstorming)

| Sujet | Décision |
|---|---|
| Navigation mobile | **Barre d'onglets fixe en bas** (5 icônes + labels courts) ; barre du haut sur desktop |
| Panneaux de carte (détail au clic) | **Bottom sheet** (feuille montant du bas) sur mobile ; panneau flottant sur desktop |
| Périmètre | **Les 5 pages d'un coup** + tous les éléments des 3 rôles |
| Technique | **Tailwind responsive** (mobile par défaut, desktop dès `md:` = 768 px). Pas de lib lourde ajoutée |
| Breakpoint de bascule | `md` (768 px) : en dessous = mobile, au-dessus = desktop actuel inchangé |

## 3. Composants à adapter

### 3.1 Navigation — `AppHeader.jsx` + nouvelle barre basse

- **Mobile (<768 px)** : en-tête réduit (logo compact + titre court + actions réglages/déconnexion à droite).
  Les 5 onglets descendent dans une **barre fixe en bas** (`fixed bottom-0`), icône + petit label, le tap-target
  large (min 44 px de haut). L'onglet actif est surligné quai-gold.
- **Desktop (≥768 px)** : onglets dans la barre du haut, **exactement comme aujourd'hui**. La barre basse est
  masquée (`md:hidden`).
- Le toggle **Vente/Gestion** (Ciblage) et la **recherche commune** : repositionnés en mobile pour ne plus
  chevaucher (le toggle peut passer en flottant sur la carte ; la recherche reste centrée en haut de la carte).
- **Tous rôles** : la barre basse affiche Pilotage uniquement pour manager/admin (déjà géré par `managerOnly`).
  Le bouton réglages (⚙️, admin) doit rester accessible en mobile (dans l'en-tête réduit).

### 3.2 Cartes — Potentiel (`PotentielPage` + `CartePotentiel` + `PotentielPanel`) et Ciblage (`CartePage` + `CarteIris` + `ZonePanel`)

- La carte occupe tout l'espace entre le mini-header (haut) et la barre d'onglets (bas).
- **`PotentielPanel` et `ZonePanel`** : en mobile, rendus en **bottom sheet** (pleine largeur, ancré en bas,
  au-dessus de la carte, fermable ; `z` au-dessus de Leaflet). En desktop : panneau flottant inchangé.
- **Légende (`ScoreLegend`)** et **bandeau sources (`BandeauSources`)** : compactés en mobile (repliés par défaut
  ou réduits) pour ne pas masquer la carte. Ils ne doivent pas se chevaucher avec le bottom sheet ni la barre basse.
- **Top 15 quartiers** (Ciblage) et **recherche commune** : en mobile, repliables / en bottom sheet, pas un
  panneau fixe qui masque la carte.
- Le bouton **« Choisir ce secteur »** (dans le détail) doit être pleinement cliquable en mobile (dans le bottom sheet).

### 3.3 Pages à listes — Terrain (`SecteursPage` + vue secteur), Apporteurs (`ApporteursPage`), Pilotage (`PilotagePage`)

- **Grilles** : 1 colonne sur mobile (`grid-cols-1`), multi-colonnes dès `md:`. Plusieurs grilles l'ont déjà,
  à généraliser.
- **Terrain** : la liste des secteurs en 1 colonne ; les cartes secteur (badge « Mon secteur », « Attribué à X »
  + cadenas) lisibles en mobile. Le bouton **« Créer un secteur »** (tous rôles désormais) accessible et non tronqué.
  La **vue d'un secteur** (carte des adresses + liste + saisie de passage) : carte + liste empilées, modale de
  saisie en pleine hauteur mobile.
- **Apporteurs** : le **pipeline 5 colonnes** passe en défilement horizontal (scroll-x) ou empilement sur mobile.
  Les sous-onglets (Affaires / Apporteurs / Tableau de bord) restent accessibles. Modales (signaler affaire,
  ajouter apporteur) en pleine hauteur mobile.
- **Pilotage (manager/admin)** : les **5 cartes KPI** passent en grille 2 colonnes sur mobile (au lieu de 5 sur une
  ligne). Le sélecteur de période accessible. Les **tableaux** (activité par agent) ne débordent pas
  (scroll-x si besoin). Les graphiques recharts : largeur responsive (`ResponsiveContainer` si pas déjà le cas).

### 3.4 Page Admin (`AdminPage`, rôle admin/manager)

- Accessible en mobile via le bouton réglages de l'en-tête.
- Formulaires, listes d'utilisateurs et de pondérations : 1 colonne, champs pleine largeur, pas de débordement.

### 3.5 Modales (transverses)

- Toutes les modales (créer secteur, saisie passage, affaire, apporteur) : en mobile, pleine largeur et hauteur
  maîtrisée (`max-h` + scroll interne), boutons d'action accessibles sans dézoomer. Conserver `z-[1100]+`
  au-dessus des cartes (leçon z-index).

## 4. Contraintes de charte (inchangées)

- Couleurs quai-navy / quai-gold, font-display Playfair (titres uniquement), icônes Lucide via `Icon`.
- **Aucun emoji.**
- Tap-targets ≥ 44 px en mobile (accessibilité tactile).

## 5. Vérification

Test **en live navigateur** (pas seulement DOM) à 3 largeurs : **375 px** (petit iPhone), **390 px**
(iPhone récent), **768 px** (bascule tablette). Pour **chacun des 3 rôles** (agent, manager, admin) sur
**chaque page** :

- pas de débordement horizontal (rien ne sort de l'écran, pas de scroll latéral parasite) ;
- aucun élément qui se chevauche (en-tête, onglets, panneaux, légende) ;
- tous les boutons atteignables et cliquables sans dézoomer ;
- les éléments spécifiques manager/admin (Créer un secteur, attribution, Pilotage, Admin) présents et utilisables ;
- les cartes : panneau de détail en bottom sheet qui s'ouvre au-dessus de la carte, carte visible.

## 6. Hors périmètre

- Pas d'application native (reste une web-app responsive).
- Pas de mode hors-ligne (évolution future notée dans la consultation produit).
- Pas de refonte fonctionnelle : on adapte l'affichage, on ne change pas les fonctionnalités.
