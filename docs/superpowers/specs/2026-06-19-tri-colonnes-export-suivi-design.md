# Tri par colonne + suivi dans l'export CSV

Date : 2026-06-19
Statut : design validé

## Demandes

1. **Tri par colonne** : cliquer une icône à côté de chaque titre de la liste
   Contacts ouvre un menu : Tri croissant / Tri décroissant / Réinitialiser.
2. **Export CSV avec le dernier suivi** : l'export doit inclure le dernier suivi
   (issue + note + date) édité par l'agent, actuellement absent du CSV.

## Contexte

- Tri serveur déjà en place : params `sort`/`order`, whitelist `validSorts`
  (`score_priorite, nom, date_dernier_contact, prochain_contact, created_at,
  categorie, statut`). Piloté côté client par un dropdown "Trier" (conservé).
- Entêtes de table actuellement non cliquables.
- Export `/export/csv` : `SELECT * FROM contacts`, colonnes en dur, sans la
  dernière relance.

## Architecture

### 1. Tri par colonne (client `ContactsPage.jsx`)

- Colonnes triables (clé de tri serveur entre parenthèses) :
  Nom (`nom`), Téléphone (`telephone`), Ville (`ville`), Catégorie
  (`categorie`), Statut (`statut`), Dernier suivi (`derniere_relance_date`),
  Score (`score_priorite`), Dernier contact (`date_dernier_contact`),
  Prochain (`prochain_contact`).
- Chaque `<th>` triable affiche le libellé + une icône déclencheur (⋯ / chevron).
- Clic sur l'icône → petit menu (popover) avec 3 actions :
  - **Tri croissant** → `setSort(cle); setOrder('ASC')`
  - **Tri décroissant** → `setSort(cle); setOrder('DESC')`
  - **Réinitialiser le tri** → `setSort('score_priorite'); setOrder('DESC')`
- La colonne active (sort courant) affiche une flèche ↑ (ASC) / ↓ (DESC).
- Menu maison (état `menuColonne` = clé ouverte ou null ; clic ailleurs ferme).
  Pas de nouvelle dépendance.
- Le dropdown "Trier" existant est conservé ; il partage `sort`/`order`, donc
  reste synchronisé.

### 2. Whitelist serveur élargie (`contactRoutes.js`)

Ajouter `telephone`, `ville`, `derniere_relance_date` à `validSorts`.
NB : `derniere_relance_date` n'est pas une colonne de `contacts` mais l'alias de
la sous-requête (dernière relance). Le `ORDER BY` doit pouvoir l'utiliser →
trier sur l'alias `derniere_relance_date` (valide en SQLite car présent dans le
SELECT). Les contacts sans relance (NULL) se classent en dernier en DESC,
premier en ASC (comportement SQLite standard) — acceptable.

### 3. Export CSV avec dernier suivi (`contactRoutes.js`)

- La requête export joint la dernière relance (même sous-requête que la liste).
- 3 colonnes ajoutées au header et aux lignes :
  `dernier_suivi_issue`, `dernier_suivi_note`, `dernier_suivi_date`.
- `dernier_suivi_issue` : label lisible (mapping issue→label côté serveur,
  ex 'projet'→'Projet', 'sans_reponse'→'Sans réponse'…) ; vide si aucune relance.
- `dernier_suivi_note` : note (échappée comme les autres : virgules→`;`, sauts→espace).
- `dernier_suivi_date` : date de la dernière relance (ou vide).

## Découpage

| Unité | Rôle |
|-------|------|
| `contactRoutes.js` | whitelist tri élargie + export joint la dernière relance (3 colonnes) |
| `ContactsPage.jsx` | entêtes avec menu de tri (croissant/décroissant/réinit) + indicateur |

## Tests

- **Serveur** : tri par `derniere_relance_date` ne plante pas et ordonne ;
  export CSV contient les 3 colonnes de suivi avec les bonnes valeurs (issue
  label, note, date) pour un contact avec relance, vide pour un sans.
- **Navigateur** : cliquer l'icône d'une colonne → menu → croissant/décroissant
  réordonne la liste ; flèche affichée sur la colonne triée ; réinitialiser
  revient au tri par défaut. Export → ouvrir le CSV → colonnes de suivi présentes.

## Hors scope

Tri multi-colonnes simultané. Persistance du tri entre sessions. Tri côté client
(le tri reste serveur, sur toute la base, pas seulement la page affichée).
