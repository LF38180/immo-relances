# Vision — Outil de prospection territoriale immobilière

**Projet :** Le Quai de l'Immobilier
**Date :** 2026-05-30
**Statut :** Document de vision (à partager : direction, agent prospection, juriste RGPD) — AVANT toute conception technique.
**Nom de travail :** *ImmoProspect* (à valider)

> ⚠️ **Avertissement RGPD/juridique.** Ce document s'appuie sur une analyse documentaire interne. Plusieurs points (réforme du démarchage téléphonique, position CNIL sur la pige, conditions exactes d'accès aux fichiers fonciers) doivent être **revérifiés avec des sources à jour et validés par un avocat RGPD/immobilier** avant toute mise en production. Les dates citées sont indicatives.

---

## 1. Pourquoi ce projet

La **pige immobilière classique** (récupérer les coordonnées de particuliers depuis leurs annonces pour les démarcher) est sous pression réglementaire croissante :
- Une annonce publique **ne vaut pas consentement** à être démarché (RGPD : détournement de finalité, obligation d'information art. 14).
- La **réforme du démarchage téléphonique** (loi de 2024, bascule vers le **consentement préalable / opt-in**, effet annoncé vers 2026 — *à vérifier*) rendrait l'**appel à froid** d'un vendeur non consentant **non conforme**.

Conséquence : il faut **d'autres méthodes de prospection**, moins dépendantes du démarchage individuel non sollicité. Ce projet outille ces méthodes : **ciblage de zones à fort potentiel** (sur données publiques, légal) + **prospection physique et humaine** (boîtage, porte-à-porte, apporteurs d'affaires).

### Principe directeur
On **renverse la logique** : au lieu de chasser des individus (fragile juridiquement), on **cible des secteurs** sur données publiques agrégées (100 % légal), puis on les travaille par des canaux que la réglementation n'étouffe pas (physique, réseau humain).

### Positionnement vs Maline (et similaires)
On **ne cherche pas à répliquer** un moteur prédictif « moments de vie » sur la personne : il repose sur des accès data privés et une conformité RGPD lourde hors de notre portée. On exploite la **faiblesse** de ces outils nationaux : l'**hyper-local**, le **réseau humain**, la **qualité d'exécution**, et l'**intégration à nos propres outils** (relances, futur CRM Modelo). La donnée publique ne crée pas d'avantage en soi — c'est **l'exécution et l'intégration** qui font la différence.

---

## 2. Double métier : Transaction ET Gestion locative

L'outil sert **deux objectifs commerciaux** distincts, avec des cibles et des signaux différents.

### 2.1 Transaction (capter des mandats de vente)
**Cible :** propriétaires occupants ou bailleurs susceptibles de vendre.
**Signaux de potentiel (par zone, données publiques) :**
- Taux de rotation des ventes (DVF) élevé.
- Ancienneté de détention / d'emménagement élevée (INSEE IRIS) → biens « mûrs ».
- Part de propriétaires âgés (proxy transmission/succession).
- Passoires thermiques (DPE ADEME, loi Climat) → ventes contraintes.
- Tension de prix / délais de vente.

### 2.2 Gestion locative (capter des mandats de gestion)
**Cible : TOUS les profils de bailleurs** (décision validée). Ce qui est repérable sur données publiques, par fiabilité :

| Cible | Repérable sur données publiques ? | Comment (au niveau ZONE) |
|---|---|---|
| **Bailleurs particuliers** | ✅ Oui (au niveau zone) | IRIS à forte **part de locatif privé** (statut d'occupation INSEE) ; quartiers de petits logements (T1/T2) souvent locatifs |
| **Néo-bailleurs** (investissement locatif récent) | 🟡 Partiellement | Zones de **construction neuve** (Sitadel) + zones tendues / dispositifs d'investissement ; achats récents (DVF) sur biens type investisseur |
| **Investisseurs / SCI / multipropriétaires** | 🔴 Difficile nominativement | Pas identifiables sur données publiques *agrégées* sans fichiers fonciers (accès verrouillé). Surtout captables via **réseau d'apporteurs** (notaires, syndics, gardiens) et signaux comportementaux opt-in |

**Conséquence de conception :** le score de potentiel se décline en **deux variantes** (potentiel *vente* / potentiel *gestion*) selon des pondérations différentes des mêmes données publiques. Les SCI/investisseurs se travaillent surtout par le **module apporteurs**, pas par la data publique.

---

## 3. Les 4 modules

### Module 1 — 🗺️ Ciblage territorial *(le cerveau ; données publiques ; 100 % légal)*
Carte de la zone de l'agence découpée en quartiers (**IRIS** INSEE). Chaque quartier reçoit un **score de potentiel** (deux variantes : vente / gestion) calculé à partir de sources publiques :
- **DVF** (Demandes de Valeurs Foncières) : ventes réelles → taux de rotation, prix, types de biens.
- **INSEE / IRIS** : propriétaires/locataires, âge, ancienneté d'emménagement, types de logements, revenus (Filosofi).
- **DPE (ADEME)** : passoires thermiques.
- **Sitadel** : dynamique de construction.
- **BAN / cadastre** : géolocalisation, rattachement adresse→IRIS.

**Valeur immédiate (même seul) :** le manager sait **où** envoyer les agents en priorité, par métier. Décline le « choix de secteur par potentiel » demandé.
**Garde-fou :** ciblage **à la zone**, **jamais** de fiche individuelle « M. X va vendre » déduite de ces données (interdit).

### Module 2 — 📍 Prospection terrain *(le différenciant ; mobile)*
Suivi **adresse par adresse** du travail de terrain :
- Découpage de secteurs sur carte, **affectation à un agent** (« mon secteur »).
- Granularité immeuble / rue / boîte : « boîté le 12/03 », « porte fermée », « RDV pris », photo de façade.
- **Cadencement anti-doublon** : alerte si une adresse a été traitée il y a moins de X semaines (re-passage typique 6-8 sem.) → évite le sur-boîtage et les conflits entre agents.
- **Tournées planifiées**, objectif du jour, checklist.
- **App mobile + mode hors-ligne** (saisie sur le trottoir, caves/zones blanches), photo + note vocale.

### Module 3 — 🤝 Réseau d'apporteurs d'affaires *(le malin ; humain)*
- **Annuaire qualifié** : concierges, gardiens, syndics, commerçants, artisans, notaires (catégorie, zone, fiabilité, statut : actif/dormant).
- **Signalement d'affaire** daté et tracé → **preuve d'antériorité** (litiges de paternité).
- **Pipeline dédié** : `signalé → contacté → mandat → compromis → vente` (ou → mandat de gestion), avec **attribution de l'origine**.
- **Commission d'apport** : calcul, déclenchement à l'acte, traçabilité comptable.
- **Animation** : relances, classement des meilleurs apporteurs.
- **Cadre loi Hoguet (strict) :** l'apporteur **sans carte T** se limite à **signaler / mettre en relation** ; il **ne négocie pas** (sinon entremise illégale). Convention d'apport écrite, rémunération d'indication déclarée.

### Module 4 — 📊 Pilotage manager *(le liant)*
Tableau de bord qui relie **effort → résultat** :
- Volume de contacts terrain / agent / période.
- **Taux de transformation par canal** (boîtage vs porte-à-porte vs apporteur vs ciblage), contact → R1 estimation → mandat → vente/gestion.
- Secteurs performants vs stériles (mandats générés / passages).
- **Coût d'acquisition d'un mandat** par canal.
- Activité comparée par agent (effort vs résultat), détection des décrocheurs.

---

## 4. Garde-fous RGPD *by design* (synthèse)

| Pratique | Statut | Décision de conception |
|---|---|---|
| Ciblage par **zone** (IRIS, agrégé) | ✅ Clairement légal | Cœur de l'outil |
| Prospectus **boîtes aux lettres** non adressés | ✅ Légal (hors « Stop Pub ») | Suivi de boîtage OK |
| **Porte-à-porte** | ✅ Légal (encadré conso) | Suivi terrain OK |
| **Apporteurs** (indication) | ⚠️ OK sous conditions (Hoguet + info de la personne signalée) | Convention + traçabilité |
| **Fiche individuelle** « moment de vie » | ⚠️ Lourd (intérêt légitime + DPIA + info art. 14 + opposition + conservation courte) | Hors périmètre initial ; à n'envisager qu'avec juriste |
| **Appel / email à froid** de particuliers | 🔴 Bientôt restreint / encadré (Bloctel, opt-in ~2026) | **Évité par conception** |
| Réutiliser **fichiers fonciers** (propriétaires) pour démarcher | 🔴 Verrouillé (secret fiscal) | Exclu |

**Obligations à prévoir si l'on traite des données individuelles (apporteurs, prospects) :** registre des traitements (art. 30), information (art. 14), droit d'opposition (art. 21), durée de conservation limitée + purge, éventuelle AIPD/DPIA.

---

## 5. Limite fondamentale à assumer

Sur **données publiques**, on cible des **ZONES**, pas des **PERSONNES**. On ne peut pas produire légalement une liste nominative de « propriétaires qui vont vendre/louer » (le fichier des propriétaires — MAJIC/Cerema — existe mais sa diffusion est verrouillée par le secret fiscal). L'individu se capte ensuite par le **terrain** et le **réseau humain**, pas par la data publique. C'est une force (légalité, différenciation locale), pas seulement une contrainte.

---

## 6. Rapport à l'existant

- **Outil de relances (ImmoRelances)** : déjà en production. À terme, brique d'une **« boîte à outils »** commune (auth/SSO, design, contacts partagés).
- **CRM Modelo** (futur) : prévoir l'**export/import** et des points d'intégration (un mandat capté en prospection doit pouvoir alimenter le CRM).
- **Décision** : pour l'instant **outil séparé** ; convergence possible plus tard.

---

## 7. Séquencement recommandé (pour livrer de la valeur par étapes)

> Construire les 4 modules d'un coup serait long et risqué. Proposition de découpage en sous-projets, chacun livrable et utile seul. **Chaque étape fera l'objet de sa propre spec détaillée + plan avant code.**

1. **Étape 1 — Module 1 (Ciblage territorial).** Le socle stratégique et légal. Carte + score de potentiel (vente & gestion) sur données publiques. Utile seul (« où prospecter »).
2. **Étape 2 — Module 2 (Prospection terrain mobile).** Donne le « comment exécuter » sur les zones priorisées. Forte valeur agent.
3. **Étape 3 — Module 3 (Apporteurs).** Indépendant, rapide, capte le réseau humain (et les SCI/investisseurs).
4. **Étape 4 — Module 4 (Pilotage).** Prend tout son sens quand 2-3 modules alimentent des données.
5. **Transverse, dès le départ :** cadrage RGPD avec juriste + registre des traitements.

---

## 8. Questions ouvertes (à trancher avant la spec détaillée de l'étape 1)

1. **Périmètre géographique** de l'agence (commune, agglo, liste de communes) → calibre l'échelle du module 1.
2. **Stack technique** : réutilise-t-on React/Node/SQLite comme ImmoRelances ? Le module cartographique impose une brique carto (Leaflet/MapLibre + fonds IGN) et l'ingestion de jeux de données publics volumineux (DVF, IRIS) — à cadrer.
3. **Budget données** : on démarre 100 % public (gratuit) ; horizon données agence (étape 2-3) puis éventuellement payantes (étape ultérieure).
4. **Validation juridique** : qui (avocat RGPD/immobilier) et quand.
5. **Convergence** avec ImmoRelances / Modelo : maintenant ou plus tard.

---

## Annexe — Sources de données publiques identifiées

| Source | Contenu | Accès | Usage |
|---|---|---|---|
| **DVF / DV3F** (DGFiP, Etalab, Cerema) | Ventes réelles : prix, date, type, surface, parcelle (non nominatif) | data.gouv.fr, app.dvf.etalab.gouv.fr, API Cerema | Rotation, prix, dynamique |
| **INSEE / IRIS** | Population, ménages, propriétaires/locataires, âge, ancienneté d'emménagement, logements, revenus (Filosofi) | insee.fr (bases infracommunales), api.insee.fr ; contours IGN | Profil socio-démo par quartier |
| **DPE (ADEME)** | Étiquettes énergétiques par adresse | data.ademe.fr | Repérage passoires thermiques |
| **Sitadel2** | Permis / logements autorisés-commencés | statistiques.developpement-durable.gouv.fr | Dynamique de construction (néo-bailleurs) |
| **BAN** | Base Adresse Nationale, géocodage | adresse.data.gouv.fr (API) | Normalisation adresses → IRIS |
| **Cadastre / PCI** | Parcelles, bâti | cadastre.data.gouv.fr, API IGN | Cartographie |
| **Géorisques** | Aléas (inondation, argiles, PPRN) | georisques.gouv.fr (API) | Argument valorisation/risque |
| **Fichiers fonciers / MAJIC** (Cerema) | Propriétaires (nominatif), caractéristiques fines | **Sous convention / secret fiscal** | ⚠️ NON réutilisable pour démarchage |

*Toutes les URLs et millésimes sont à reconfirmer sur les portails officiels.*
