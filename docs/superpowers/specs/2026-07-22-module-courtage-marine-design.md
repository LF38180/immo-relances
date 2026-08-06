# Module Courtage (Marine) — V1 sans import Google Sheets

**Date:** 2026-07-22 · **App:** immo-relances

## Contexte
Second espace utilisateur, totalement cloisonné, pour Marine Rosain (courtage en
financement). L'existant (Chrystelle, fichier relances) ne doit changer en RIEN.
V1 = saisie manuelle + cycle de relances + mail injoignables + dashboard.
V2 (plus tard) = import Google Sheets (cahier des messages) — le modèle de données
V1 est conçu prêt pour la V2 (liste noire, priorités, historique demandes, journal).

## Décisions d'architecture (validées)
- **Tables dédiées** `courtage_*` : cloisonnement physique, aucune requête existante
  de Chrystelle modifiée.
- **Rôle `courtage`** : routing dédié — Marine ne voit que son espace. Migration du
  CHECK users via **table-swap sûr FK** (PRAGMA foreign_keys OFF + transaction +
  DROP IF EXISTS users_new — `relances.agent_id` et `contacts.assigned_to` référencent
  users ; leçon du crash prod immo-prospect).
- **Compte** : marine.rosain@lequai-immobilier.com / MarineLeQuai (bcrypt), avec
  `must_change_password=1` → écran de changement obligatoire au 1er login (le flag
  tombe au PUT /password).
- **Admin (Loïck)** : accès **lecture** aux deux espaces (dashboards).
- **Paramètres évolutifs sans redéploiement** (table `parametres` existante, clés
  préfixées `courtage_`) : délai défaut (7 j), tentatives avant Injoignable (2),
  téléphone Marine, objet + corps du mail, liste d'agents exclus (pour V2 import).

## Modèle de données
```sql
courtage_fiches (
  id PK, nom NOT NULL, prenom, telephone, telephone_norm,  -- norm = chiffres seuls pour dédoublonnage
  mail, mail_norm,
  date_contact,            -- date de la demande/simulation
  montant_projet,          -- optionnel
  reference_bien,          -- optionnel (alimente [BIEN] du mail ; V2 import le remplira)
  source DEFAULT 'CI Facile',   -- V2 : LeBonCoin/SeLoger… normalisés
  attribution_cr, capacite_emprunt,   -- V2
  categorie DEFAULT 'manuel',  -- manuel | oui_agent | oui_gabby | a_qualifier (V2)
  priorite DEFAULT 1,          -- 1 oui_agent, 2 oui_gabby, 3 a_qualifier (tri file)
  statut CHECK IN ('a_qualifier','en_relance','simulation_faite','dossier_en_cours',
                   'gagne','perdu','injoignable','ne_plus_contacter') DEFAULT 'en_relance',
  prochaine_relance,       -- date ; NULL si statut terminal
  tentatives_sans_reponse DEFAULT 0,
  mail_propose_le,
  commentaire,             -- note initiale
  created_at, updated_at
)
courtage_actions ( id PK, fiche_id FK CASCADE, type CHECK IN
  ('creation','relance','pas_de_reponse','trop_tot','mail_propose','statut'),
  commentaire, prochaine_relance, statut_avant, statut_apres, created_at )
courtage_blacklist ( id PK, telephone_norm, mail_norm, motif, created_at )  -- 'ne_plus_contacter' → insert ; V2 : M=NON
courtage_demandes ( id PK, fiche_id FK CASCADE, reference_bien, date_demande, created_at )  -- V2 dédoublonnage
```
Normalisation tél : retirer tout sauf chiffres, `+33x…` → `0x…`. Mail : lowercase/trim.

## Règles métier V1
- **Création rapide** (< 1 min) : nom obligatoire, le reste optionnel ; entre « En
  relance », prochaine relance = J+`courtage_delai_relance_jours` (défaut 7) modifiable.
  Si tél/mail normalisé en liste noire → création refusée avec message.
- **Relances du jour** : fiches `prochaine_relance <= aujourd'hui` ET statut non
  terminal (ni gagné/perdu/ne_plus_contacter ; injoignable INCLUS s'il a une relance
  planifiée après mail). Tri : priorité ASC puis prochaine_relance ASC (ancienneté).
- **Clôturer une relance** : commentaire obligatoire + nouvelle date (défaut J+7).
  Action historisée. Statut peut être changé dans le même geste.
- **Trop tôt** : +7 j en 1 clic OU date choisie. Action historisée, pas de commentaire requis.
- **Pas de réponse** : tentatives+1, la fiche revient **demain**. À la
  `courtage_tentatives_max`-ième (défaut 2) → statut auto « injoignable » ; le front
  propose alors le mail.
- **Mail injoignable** (fiche avec mail) : bouton « Préparer le mail » → lien `mailto:`
  (destinataire, objet, corps depuis les paramètres ; variables `[Prénom]`, `[BIEN]`,
  `[TEL_MARINE]` ; si pas de référence bien → « immobilier » générique). Au clic :
  action `mail_propose`, `mail_propose_le` = date, prochaine relance = J+7.
- **Statuts** : boutons sur la fiche. `ne_plus_contacter` → insertion blacklist
  (tél+mail normalisés) + prochaine_relance NULL. `gagne`/`perdu` → NULL aussi.

## Écrans (rôle courtage — Marine)
Vue dédiée (elle ne voit rien d'autre), 3 onglets + création :
1. **Relances du jour** (vue principale) : liste triée, chaque carte = identité, tél
  en gros, montant/bien, dernier commentaire, boutons : Relance faite (commentaire +
  date), Trop tôt (+7 j / date), Pas de réponse, statuts. Fiche dépliable → historique
  complet (actions datées).
2. **Fiches** : toutes ses fiches, filtre par statut, recherche nom/tél, accès fiche.
3. **Tableau de bord** : relances faites sur la semaine, fiches par statut,
  simulations réalisées, dossiers en cours, taux OUI→simulation et simulation→dossier
  (même esprit visuel que le dashboard existant).
+ Bouton « + Nouvelle fiche » (formulaire rapide CI Facile) accessible partout.
+ Écran « changement de mot de passe obligatoire » au 1er login (bloquant).

## Admin
- Dashboard courtage en **lecture** (mêmes chiffres que Marine) — accessible depuis
  la Supervision existante (section/onglet Courtage).
- Paramètres courtage dans la page Admin (délai, tentatives, tél Marine, objet/corps
  du mail, liste d'exclusion V2).
- La gestion users existante crée/gère le compte (rôle courtage dans le select).

## Sécurité / garde-fous
- Routes `courtage_*` : écriture réservée rôle `courtage` ; lecture : courtage +
  manager + admin. Aucune route existante modifiée (sauf : select rôle admin + login
  qui renvoie must_change_password).
- Migration users FK-safe (pattern migrerRolesUsers), idempotente.
- AUCUNE modification des tables/routes/écrans de Chrystelle. Non-régression
  complète exigée (tous tests existants verts + vérif navigateur session Chrystelle).
- Mots de passe hachés ; flag must_change_password sans exposition du mot de passe.

## Hors scope V1 (V2 planifiée)
Import Google Sheets (service account), règles de tri M=OUI/NON/NON QUALIFIÉ,
exclusion agents, dédoublonnage import, synchro quotidienne + bouton, journal
d'imports, import initial avec rapport. Les tables/champs nécessaires existent dès V1.
