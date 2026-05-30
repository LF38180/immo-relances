# Module 3 — Réseau d'apporteurs d'affaires — Spécification

**Projet :** ImmoProspect (ajout au projet existant `immo-prospect/`)
**Module :** 3 — Réseau d'apporteurs d'affaires
**Date :** 2026-05-30
**Statut :** Design validé — prêt pour le plan d'implémentation.

---

## 1. Objectif

Gérer le **réseau d'apporteurs d'affaires** de l'agence (concierges, commerçants, artisans, notaires,
particuliers…) : un annuaire qualifié, le **signalement d'affaires** (tuyaux) daté et tracé, le suivi de
leur aboutissement (`signalé → contacté → mandat → vente`), et le **calcul des commissions d'apport**.

Ce module capte la prospection **humaine** que les données publiques ne voient pas (notamment les
SCI/investisseurs), complémentaire des modules 1 (ciblage) et 2 (terrain). Purement données/gestion :
**pas de carte, pas de données externes**.

### Cadre légal (loi Hoguet)
Un apporteur **sans carte professionnelle** peut être rémunéré pour l'**indication / mise en relation**,
mais **ne doit pas négocier ni s'entremettre**. Le module reflète cela : rémunération **d'indication**
calculée sur les **honoraires d'agence**, et le `created_at` daté de chaque affaire sert de **preuve
d'antériorité** (litiges de paternité). Une mention discrète le rappelle dans l'interface.
*(À faire valider par un juriste avant exploitation — cf. document de vision.)*

---

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Contenu d'une affaire | **Tuyau libre + suivi de statut** (texte libre daté + pipeline de statuts) |
| Commission | **Calcul automatique en %**, base = **honoraires d'agence** |
| Annuaire | **Type + zone + fiabilité** (catégories, commune, statut actif/dormant, note) |
| Droits | **Tout le monde voit/gère** annuaire et affaires ; **barème de commission réservé manager/admin** |
| Statistiques | **Stats simples dans le module** (affaires par statut, top apporteurs, commissions à payer/payées) |
| Emplacement | **Dans ImmoProspect** (même auth, charte, base, déploiement) |

---

## 3. Modèle de données (2 nouvelles tables)

```sql
CREATE TABLE apporteurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'autre'
    CHECK(type IN ('concierge_gardien','commercant','artisan','notaire','particulier','autre')),
  commune TEXT,
  telephone TEXT,
  email TEXT,
  note TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE affaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apporteur_id INTEGER NOT NULL REFERENCES apporteurs(id),
  agent_id INTEGER NOT NULL REFERENCES users(id),   -- qui a saisi
  description TEXT NOT NULL,                          -- le tuyau (texte libre)
  statut TEXT NOT NULL DEFAULT 'signale'
    CHECK(statut IN ('signale','contacte','mandat','vente','perdu')),
  honoraires REAL DEFAULT 0,            -- honoraires agence (saisis à l'aboutissement)
  taux_commission REAL,                 -- % surchargeable ; sinon taux par défaut
  commission REAL DEFAULT 0,            -- calculée = honoraires * taux / 100
  commission_payee INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- preuve d'antériorité
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_affaires_apporteur ON affaires(apporteur_id);
CREATE INDEX idx_affaires_statut ON affaires(statut);
```

**Paramètre global** : `apporteurs.taux_defaut` (% des honoraires, défaut 10) stocké dans la table
`ponderations` existante (réutilisée comme table clé/valeur).

**Calcul de la commission** (serveur) : à chaque création/MAJ d'affaire,
`commission = honoraires × (taux_commission ?? taux_defaut) / 100`, borné ≥ 0.

---

## 4. API (nouvelles routes Express)

| Route | Rôle | Accès |
|-------|------|-------|
| `GET /api/apporteurs` | Liste (filtres : type, commune, actif) + nb d'affaires de chacun | auth |
| `POST /api/apporteurs` | Créer | auth |
| `PUT /api/apporteurs/:id` | Modifier | auth |
| `DELETE /api/apporteurs/:id` | Supprimer (si aucune affaire liée, sinon désactiver) | auth |
| `GET /api/affaires` | Liste des affaires (avec nom apporteur) pour le pipeline | auth |
| `POST /api/affaires` | Signaler une affaire (apporteur_id, description) | auth |
| `PUT /api/affaires/:id` | Faire avancer le statut / saisir honoraires / taux / payée → recalcule commission | auth |
| `DELETE /api/affaires/:id` | Supprimer | auth |
| `GET /api/affaires/stats` | KPIs : affaires par statut, top apporteurs, total commissions à payer / payées | auth |
| `GET /api/admin/apporteurs` / `PUT` | Lire/régler le taux par défaut | manager/admin |

---

## 5. Écrans (1 page « Apporteurs », 3 onglets)

Navigation étendue : **Ciblage / Terrain / Apporteurs**.

**5.1 Onglet « Affaires » (défaut) — pipeline**
- Colonnes par statut (signalé / contacté / mandat / vente / perdu), chaque affaire = une carte
  (apporteur, extrait de la description, date, commission si calculée).
- Bouton **« Signaler une affaire »** → modale : choisir l'apporteur (liste), décrire le tuyau. Daté auto.
- Clic sur une affaire → détail : faire avancer le statut ; au statut **vente**, saisir les honoraires →
  commission calculée (taux par défaut ou surchargé) ; case « commission payée ».

**5.2 Onglet « Apporteurs » — annuaire**
- Liste filtrable (type / commune / actif) ; chaque ligne : nom, type, commune, nb d'affaires, statut.
- Bouton **« Ajouter un apporteur »** → modale (nom, type, commune, téléphone, email, note, actif).
- Clic → fiche : coordonnées + historique de ses affaires.

**5.3 Onglet « Tableau de bord »**
- KPIs : affaires par statut, **top apporteurs** (par nb de mandats/ventes), **commissions à payer**
  et **payées** (totaux €).
- Réglage du **taux par défaut** (réservé manager/admin).

Mention discrète loi Hoguet (rémunération d'indication). Charte quai-* + Icon (Lucide), aucun emoji.

---

## 6. Découpage de construction (2 paliers)

1. **Palier A — Backend** : 2 tables + paramètre taux + routes CRUD apporteurs/affaires + calcul
   commission + stats. Vérifiable par API.
2. **Palier B — Frontend** : navigation étendue + page à 3 onglets (pipeline, annuaire, tableau de bord).

---

## 7. Réutilisation & cohérence

- Auth/rôles, charte quai-*, composants UI (Icon, PageHeader, NavTabs à étendre), api.js,
  react-hot-toast, mécanisme de base compressée pour le déploiement — tout repris.
- **Aucune nouvelle dépendance, aucune donnée externe.** Module le plus léger des trois.
- Impact base négligeable (tables vides au départ) → reste ~22 Mo compressée, déploiement inchangé.

---

## 8. Hors périmètre (YAGNI)

- Génération de documents (convention d'apport PDF).
- Notifications automatiques aux apporteurs.
- Gestion comptable avancée / export comptable.
- Lien automatique affaire ↔ adresse/secteur du Module 2 (passerelle future possible).

---

## 9. Définition de « terminé »

- [ ] Créer/modifier un apporteur (annuaire avec type, commune, fiabilité).
- [ ] Signaler une affaire (tuyau libre daté) rattachée à un apporteur.
- [ ] Faire avancer une affaire dans le pipeline (signalé → … → vente / perdu).
- [ ] À l'aboutissement : saisir les honoraires → commission calculée automatiquement ; marquer payée.
- [ ] Tableau de bord : affaires par statut, top apporteurs, commissions à payer/payées.
- [ ] Taux par défaut réglable (manager/admin).
- [ ] Build + run vérifiés ; charte respectée ; déployé sur Railway.
