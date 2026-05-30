# Module « Potentiel de secteur » — Spec de conception

> Projet : **ImmoProspect** (`/Users/loickferrucci/Desktop/immo-prospect/`)
> Date : 2026-05-31 · Statut : conception validée, prêt pour plan d'implémentation
> Méthode : brainstorming + recherche multi-agents (FNAIM, Immodata/MeilleursAgents, INSEE)

## 1. Objectif

Ajouter au **Module 1 (Ciblage)** une vue **« Potentiel de secteur »** : un score 0-100
par **commune** (et par IRIS pour la maille fine), mesurant le potentiel commercial d'un
secteur pour l'agence, avec le détail transparent des sous-facteurs.

Le score répond à la question métier : *« où concentrer la prospection pour capter le plus
de mandats ? »*

## 2. Constat fondateur (issu de la recherche)

La recherche multi-agents a corrigé plusieurs idées reçues. Ces constats sont assumés
dans la conception :

- **Il n'existe pas de « méthode FNAIM » normée** de scoring de secteur. Les « 3 D »
  (décès, divorce, déménagement) sont un outil mnémotechnique de formation commerciale,
  pas un modèle statistique. → On construit notre propre modèle, ancré sur des données
  réelles (DVF + INSEE), pas sur un mythe.
- **Le « 58 % » d'intermédiation n'est pas un standard FNAIM.** Le taux réel est de
  ~65-70 % au national (PAP ~30-34 %), mais **très variable localement** (50 % rural →
  70 % urbain). Traité comme paramètre ajustable, pas comme constante.
- **La concurrence en 1/N est naïve** : les parts de marché suivent une loi de Pareto.
  Les **mandataires** (iad, SAFTI…) = 27 % du marché 2024 et doivent être comptés.
- **Le délai de vente est impossible à calculer** sans données d'annonces (il vient des
  portails, pas de DVF qui n'a aucune date de mise en vente). → **Retiré du périmètre.**
- **Taux de rotation = ventes DVF ÷ parc de logements** : définition validée (Immodata),
  à lisser sur 3 ans (volatilité des micro-marchés).

## 3. Décisions de cadrage (brainstorming)

| Sujet | Décision |
|---|---|
| Cadastre EDIGEO (`dep38`) | **Laissé de côté** (réserve) — redondant à ~80 % avec la BAN déjà ingérée |
| Maille du score | **Commune** (affichage principal) + **IRIS** (maille fine + répartition secteurs agents) |
| Proxy des transactions | **DVF** (mutations réelles) en remplacement des DIA (non open data) |
| Historique DVF | **2021-2025** (S2 2025 marqué provisoire) |
| Concurrence | **SIRENE APE 6831Z complet** (agences + mandataires), pondération dégressive |
| Intermédiation | Paramètre ajustable, **défaut 0,65** (calibrable par commune ensuite) |
| Délai de vente | **Hors périmètre** (pas de données d'annonces) |
| Décès / nécrologies | **Évolution future**, hors V1 |
| Restitution | **Score 0-100** + détail des facteurs + classe de fiabilité |
| Intégration | **Tables pré-calculées** + nouvelle vue carte dans le Module 1 |
| Pondérations | **Poids experts** stockés en base (`ponderations`), ajustables sans recoder |

## 4. Modèle de score

### 4.1 Les 5 critères

Chaque critère est normalisé en **rang percentile intra-strate** (urbain / rural), puis
combiné par moyenne pondérée. Les poids vivent dans la table `ponderations`.

| # | Critère | Poids défaut | Mesure |
|---|---|---|---|
| 1 | **Volume de marché** | 35 % | ventes DVF/an (lissées 3 ans) × taux d'intermédiation |
| 2 | **Turn-over / dynamisme** | 20 % | rotation = ventes ÷ nb logements du secteur |
| 3 | **Concurrence** (inversée, dégressive) | 20 % | ventes captables ÷ acteurs SIRENE 6831Z |
| 4 | **Indice 3D** | 15 % | 0,5·mobilité + 0,3·propriétaires âgés + 0,2·monoparental |
| 5 | **Valeur unitaire** | 10 % | prix médian m² × surface moyenne (proxy honoraires) |

```
score_potentiel (0-100) = 0,35·C1 + 0,20·C2 + 0,20·C3 + 0,15·C4 + 0,10·C5
  (chaque Ci normalisé 0-100 en rang percentile intra-strate)
  C3 INVERSÉ : moins de concurrence = score plus élevé (marché plus captable)
```

### 4.2 Indice 3D (sous-modèle, INSEE)

Trois proxys mesurables, tous à l'IRIS, depuis les bases INSEE recensement 2022 :

| Sous-facteur | Poids interne | Variable INSEE |
|---|---|---|
| **Déménagement** (MOB) | 50 % | part des ménages emménagés depuis < 2 ans (base Logement) |
| **Décès / succession** (SUCC) | 30 % | part 75+ × part propriétaires (base Population × Logement) |
| **Divorce / séparation** (SEP) | 20 % | part des familles monoparentales (base Couples-Familles) |

### 4.3 Garde-fous statistiques

Issus des pratiques Immodata / standards statistiques :

- **Seuil minimal** : prix médian affiché si n ≥ 10 ventes ; KPI de segment si n ≥ 5.
  Sous le seuil → « non significatif » (pas de chiffre inventé).
- **Lissage bayésien (empirical Bayes)** pour les communes à faible volume :
  `score_lissé = (n·score_local + k·score_parent) / (n + k)`, où score_parent = moyenne
  de la maille parente (EPCI / département), k ≈ effectif médian (≈ 20-30).
- **Stratification urbain/rural** avant normalisation : on ne compare pas un IRIS
  grenoblois à une commune du Vercors sur la même échelle.
- **Classe de fiabilité** affichée : A (n ≥ 30), B (10 ≤ n < 30), C (n < 10, lissé).

## 5. Données à acquérir

Toutes en open data. Le cadastre EDIGEO n'est PAS utilisé.

| Donnée | Source | État |
|---|---|---|
| DVF 2025 (S2 provisoire) | data.gouv.fr DVF | à télécharger |
| Bases INSEE IRIS 2022 (Logement, Population, Couples-Familles) | insee.fr infracommunal | à télécharger |
| SIRENE établissements APE 6831Z Isère | API/base SIRENE open data | à télécharger |
| CSV `communes-locaux-adresses-2024` | fourni (`~/Downloads`) | présent, à ingérer |
| DVF 2021-2024 | `data/sources/dvf/` | déjà en base |
| Contours IRIS, INSEE de base | `iris` table | déjà en base |

## 6. Architecture technique

S'aligne sur l'architecture existante (DB SQLite pré-calculée committée compressée).

### 6.1 Données / base

- Nouvelle table **`iris_potentiel`** : score + 5 sous-facteurs + classe fiabilité + n_ventes, par IRIS.
- Nouvelle table **`commune_potentiel`** : agrégat par commune + contour GeoJSON (dissolution
  des `iris.geometry`) + score + sous-facteurs + classe fiabilité.
- Réutilise **`ponderations`** (clé/valeur) pour tous les poids (5 critères + 3 sous-poids 3D +
  intermédiation + k de lissage).

### 6.2 Scripts d'ingestion (`server/`)

- `ingest:dvf2025` — ajoute le millésime 2025 aux mutations.
- `ingest:insee3d` — charge les 3 bases INSEE IRIS (mobilité, âge×proprio, monoparental).
- `ingest:sirene` — charge les établissements 6831Z par commune.
- `ingest:locaux` — charge le CSV `communes-locaux` (nb_locaux par commune).
- `ingest:potentiel` — calcule les scores (rang percentile, lissage, agrégation IRIS→commune),
  écrit `iris_potentiel` et `commune_potentiel`. Lit les poids depuis `ponderations`.

### 6.3 API (`server/src/routes/`)

- `GET /api/potentiel?maille=commune|iris` — renvoie la liste avec score + sous-facteurs +
  fiabilité + géométrie (pour la carte choroplèthe).
- `GET /api/potentiel/:code` — détail d'une commune/IRIS (les 5 facteurs décomposés).
- Lecture des poids depuis `ponderations` à chaque calcul d'affichage (déjà pré-calculé en base ;
  l'API sert ; un recalcul complet reste un job d'ingestion).

### 6.4 Frontend (`client/`)

- Nouvelle vue **« Potentiel »** intégrée au Module 1 (onglet ou sous-vue de Ciblage).
- **Carte choroplèthe** Leaflet : couleur = score 0-100 (dégradé quai-navy → quai-gold),
  bascule commune/IRIS selon le zoom.
- **Panneau latéral détail** au clic : score global + jauge, puis les 5 sous-facteurs
  (valeur brute + contribution normalisée), la classe de fiabilité (A/B/C), le nombre de
  ventes pris en compte.
- Charte : quai-navy/quai-gold, font-display Playfair, icônes **Lucide via `Icon.jsx`**,
  recharts pour les jauges. **Aucun emoji** (règle stricte). Modales en `z-[1100]`
  (au-dessus de Leaflet — leçon du bug z-index précédent).

## 7. Tests & vérification

- **Ingestion** : comptages cohérents (nb communes ≈ 512-533), pas de NaN/null sur les
  scores, somme des facteurs IRIS = facteur commune, classe fiabilité présente partout.
- **API** : score borné [0,100], chaque sous-facteur présent, géométrie valide, `:code`
  inexistant → 404 propre.
- **Vérification live navigateur** (pas seulement « élément dans le DOM ») : carte qui rend,
  panneau qui s'ouvre AU-DESSUS de la carte (z-index), dégradé de couleur lisible.

## 8. Hors périmètre (V1) — évolutions futures

- **Délai de vente** : nécessiterait des données d'annonces (portails) — non disponibles.
- **Nécrologies / décès fins** : signal de prospection (leads), pas une base statistique
  (sources non exhaustives, sans licence). À explorer plus tard.
- **Calibration des poids par régression sur DVF** : remplacer les poids experts par des
  poids empiriques. Reporté (risque de surapprentissage avec peu de communes ; et l'utilisateur
  veut d'abord voir et ajuster manuellement).
- **Force des concurrents** (ancienneté, vitrines, avis) : pondérer la concurrence par la
  force réelle des acteurs, pas seulement leur nombre. V2.
- **Cadastre EDIGEO** : analyse foncière fine à la parcelle, si un besoin cartographique
  parcellaire émerge.

## 9. Sources de la recherche

- FNAIM bilan 2024 ; FCI Immobilier (parts PAP/agences/notaires) ; notaires de Paris (durée
  de détention) ; Statista (taux de rotation).
- Immodata / immobilier-data.fr (méthodologie taux de rotation, seuils n≥5/10) ;
  MeilleursAgents (ITI, délai de vente = annonces) ; Yanport (modèles de survie, maille IRIS).
- INSEE : Logement 2022, Population 2022, Couples-Familles-Ménages 2022 (infracommunal IRIS) ;
  mobilité résidentielle (8,8 % 2023) ; décès 2024 ; INED divorces.
