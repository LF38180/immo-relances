# Module Courtage V2 — Import du cahier des messages + latence

**Date:** 2026-08-07 · **App:** immo-relances · Suite de la V1 (déjà en prod)

## Contexte et décisions

La V1 (espace Marine cloisonné, saisie manuelle CI Facile, cycle de relances, mail
injoignables, statuts, dashboard, paramètres) est **déployée et fonctionnelle**.

Cette V2 ajoute l'alimentation depuis le **cahier des messages** (Google Sheets).

**Décision d'accès (arbitrée) : dépôt de fichier .xlsx, PAS d'API Google.**
- La politique de l'organisation Google Workspace bloque la création de clés de compte
  de service (`iam.disableServiceAccountKeyCreation`) → service account impossible.
- La publication CSV du Sheet exposerait des données personnelles (RGPD) → écartée.
- Retenu : Marine (ou l'admin) télécharge le Sheet en .xlsx et le dépose dans l'appli.
- Conséquence assumée : **pas de synchro automatique quotidienne** — l'import est à la
  demande (hebdomadaire recommandé, 2 min). Le reste des exigences est couvert.
- Réutilise le mécanisme éprouvé de `ImportModal` (Chrystelle) : parsing .xlsx
  multi-onglets côté client via la lib `xlsx` déjà présente ; le serveur reçoit les
  lignes normalisées et applique les règles (le fichier brut ne transite pas).

## Priorités (refonte)

| Catégorie | Priorité | Latence par défaut |
|---|---|---|
| Saisie manuelle CI Facile (`manuel`) | 1 | aucune |
| OUI agent (`oui_agent`) | 2 | aucune |
| OUI Gabby (`oui_gabby`) | 3 | 3 jours |
| À qualifier (`a_qualifier`) | 4 | 7 jours |

Tri de la file : `priorite ASC`, puis **du plus ancien au plus récent** (`date_contact ASC`,
à défaut `prochaine_relance ASC`). Les fiches V1 existantes (`manuel`, priorité 1) restent
correctes — aucune migration de données nécessaire.

## Latence

Un lead ne doit pas être proposé avant que l'agent ait fait son rappel de découverte.
- À l'import : `prochaine_relance = date_contact + latence(catégorie)`.
- Si cette date est déjà passée (historique), la fiche est immédiatement disponible
  (**décision validée** : au premier import, tout l'historique nov. 2025 → aujourd'hui
  entre dans la file, trié du plus ancien au plus récent).
- Latences paramétrables : `courtage_latence_oui_agent` (0), `courtage_latence_oui_gabby`
  (3), `courtage_latence_a_qualifier` (7).

## Règles de tri à l'import (ordre strict)

1. **Exclusion location** : `ATTRIBUTION CR` (col. E) correspondant à un agent de
   `courtage_exclusion_agents` → ligne ignorée (comptée « exclue »).
   Comparaison robuste : normalisation (majuscules, accents retirés, ponctuation, espaces),
   puis **correspondance sur le NOM DE FAMILLE** présent dans la cellule, quel que soit
   l'ordre ou la forme (« POITEVIN Lyes », « Lyes P », « lyes poitevin », « BARRETO Nolan »).
   Pour « Lyes P » (prénom + initiale), on teste aussi le **prénom** de la liste.
   Liste paramétrable admin (format : `POITEVIN Lyes,BARRETO Nolan`).
2. **M = NON** (col. M `PROSPECT INTÉRESSÉ ?`) → **liste noire** (tél + mail normalisés),
   jamais importé, jamais réimportable. Si une fiche existe déjà pour ce contact, elle
   passe en statut `ne_plus_contacter`.
3. **M = OUI** → `oui_gabby` (prio 3) si **P ou S valent OUI**, sinon `oui_agent` (prio 2).
   ⚠️ Analyse du fichier réel (11/08/2026) : P et S sont quasi toujours pré-remplies
   (« NON QUALIFIÉ »/« NON »), donc le critère « renseignée » classerait 233 des 250 OUI
   en Gabby (leads chauds retardés de 3 j). Critère retenu = **valeur OUI** → 144 OUI agent
   (immédiat) / 106 OUI Gabby (J+3). Validé par Loïck le 11/08/2026.
   Paramétrable : `courtage_heuristique_gabby` = `PS_OUI` (défaut) | `PS_REMPLI` | `off`
   (tout en `oui_agent`).
4. **M = NON QUALIFIÉ** (ou variantes « NON QUALIFIE ») → catégorie `a_qualifier` (prio 4).
5. **Autres valeurs de M / vide** → ligne ignorée (comptée « sans qualification »).
6. **Dédoublonnage** : clé = `telephone_norm`, à défaut `mail_norm`. Contact déjà présent
   → pas de doublon : la demande s'ajoute à `courtage_demandes` (référence du bien + date)
   et les champs vides de la fiche sont complétés (mail, capacité d'emprunt…). Contact en
   liste noire → jamais recréé.
7. **Incrémental** : hash SHA-1 de la ligne source (onglet + valeurs clés) stocké dans
   `courtage_import_lignes` → une ligne déjà traitée n'est jamais retraitée.

## Analyse du fichier réel (export du 11/08/2026, 1,9 Mo)

Structure **identique sur les 10 onglets** (A→U, en-têtes conformes) : le parsing par
position est sûr, sécurisé par une vérification des en-têtes (A=DATE, F=NOM…).

Onglets : AOUT 2026, JUILLET 2026, JUIN 2026, MAI 2026, AVRIL 2026, MARS 2026,
FEVRIER 2026, JANVIER 2026, NOVEMBRE 2025, DÉCEMBRE 25 (nom irrégulier confirmé).

Volumes : 12 720 lignes brutes → **6 135 exploitables** (DATE ou NOM présent).
- Colonne M : **250 OUI**, 2 495 NON QUALIFIÉ, **885 NON** (→ liste noire), 2 495 vides,
  10 en-têtes répétés (« PROSPECT INTÉRESSÉ? ») à ignorer.
- Exclusion agents (Poitevin/Barreto, toutes variantes) : **1 241 lignes**.
- Attribution CR : formes multiples confirmées (« POITEVIN LYES » 937, « LYES P » 147,
  « TARA Z » 357…) → correspondance sur nom de famille **ou** prénom, sans accents/casse.
- Téléphones : 4 210 numériques (dont `33XXXXXXXXX`), 1 914 chaînes avec espaces,
  valeur parasite « TEL » → normalisation en chiffres, `33…`/`+33…` → `0…`.
- Dates : 6 120 en série Excel, 15 en chaîne → conversion ISO.

Ordre de grandeur attendu au premier import : ~250 OUI (144 agent / 106 Gabby),
~2 495 à qualifier, ~885 mises en liste noire, ~1 241 exclues. À confirmer par le
**mode simulation** avant écriture réelle.

## Parsing du fichier

- Tous les onglets, noms irréguliers acceptés (« AOUT 2026 », « DÉCEMBRE 25 »…).
  Détection du mois/année par normalisation du nom d'onglet (accents, abréviations,
  année sur 2 ou 4 chiffres) — sert de repli si la date de la ligne est illisible.
- Ligne 1 = en-têtes, ligne 2 = sous-en-têtes → **données à partir de la ligne 3**.
- Lignes sans DATE **ni** NOM → ignorées silencieusement.
- Colonnes par position : A date, B heure, C appels/mails, D source, E attribution CR,
  F nom, G prénom, H téléphone, I mail, J référence bien, K commentaire, M intéressé,
  N suivi lead, O capacité d'emprunt, P potentiel location, S potentiel neuf.
- **Données sales** :
  - Téléphone (H) : peut arriver en nombre, en date Excel (numéro de série) ou avec
    espaces/points → toujours traité en chaîne ; si valeur numérique de type date Excel,
    tentative de reconstruction ; normalisation finale = chiffres uniquement, `+33x` → `0x`.
  - Date (A) : chaîne `JJ/MM/AAAA`, `JJ/MM/AA`, ou numéro de série Excel → converti en ISO.
  - Source (D) : variantes de casse normalisées (leboncoin → LeBonCoin, selo/seloger →
    SeLoger, pap → PAP, sinon casse d'origine nettoyée).

## Rapport d'import et journal

Le serveur renvoie et journalise : lignes lues, fiches créées (par catégorie), doublons
(demande ajoutée), exclues (agent), mises en liste noire, ignorées (sans qualification /
sans données), déjà importées. Affiché à Marine après import et consultable par l'admin
(`courtage_imports` : date, auteur, fichier, compteurs, détail JSON).

**Mode simulation** : case « Simuler sans enregistrer » → même rapport, aucune écriture.
Utile pour valider l'heuristique OUI Gabby et les volumes au premier import.

## Écriture retour colonne N (phase 2 — NON activée)

Architecture préparée, pas de code d'écriture : chaque fiche mémorise son origine
(`source_onglet`, `source_ligne`) dans `courtage_import_lignes`, ce qui permettra plus tard
de retrouver la cellule N à mettre à jour. Accès Google en **lecture seule** ici (et même
pas d'accès Google du tout dans cette version : dépôt de fichier).

## Modèle de données (ajouts)

```sql
courtage_import_lignes ( id PK, hash TEXT UNIQUE NOT NULL, onglet TEXT, ligne INTEGER,
  fiche_id INTEGER REFERENCES courtage_fiches(id) ON DELETE SET NULL,
  resultat TEXT, created_at )               -- resultat : cree|doublon|exclu|blackliste|ignore
courtage_imports ( id PK, user_id, fichier TEXT, simulation INTEGER DEFAULT 0,
  lignes_lues INTEGER, creees INTEGER, doublons INTEGER, exclues INTEGER,
  blacklistees INTEGER, ignorees INTEGER, deja_importees INTEGER,
  detail TEXT, created_at )                 -- detail : JSON par catégorie
```
Ajouts sur `courtage_fiches` : `source_onglet TEXT`, `source_ligne INTEGER`,
`suivi_lead TEXT` (col. N lue), `date_contact` déjà présent.

## Paramètres (tous modifiables sans redéploiement)
`courtage_exclusion_agents`, `courtage_latence_oui_agent`, `courtage_latence_oui_gabby`,
`courtage_latence_a_qualifier`, `courtage_heuristique_gabby`, + les existants
(délai relance J+7, tentatives max, tél Marine, objet/corps du mail).

## Accès
Import ouvert à **Marine et à l'admin** (décision validée). Journal des imports : admin
(et Marine voit le rapport de ses propres imports).

## Garde-fous
- Aucun impact sur l'espace de Chrystelle (tables et routes distinctes).
- Import idempotent : réimporter le même fichier ne crée aucun doublon.
- Liste noire absolue : jamais recréé, même via import.
- Mot de passe : la gate de changement obligatoire reste **désactivée** pendant la phase
  de test de Loïck (ligne temporaire dans database.js) — à réactiver avant remise à Marine.
