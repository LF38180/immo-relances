# Design — Cadencier estimation→mandat (ImmoRelances)

> Spec validée 2026-06-09. Branche `feat/cadencier-estimation`.

## But

Récupérer les mandats perdus : quand l'agence fait une estimation, relancer automatiquement
le propriétaire à intervalles cadencés jusqu'à signature du mandat. ~60-70% d'estimations
qualifiées sont perdues faute de relance cadencée.

## Déclencheur

Tout contact avec `date_estimation` renseignée (champ existant, alimenté par l'import Modelo
ou la saisie fiche) entre dans le cadencier. Pas de saisie supplémentaire.

## Jalons (configurables Admin)

Paramètre `cadence_estimation_jours` dans la table `parametres` (Admin → Paramètres).
Défaut : `"2,7,15,30"` (J+2, J+7, J+15, J+30 après la date d'estimation).
Format : liste d'entiers séparés par virgule.

## Mécanisme

- Nouveau champ contact `cadence_etape INTEGER DEFAULT 0` = index du prochain jalon à traiter.
  - 0 = en attente du 1er jalon (J+2), 1 = du 2e (J+7), etc.
  - Quand `cadence_etape >= nombre de jalons` → cadencier terminé (abandon).
- Un contact est "dû" dans le cadencier si :
  `date_estimation` non vide ET `cadence_etape < nb_jalons`
  ET `statut` ∉ (mandat_obtenu, pas_interesse, inactif)
  ET `date_estimation + jalons[cadence_etape] jours <= aujourd'hui`.
- Ces contacts remontent dans la file de relances du jour (en plus de la logique actuelle).
- Quand l'agent enregistre une relance sur un contact en cadencier : `cadence_etape += 1`
  (passe au jalon suivant). Géré côté POST /relances.

## Sortie du cadencier

- **Mandat obtenu** : nouveau statut contact `mandat_obtenu`. L'agent le marque → sort du
  cadencier (succès). Ajouter au CHECK statut + STATUTS front + STATUTS_RELANCE (résultat d'appel).
  Mapping relance→contact : un résultat d'appel `mandat_obtenu` met le contact en `mandat_obtenu`.
- **Tous jalons épuisés** : `cadence_etape >= nb_jalons` → plus dû, sort naturellement (abandon).
- `pas_interesse` / `inactif` : exclus (déjà le cas).

## Visibilité

- **Badge fiche + liste** : si contact en cadencier, badge "Estimation J+X" (X = prochain jalon).
  Composant calcule le prochain jalon dû/à venir depuis date_estimation + cadence_etape.
- **Filtre liste** : nouvelle option "En cadencier" (en plus de conseiller/source/ville).
  Back GET / : param `cadence=1` → WHERE date_estimation non vide AND cadence_etape < nb_jalons
  AND statut hors sortie.
- **File de relances** : les jalons dus remontent (voir Mécanisme).

## Migration DB

`server/src/database.js`, bloc idempotent :
```js
if (!contactCols.includes('cadence_etape')) db.exec("ALTER TABLE contacts ADD COLUMN cadence_etape INTEGER NOT NULL DEFAULT 0");
```
Statut `mandat_obtenu` : le CHECK actuel bloque les nouvelles valeurs. SQLite ne permet pas
ALTER CHECK simplement. Option retenue : **retirer le CHECK statut** (les valeurs sont contrôlées
côté code via STATUTS_OK). Migration : recréer la table contacts sans le CHECK est risqué sur
données. Alternative simple : le statut `mandat_obtenu` n'a PAS besoin d'être dans le CHECK si
on le stocke... non, le CHECK rejette. DÉCISION : ajouter `mandat_obtenu` en assouplissant —
comme le CHECK est sur la table contacts existante, on garde `rdv_obtenu` comme statut de succès
ET on ajoute un flag `mandat_signe INTEGER DEFAULT 0` plutôt que toucher le CHECK. Le contact
"mandat obtenu" = `mandat_signe=1`, sort du cadencier. Évite la recréation de table risquée.

→ Champ `mandat_signe INTEGER NOT NULL DEFAULT 0`. Sortie cadencier = mandat_signe=1.
Le résultat d'appel "Mandat obtenu" (nouveau bouton session) met mandat_signe=1 + statut rdv_obtenu.

## Config Admin

Admin → Paramètres : champ "Cadence estimation (jours, séparés par virgule)" = `cadence_estimation_jours`.
Seed défaut "2,7,15,30" si absent.

## Fichiers

| Fichier | Action |
|---|---|
| `server/src/database.js` | migration cadence_etape + mandat_signe + seed param cadence |
| `server/src/routes/contactRoutes.js` | file-relances : +jalons dus ; GET / : filtre cadence=1 |
| `server/src/routes/relanceRoutes.js` | POST /relances : incrémente cadence_etape ; résultat mandat → mandat_signe=1 |
| `client/src/utils/cadence.js` | **créer** : helper prochain jalon (date_estimation + etape + jalons) |
| `client/src/components/ContactBadge.jsx` ou nouveau | badge "Estimation J+X" |
| `client/src/pages/ContactsPage.jsx` | filtre "En cadencier" |
| `client/src/pages/SessionPage.jsx` | bouton résultat "Mandat obtenu" + badge si en cadencier |
| `client/src/pages/AdminPage.jsx` | champ paramètre cadence |
| `server/test/cadencier.test.js` | **créer** : tests jalon dû, incrément étape, sortie mandat |

## Hors scope (YAGNI)

- Pas de notification push automatique (la file du jour suffit).
- Pas d'email/SMS auto (autre chantier).
- Le cadencier ne crée pas d'entrées relances à l'avance : calcul à la volée (pas de table planning).
