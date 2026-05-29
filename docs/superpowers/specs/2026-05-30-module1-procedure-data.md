# Module 1 — Procédure d'acquisition des données publiques (Isère, dpt 38)

**Projet :** ImmoProspect — Module 1 (Ciblage territorial)
**Date :** 2026-05-30
**But :** Lister précisément quels fichiers publics télécharger pour le département de l'Isère, où, sous quel format, et comment les préparer pour l'ingestion en base SQLite. À réaliser **avant** le développement (l'environnement de dev n'a pas d'accès Internet).

> Toutes les URLs et millésimes sont à reconfirmer sur les portails officiels au moment du téléchargement.

---

## Vue d'ensemble

On a besoin de **3 jeux de données obligatoires** pour un premier score, + **2 optionnels** pour l'enrichir. Tous gratuits, publics, non nominatifs.

| Priorité | Jeu | Sert à | Volume Isère (ordre de grandeur) |
|---|---|---|---|
| 🔴 Obligatoire | **DVF** (ventes réelles) | Taux de rotation, prix, types de biens | ~300–500k lignes / 5 ans |
| 🔴 Obligatoire | **Contours IRIS** (géométries) | Dessiner les quartiers sur la carte | ~1 000–2 000 polygones |
| 🔴 Obligatoire | **Base INSEE IRIS** (logement + population) | Propriétaires/locataires, âge, ancienneté | ~1 000–2 000 lignes |
| 🟡 Optionnel | **DPE (ADEME)** | Passoires thermiques | volumineux |
| 🟡 Optionnel | **Sitadel** (permis) | Dynamique construction (néo-bailleurs) | léger |

---

## 1. 🔴 DVF — Demandes de Valeurs Foncières

**Quoi :** toutes les ventes immobilières réelles (prix, date, type de bien, surface, localisation à la parcelle/adresse). Non nominatif.

**Où télécharger (2 options) :**
- **Option simple (recommandée) — fichiers annuels par département**, format CSV :
  - Source : `files.data.gouv.fr/geo-dvf/latest/csv/` → un dossier par année → fichier `38.csv.gz` (Isère).
  - Récupérer les **5 dernières années** (ex. 2020 → 2024) : 5 fichiers `38.csv.gz`.
- Option avancée : API DVF Etalab / DV3F Cerema (plus riche mais nécessite compte/convention pour DV3F).

**Colonnes utiles (DVF géolocalisé) :** `date_mutation`, `valeur_fonciere`, `type_local` (Maison/Appartement/Dépendance/Local…), `surface_reelle_bati`, `nombre_pieces_principales`, `surface_terrain`, `code_commune`, `nom_commune`, `code_postal`, `adresse_*`, `longitude`, `latitude`, `id_parcelle`.

**Filtrage à prévoir à l'ingestion :**
- Garder `nature_mutation = 'Vente'` (exclure échanges, expropriations…).
- Garder `type_local IN ('Maison','Appartement')` pour le score résidentiel (les locaux commerciaux/dépendances à part).
- Une mutation peut générer plusieurs lignes (un bien + ses dépendances) → dédupliquer par `id_mutation` si présent.

**Limites connues :** publication semestrielle ; délai ~6-12 mois ; exclut Alsace-Moselle/Mayotte (sans objet pour l'Isère) ; exclut successions/donations.

---

## 2. 🔴 Contours IRIS (géométries des quartiers)

**Quoi :** les polygones géographiques de chaque IRIS, pour dessiner la carte.

**Où :** IGN / Géoservices — jeu **« CONTOURS-IRIS »** (millésime le plus récent).
- Page : `geoservices.ign.fr` → rechercher « CONTOURS-IRIS ».
- Format : Shapefile ou GeoPackage, projection souvent Lambert-93 (EPSG:2154).

**Préparation :**
- **Filtrer sur l'Isère** : ne garder que les IRIS dont `INSEE_COM` commence par `38`.
- **Convertir en GeoJSON** en WGS84 (EPSG:4326) pour le web (outil : `ogr2ogr` de GDAL, ou QGIS).
- **Simplifier les géométries** (tolérance ~10-20 m) pour alléger l'affichage web sans perte visible.
- Clé de jointure : `CODE_IRIS` (9 caractères).

---

## 3. 🔴 Base INSEE IRIS (données logement + population)

**Quoi :** les statistiques par IRIS (propriétaires/locataires, âge, ancienneté d'emménagement, types de logements, etc.).

**Où :** `insee.fr` → « Bases infracommunales » / « Données IRIS » du recensement (RP) le plus récent. Jeux pertinents :
- **« Logement »** (IRIS) : statut d'occupation (propriétaire/locataire), type de logement, **ancienneté d'emménagement**, période de construction. → cœur du score.
- **« Population »** (IRIS) : structure par âge → part de propriétaires âgés (à croiser).
- Optionnel **Filosofi** (IRIS, si dispo) : niveau de vie/revenus.

**Format :** CSV ou XLSX, une ligne par IRIS, clé `IRIS` (= `CODE_IRIS`).
**Préparation :** filtrer les lignes `DEP = 38` (ou `CODE_IRIS` commençant par `38`). Ne garder que les colonnes utiles au score (à lister précisément dans la spec technique).

---

## 4. 🟡 DPE (ADEME) — optionnel (passoires thermiques)

**Où :** `data.ademe.fr` → « DPE logements existants » (API + export). Filtrable par département/code postal.
**Usage :** compter la part de logements classés F/G par zone → indicateur de ventes contraintes (loi Climat).
**Note :** volumineux et nominatif à l'adresse → on **agrège par IRIS/commune** uniquement, on ne stocke pas de fiche par logement pour le ciblage.

---

## 5. 🟡 Sitadel — optionnel (construction neuve)

**Où :** `statistiques.developpement-durable.gouv.fr` → Sitadel (logements autorisés/commencés).
**Usage :** dynamique de construction par commune → repérer zones de néo-bailleurs (investissement locatif récent).

---

## 6. Format de livraison attendu (pour le dev)

Une fois récupérés, déposer les fichiers dans le projet sous :
```
immo-prospect/
└── data/
    └── sources/
        ├── dvf/38_2020.csv  …  38_2024.csv   (décompressés)
        ├── iris/contours-iris-38.geojson      (filtré Isère, WGS84, simplifié)
        ├── iris/insee-logement-iris-38.csv
        ├── iris/insee-population-iris-38.csv
        ├── dpe/dpe-38.csv            (optionnel)
        └── sitadel/sitadel-38.csv    (optionnel)
```
Un **script d'ingestion** (Node) lira ces fichiers, filtrera/agrégera, et remplira la base SQLite (table `iris` avec géométrie + indicateurs + score calculé).

---

## 7. Étapes concrètes pour toi (résumé actionnable)

1. **DVF** : télécharger `38.csv.gz` pour 2020→2024 sur `files.data.gouv.fr/geo-dvf/latest/csv/`, décompresser.
2. **Contours IRIS** : télécharger CONTOURS-IRIS sur l'IGN, filtrer Isère, convertir en GeoJSON WGS84 simplifié (QGIS le fait en quelques clics, ou je te fournis la commande `ogr2ogr`).
3. **INSEE IRIS** : télécharger les bases « Logement » et « Population » IRIS sur insee.fr, filtrer dpt 38.
4. (Optionnel) DPE et Sitadel.
5. Déposer le tout dans `data/sources/` selon l'arborescence ci-dessus.

> Tu peux me dire à quelle étape tu bloques — je te donnerai les commandes exactes (notamment la conversion `ogr2ogr`/QGIS des contours IRIS, qui est la seule étape un peu technique).

---

## 8. Ce qu'on peut faire EN ATTENDANT les vraies données

Pendant que tu récupères les fichiers, je peux développer le module avec un **échantillon de démonstration** (quelques IRIS de Meylan/Grenoble codés en dur ou un mini-jeu fictif) : la carte, le calcul de score, l'interface seront fonctionnels, et on remplacera la source par les vrais fichiers via le script d'ingestion. Ça évite d'attendre, et le code data-agnostique est prêt le jour où les fichiers arrivent.
