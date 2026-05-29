# Module 1 — Ciblage territorial — Spécification technique

**Projet :** ImmoProspect (nouvel outil, séparé d'ImmoRelances)
**Module :** 1 — Ciblage territorial (le socle, données publiques)
**Date :** 2026-05-30
**Mode de départ :** DÉMO (échantillon Meylan/Grenoble) — données réelles branchées ensuite via script d'ingestion.

---

## 1. Objectif du module

Afficher une **carte de l'Isère découpée en quartiers (IRIS)**, chaque quartier portant un **score de potentiel 0-100** (deux variantes : **Vente** et **Gestion locative**), pour que le manager et les agents sachent **où prospecter en priorité**.

Périmètre cible final : **Isère (dpt 38)**. Périmètre démo : **~15 quartiers Meylan/Grenoble** avec données plausibles.

**Hors périmètre de ce module** (traités plus tard / autres modules) : suivi terrain adresse par adresse (Module 2), apporteurs (Module 3), pilotage avancé (Module 4), toute donnée nominative.

---

## 2. Principe du score (transparent et configurable)

Le score combine des **indicateurs par quartier**, tous issus de données publiques agrégées (aucune donnée individuelle). Chaque indicateur est normalisé 0-100, puis combiné par une **somme pondérée**. Les poids sont **configurables** (page admin) — on ne fige pas une formule magique.

### Indicateurs (calculés par IRIS)
| Code | Indicateur | Source | Sens |
|---|---|---|---|
| `rotation` | Taux de rotation = ventes/an ÷ parc de logements | DVF + INSEE | Marché actif |
| `anciennete` | Part de ménages installés depuis longtemps (ancienneté d'emménagement élevée) | INSEE | Biens « mûrs » à vendre |
| `proprietaires_ages` | Part de propriétaires de 65+ ans | INSEE | Proxy transmission/succession |
| `part_locatif` | Part de logements locatifs privés | INSEE | Potentiel **gestion** |
| `dpe_passoires` | Part de logements F/G | ADEME (opt.) | Ventes contraintes |
| `construction` | Dynamique de logements neufs | Sitadel (opt.) | Néo-bailleurs |
| `prix_m2` | Niveau de prix médian €/m² | DVF | Valeur des mandats |

### Deux variantes de score (mêmes indicateurs, poids différents)
- **Score VENTE** : pondère surtout `rotation`, `anciennete`, `proprietaires_ages`, `dpe_passoires`.
- **Score GESTION** : pondère surtout `part_locatif`, `construction` (néo-bailleurs), `rotation` (turn-over locatif).

> Les SCI / gros investisseurs ne sont pas détectables ici (données agrégées) → captés par le Module 3 (apporteurs). C'est documenté dans l'interface (info-bulle).

### Formule (pseudocode)
```
score_vente   = Σ ( poids_vente[i]   × indicateur_normalisé[i] )   // borné 0..100
score_gestion = Σ ( poids_gestion[i] × indicateur_normalisé[i] )   // borné 0..100
```
Les poids (deux jeux) sont stockés en base, modifiables en admin, avec des valeurs par défaut raisonnables fournies.

---

## 3. Architecture technique

**Stack** (même base qu'ImmoRelances + carto) :
- Front : React + Vite + TailwindCSS (charte Le Quai réutilisée) + **MapLibre GL** (carte vectorielle, open-source, fonds de carte libres) ou **Leaflet** (plus simple). → *décision technique : MapLibre pour la performance sur milliers de polygones ; repli Leaflet si complexité.*
- Back : Node + Express
- Base : **SQLite** (better-sqlite3, WAL, index) — tient les volumes Isère.
- Auth : réutilise le schéma JWT/bcrypt d'ImmoRelances (rôles agent/manager/admin).

**Nouveau dépôt / dossier** : `immo-prospect/` (séparé d'`immo-relances`, conformément à la décision « outil séparé »). Architecture miroir pour cohérence :
```
immo-prospect/
├── package.json
├── server/src/
│   ├── index.js
│   ├── database.js          ← schéma + score + seed démo
│   ├── ingest/              ← scripts d'ingestion data (DVF, IRIS…)
│   └── routes/              ← auth, iris (zones+scores), admin (poids)
├── client/src/
│   ├── pages/               ← Login, CarteCiblage, Admin
│   ├── components/          ← Map, ZonePanel, ScoreLegend, ui/ (réutilise charte)
│   └── utils/
└── data/sources/            ← (gitignoré) fichiers publics déposés par l'utilisateur
```

---

## 4. Modèle de données (SQLite)

```sql
CREATE TABLE iris (
  code_iris      TEXT PRIMARY KEY,      -- 9 caractères INSEE
  nom_iris       TEXT,
  code_commune   TEXT,
  nom_commune    TEXT,
  geometry       TEXT,                  -- GeoJSON (polygone simplifié, WGS84)
  -- indicateurs bruts
  nb_logements   INTEGER,
  ventes_an      REAL,
  pct_anciennete REAL,
  pct_prop_ages  REAL,
  pct_locatif    REAL,
  pct_dpe_fg     REAL,
  construction   REAL,
  prix_m2_median REAL,
  -- scores calculés
  score_vente    INTEGER DEFAULT 0,
  score_gestion  INTEGER DEFAULT 0,
  updated_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_iris_commune ON iris(code_commune);
CREATE INDEX idx_iris_score_vente ON iris(score_vente DESC);
CREATE INDEX idx_iris_score_gestion ON iris(score_gestion DESC);

CREATE TABLE ponderations (
  cle    TEXT PRIMARY KEY,   -- ex: 'vente.rotation', 'gestion.part_locatif'
  valeur REAL NOT NULL
);
```
La géométrie est stockée en GeoJSON texte (simple, suffisant à cette échelle). Si performance insuffisante, migration possible vers un format binaire / tuiles vectorielles.

---

## 5. API (Express)

| Route | Rôle | Retour |
|---|---|---|
| `POST /api/auth/login` | auth | token JWT (réutilise ImmoRelances) |
| `GET /api/iris?variante=vente\|gestion&commune=…` | liste des IRIS + score + géométrie | GeoJSON FeatureCollection |
| `GET /api/iris/:code` | détail d'un quartier (tous indicateurs) | objet |
| `GET /api/admin/ponderations` | poids actuels | objet |
| `PUT /api/admin/ponderations` | modifier les poids (manager/admin) → **recalcule tous les scores** | ok |

Le recalcul des scores se fait côté serveur (fonction `recalculerScores()` dans `database.js`, analogue à `recalculerScore` d'ImmoRelances).

---

## 6. Écrans (client)

1. **Connexion** — réutilise le design Login d'ImmoRelances (charte marine/or).
2. **Carte de ciblage** (écran principal) :
   - Carte plein écran, quartiers colorés selon le score (dégradé : froid = faible, chaud = fort).
   - **Bascule Vente / Gestion** (toggle en haut).
   - **Légende** de couleur (0-100).
   - **Clic sur un quartier** → panneau latéral : nom, commune, score, détail des indicateurs (barres), info-bulle « ce score est une aide à la priorisation, pas une donnée nominative ».
   - Filtre par commune ; liste triable des meilleurs quartiers (top potentiel).
3. **Administration** — réglage des **pondérations** (deux jeux vente/gestion), avec recalcul. Réservé manager/admin.

Charte : on **réutilise les composants UI** d'ImmoRelances (Icon/Lucide, PageHeader, cartes, couleurs `quai-*`). Cohérence visuelle de la future « boîte à outils ».

---

## 7. Script d'ingestion (data-agnostique)

`server/src/ingest/` contient des scripts Node qui :
1. Lisent les fichiers déposés dans `data/sources/` (DVF CSV, IRIS GeoJSON, INSEE CSV).
2. Filtrent l'Isère, agrègent par IRIS, calculent les indicateurs bruts.
3. Remplissent la table `iris`, puis appellent `recalculerScores()`.

**Mode démo :** un script `seed-demo.js` insère ~15 IRIS Meylan/Grenoble avec géométries simplifiées réelles (ou approchées) et indicateurs plausibles. Le reste du code (carte, API, scores) est **identique** que les données soient démo ou réelles → bascule transparente.

---

## 8. Définition de « terminé » (pour ce module, en mode démo)

- [ ] Carte affichant ~15 quartiers Meylan/Grenoble colorés par score.
- [ ] Bascule Vente / Gestion fonctionnelle (couleurs changent).
- [ ] Clic sur quartier → détail des indicateurs.
- [ ] Page admin : modifier les poids recalcule les scores et met à jour la carte.
- [ ] Auth (3 rôles) opérationnelle.
- [ ] Charte Le Quai appliquée.
- [ ] Script d'ingestion prêt à recevoir les vrais fichiers (testé sur l'échantillon).
- [ ] Build + run vérifiés (comme ImmoRelances).

---

## 9. Décisions & points ouverts

**Décidé :** score 0-100 + carte colorée ; double score vente/gestion dès le départ ; démo Meylan/Grenoble ; stack = base ImmoRelances + carto ; outil dans un dépôt/dossier séparé `immo-prospect/`.

**À confirmer avant code :**
1. **Carte** : MapLibre GL (recommandé) vs Leaflet — j'irai au plus simple qui tient la charge ; fond de carte libre (OSM/IGN) sans clé si possible.
2. **Dépôt** : nouveau dossier `immo-prospect/` à côté d'`immo-relances/` sur le Bureau, nouveau repo git ? (ou monorepo ?)
3. Réutilisation du **socle UI** d'ImmoRelances : copie des composants `ui/` au départ (simple) vs package partagé (plus tard).

> ⚠️ Rappel RGPD : ce module ne traite que des données **agrégées par zone**. Aucune fiche individuelle. Validation juriste prévue avant exploitation réelle (cf. document de vision).
