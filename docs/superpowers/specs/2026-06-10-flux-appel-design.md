# Design — Refonte du flux d'appel (2 étapes) + retrait du cadencier

> Spec validée 2026-06-10. Branche `feat/flux-appel`.

## But

Simplifier l'écran de session pour l'agent : 2 boutons d'abord (répondu / pas répondu),
puis les issues seulement si répondu. Qualification propre à chaque appel → reporting facile.
Le cadencier estimation (jalons J+2/7/15/30, badge, bouton mandat) est RETIRÉ.

## Flux

### Étape 1 — deux gros boutons
- **N'a pas répondu** → enregistre, passe au suivant. Le contact reste dans le pipeline,
  re-proposé après un délai paramétrable (défaut 3 jours).
- **A répondu** → ouvre l'étape 2.

### Étape 2 — issues (si répondu)
| Issue | Saisie en plus | Effet contact |
|---|---|---|
| **Projet** (estimation, RDV…) | notes | statut `rdv_obtenu` → sort de la file auto, géré en direct |
| **À recontacter plus tard** | date de rappel (obligatoire) | statut `rappel_planifie`, `prochain_contact` = date |
| **N'habite plus à l'adresse** | nouvelle adresse (adresse/CP/ville) OU case "adresse inconnue" | si adresse fournie : adresse mise à jour, statut `a_recontacter` (reste actif). Si inconnue : statut `inactif` + tag `prospecter_terrain` + ancienne adresse consignée en note |
| **Plus de projet** | notes | statut `a_recontacter`, `prochain_contact` = +N jours (défaut 180 ≈ 6 mois, paramétrable) |
| **Autre** | note obligatoire | statut `a_recontacter`, revient en file |

Notes optionnelles partout sauf où indiqué. "Enregistrer et suivant" valide.

## Données

- **relances.issue** (nouvelle colonne TEXT, migration idempotente) = l'issue fine :
  `sans_reponse | projet | rappel | demenage | sans_projet | autre`.
  Le `statut` relance reste mappé sur les valeurs CHECK existantes :
  sans_reponse→tente_sans_reponse, projet→rdv_obtenu, rappel→rappel_planifie,
  demenage→contacte, sans_projet→contacte, autre→contacte.
- **Paramètres** (table parametres, éditables Admin) :
  - `delai_sans_reponse_jours` = 3 (re-proposition d'un sans-réponse)
  - `relance_sans_projet_jours` = 180 (revoir un "plus de projet")
- Tag `prospecter_terrain` (dans le champ tags JSON existant) = ancienne adresse à prospecter.
  Filtrable via le param `tag` du GET /contacts (existe déjà).

## Retrait du cadencier

Supprimer : CadenceBadge, filtre "En cadencier", bouton/raccourci `mandat_obtenu`,
param admin cadence, helpers cadence (client+server), logique file-relances cadencier,
incrément cadence_etape, mandat_signe handling, tests cadencier.
Les colonnes `cadence_etape`/`mandat_signe` restent en base (inoffensives) mais les ALTER
sont retirés de la migration (plus utilisées).

## Back — relanceRoutes POST /

Nouveau contrat : `{ contact_id, issue, notes?, date_rappel?, nouvelle_adresse?:{adresse,code_postal,ville}, adresse_inconnue?:bool, duree_appel? }`.
Compatibilité : si `statut` envoyé sans `issue` (ancien front), comportement legacy conservé.
Le handler mappe issue→statut relance (CHECK ok), insère la relance avec `issue`,
applique l'effet contact (statut, prochain_contact, adresse, tags) selon le tableau ci-dessus.
date_dernier_contact + nombre_tentatives mis à jour comme avant. recalculerScore conservé.

## Stats / reporting

GET /relances/stats : ajouter `parIssue` (GROUP BY issue, type='appel') → le manager voit
combien de projets / rappels / déménagés / sans projet / sans réponse sur la période.

## Front — SessionPage

- Étape 1 : 2 gros boutons (raccourcis 1 / 2).
- Étape 2 : 5 choix ; champs conditionnels (date pour rappel ; adresse+CP+ville+case
  "adresse inconnue" pour déménagé ; note obligatoire pour autre).
- Récap PDF : libellés par issue.
- Retour possible de l'étape 2 vers l'étape 1.

## Admin

Onglet Paramètres : champs `delai_sans_reponse_jours` et `relance_sans_projet_jours`
(remplacent le champ cadence).

## Hors scope
- Pont "prospecter_terrain" → ImmoProspect (plus tard).
- Pas de modification du CHECK SQLite (mapping statuts).
