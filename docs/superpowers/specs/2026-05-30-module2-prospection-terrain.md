# Module 2 — Prospection terrain — Spécification

**Projet :** ImmoProspect (ajout au projet existant `immo-prospect/`)
**Module :** 2 — Prospection terrain (boîtage / porte-à-porte par secteur)
**Date :** 2026-05-30
**Statut :** Design validé — prêt pour le plan d'implémentation.

---

## 1. Objectif

Outiller le travail de **prospection physique** des agents : découper des **secteurs** (regroupements
de quartiers IRIS), y suivre le travail **adresse par adresse** (boîtage, porte-à-porte), avec un
**cadencement anti-doublon** pour éviter de re-traiter trop vite une même rue.

Le Module 1 (ciblage) dit **où** prospecter (quartiers à fort potentiel) ; le Module 2 outille le
**comment** (exécution terrain). Les deux vivent dans la même app `immo-prospect`.

**Données réelles :** Base Adresse Nationale (BAN) de l'Isère — **428 953 adresses** (testé, téléchargé
dans `data/sources/ban/adresses-38.csv.gz`, ~15 Mo compressé).

---

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Granularité du suivi | **À l'adresse** (base BAN pré-chargée) |
| Définition d'un secteur | **Regroupement de quartiers IRIS** existants (réutilise Module 1) |
| Affichage des adresses | **À la demande / par secteur sélectionné** (jamais les 428k d'un coup) ; carte **+** liste rue par rue |
| Détail d'un passage | **Statut + date + canal + note** (+ photo optionnelle) |
| Affectation des secteurs | **Secteur assigné à un agent** (« mon secteur ») ; manager voit tout |
| Cadencement anti-doublon | **Signalement visuel** (couleur « traité récemment »), seuil paramétrable (défaut 6 semaines), **non bloquant** |
| Emplacement | **Dans ImmoProspect** (même auth, charte, base, carte) |

---

## 3. Modèle de données (3 nouvelles tables SQLite)

```sql
-- Adresses BAN de l'Isère (ingérées une fois)
CREATE TABLE adresses (
  id TEXT PRIMARY KEY,            -- id BAN
  numero TEXT, rep TEXT,
  nom_voie TEXT,
  code_postal TEXT,
  code_insee TEXT,               -- commune INSEE
  nom_commune TEXT,
  code_iris TEXT,                -- rattachement au quartier (jointure Module 1)
  lon REAL, lat REAL,
  libelle TEXT                   -- libellé d'acheminement
);
CREATE INDEX idx_adresses_iris ON adresses(code_iris);
CREATE INDEX idx_adresses_insee ON adresses(code_insee);

-- Secteurs de prospection
CREATE TABLE secteurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  iris_codes TEXT NOT NULL,       -- JSON : ["382290101", ...]
  agent_id INTEGER REFERENCES users(id),   -- affecté à (nullable)
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Passages (historique de traitement par adresse)
CREATE TABLE passages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id TEXT NOT NULL REFERENCES adresses(id),
  secteur_id INTEGER REFERENCES secteurs(id),
  agent_id INTEGER NOT NULL REFERENCES users(id),
  canal TEXT NOT NULL CHECK(canal IN ('boitage','porte_a_porte')),
  statut TEXT NOT NULL CHECK(statut IN ('fait','rdv','refus','absent')),
  note TEXT,
  photo TEXT,                     -- data-url optionnelle (ou chemin)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_passages_adresse ON passages(adresse_id);
CREATE INDEX idx_passages_agent ON passages(agent_id);
CREATE INDEX idx_passages_date ON passages(created_at);
```

Le **dernier passage** par adresse (MAX created_at) détermine son **état d'affichage** :
- jamais de passage → « à faire »
- dernier passage récent (< seuil) → « traité récemment »
- dernier passage ancien (> seuil) → « à retravailler »
- dernier statut `rdv` → « RDV »
- dernier statut `refus` → « refus »

Paramètre `terrain.cadence_semaines` (défaut 6) stocké dans la table `ponderations` existante
(réutilisée comme table clé/valeur) ou une table `parametres` dédiée.

---

## 4. API (nouvelles routes Express)

| Route | Rôle | Accès |
|-------|------|-------|
| `GET /api/secteurs` | Mes secteurs (agent) / tous (manager+) avec stats (nb adresses, % traité, dernier passage) | auth |
| `POST /api/secteurs` | Créer un secteur (nom + iris_codes + agent_id) | manager/admin |
| `PUT /api/secteurs/:id` | Modifier (renommer, réaffecter) | manager/admin |
| `DELETE /api/secteurs/:id` | Supprimer | manager/admin |
| `GET /api/secteurs/:id/adresses` | Adresses du secteur + dernier passage de chacune (charge la carte de travail) | auth |
| `POST /api/passages` | Enregistrer un passage (adresse_id, canal, statut, note, photo) | auth |
| `GET /api/admin/terrain` / `PUT` | Lire/régler le seuil de cadence | manager/admin |

`GET /secteurs/:id/adresses` joint `adresses` (filtrées par `code_iris IN secteur.iris_codes`) avec
le dernier `passage` de chaque adresse, et renvoie lon/lat + état calculé selon le seuil.

---

## 5. Écrans (3 nouveaux + navigation)

Ajout d'une **navigation** dans ImmoProspect entre « Ciblage » (Module 1, carte de scores) et
« Terrain » (Module 2). Réutilise charte, Icon, PageHeader, Leaflet.

**5.1 Mes secteurs** (accueil terrain)
- Liste des secteurs de l'agent (cartes) : nom, commune(s), nb adresses, **% traité**, date dernier passage.
- Manager : voit tous les secteurs + bouton **« Créer un secteur »** (sélection de quartiers IRIS sur
  la carte de ciblage → nommer → affecter à un agent).
- Clic → écran de travail.

**5.2 Travail du secteur** (cœur, mobile-first)
- **Carte** centrée sur le secteur, affichant **les adresses du secteur** (chargées à la demande),
  points colorés selon l'état (cadencement) :
  - gris clair = à faire · vert = traité récemment · ambre = à retravailler · navy = RDV · rouge = refus
- **Liste rue par rue** synchronisée (regroupée par voie), chaque adresse cochable.
- Tap sur une adresse → **saisie rapide** : canal (boîtage / porte-à-porte), statut (fait / RDV / refus /
  absent), note, photo optionnelle → POST passage → la couleur se met à jour.
- **Compteur de session** (adresses traitées aujourd'hui dans ce secteur).

**5.3 Administration terrain**
- Réglage du **seuil de cadence** (semaines, défaut 6).

---

## 6. Ingestion BAN

Script `server/src/ingest/ingest-ban.js` (lancé une fois) :
1. Lit `data/sources/ban/adresses-38.csv.gz` (séparateur `;`, colonnes : id, numero, rep, nom_voie,
   code_postal, code_insee, nom_commune, lon, lat, libelle_acheminement…).
2. Rattache chaque adresse à son `code_iris` : via `code_insee` + point-in-polygon sur les géométries
   IRIS déjà en base (réutilise la logique du Module 1) ; repli sur le 1er IRIS de la commune.
3. Insère en masse (transaction) dans `adresses`.

**Impact base :** ~40-60 Mo après ingestion (428k adresses). La base reste committée pour Railway
(acceptable ; bascule possible vers ingestion-au-boot si ça devient gênant).

---

## 7. Découpage de construction (3 paliers, chacun testable)

1. **Palier A — Backend + ingestion BAN** : 3 tables, ingestion des 428k adresses rattachées aux IRIS,
   routes secteurs/passages/adresses. Vérifiable par API (créer un secteur, charger ses adresses).
2. **Palier B — Secteurs (front)** : navigation Ciblage/Terrain, écran « Mes secteurs », création/
   affectation par le manager (sélection d'IRIS sur la carte).
3. **Palier C — Écran de travail terrain** : carte adresses + liste rue par rue + saisie de passages +
   cadencement visuel + compteur de session.

---

## 8. Réutilisation & cohérence

- **Auth/rôles, charte quai-*, composants UI (Icon, PageHeader), api.js, Leaflet** : repris du Module 1.
- Les secteurs s'appuient sur les **quartiers IRIS** déjà en base (pas de nouvelle géométrie).
- Même design (marine/or), même base SQLite, même déploiement Railway.

---

## 9. Hors périmètre (YAGNI)

- **Mode hors-ligne complet (offline-first)** : la PWA gère un cache basique ; le vrai offline avec
  synchro différée est un gros chantier — repoussé tant que le besoin terrain n'est pas confirmé.
- **Création de contacts depuis une adresse** : déborde sur le futur CRM / l'outil de relances —
  prévu comme passerelle ultérieure, pas maintenant.
- **Optimisation d'itinéraire de tournée** (ordre de passage optimal) : amélioration future.
- **Nombre exact de boîtes aux lettres par immeuble** : non disponible en open data ; une adresse BAN
  = un point d'entrée (suffisant pour le suivi de boîtage).

---

## 10. Définition de « terminé »

- [ ] 428k adresses BAN ingérées et rattachées aux IRIS.
- [ ] Un manager peut créer un secteur (sélection d'IRIS) et l'affecter à un agent.
- [ ] Un agent voit ses secteurs avec % traité.
- [ ] Sur un secteur, la carte affiche les adresses colorées par état + liste rue par rue.
- [ ] Saisir un passage (canal/statut/note) met à jour l'état de l'adresse.
- [ ] Le cadencement signale visuellement les adresses traitées récemment (seuil réglable).
- [ ] Build + run vérifiés ; charte respectée ; déployable sur Railway.
