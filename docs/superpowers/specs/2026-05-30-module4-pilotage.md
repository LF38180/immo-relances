# Module 4 — Pilotage manager — Spécification

**Projet :** ImmoProspect (ajout au projet existant `immo-prospect/`)
**Module :** 4 — Pilotage manager (tableau de bord transversal)
**Date :** 2026-05-30
**Statut :** Design validé — prêt pour le plan d'implémentation.

---

## 1. Objectif

Donner au **directeur d'agence** un tableau de bord **analytique** qui agrège les données des modules
1-3 pour relier **l'effort** (prospection terrain, affaires signalées) au **résultat** (RDV, mandats,
ventes), par **agent** et par **canal**, sur une période choisie.

C'est le module de **synthèse** : il ne crée aucune donnée, il **lit et agrège** ce que les autres
modules produisent. Réservé **manager / admin**.

> Note : les modules étant récents, il y aura peu de données réelles au départ. Le tableau de bord est
> structurellement complet mais affichera des **états vides soignés** tant que l'activité est faible.
> Il se remplit au fil de l'usage.

---

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Objectif | **Vue d'ensemble** : activité des agents ET performance par canal |
| Période | **Filtre 7 / 30 / 90 jours** (glissant), comme ImmoRelances |
| Angle | **Bilan analytique** sur la période (tendances, comparaisons, entonnoir) |
| Définition du « résultat » | **RDV** (passages terrain statut `rdv`) **+ mandats + ventes** (affaires apporteurs) |
| Accès | **Manager / admin uniquement** |
| Emplacement | **Dans ImmoProspect** (même auth, charte, base) |

---

## 3. Sources de données (lecture seule, aucune nouvelle table)

| Table | Apporte |
|-------|---------|
| `passages` (Module 2) | effort terrain (canal `boitage`/`porte_a_porte`), résultat RDV (statut `rdv`), agent, date |
| `affaires` (Module 3) | effort apporteurs (affaires signalées), résultat (statut `mandat`/`vente`), agent, date, commission |
| `users` | agents (nom, rôle) pour la ventilation par agent |
| `secteurs` (Module 2) | rattachement optionnel des passages à un secteur (non requis pour la V1) |

**Note :** l'outil de relances (ImmoRelances) est une base séparée — ses données ne sont **pas** incluses
(une fusion serait un autre projet).

---

## 4. API — une seule route

`GET /api/pilotage?periode=7|30|90` — réservée manager/admin. Renvoie :

```json
{
  "periode": 30,
  "kpis": {
    "passages": 0,            // nb passages terrain sur la période
    "affaires": 0,            // nb affaires signalées (created_at dans la période)
    "rdv": 0,                 // passages statut 'rdv'
    "mandats_ventes": 0,      // affaires statut 'mandat' ou 'vente' (updated_at dans la période)
    "taux_transfo": 0         // (rdv + mandats_ventes) / (passages + affaires) * 100, arrondi
  },
  "tendance": [               // par jour (ou semaine si periode=90) : effort dans le temps
    { "date": "2026-05-01", "passages": 0, "affaires": 0 }
  ],
  "parCanal": [               // performance comparée par canal
    { "canal": "boitage",        "effort": 0, "resultats": 0, "taux": 0 },
    { "canal": "porte_a_porte",  "effort": 0, "resultats": 0, "taux": 0 },
    { "canal": "apporteurs",     "effort": 0, "resultats": 0, "taux": 0 }
  ],
  "parAgent": [               // activité par agent
    { "id": 1, "nom": "Dupont Marie", "passages": 0, "rdv": 0, "affaires": 0, "derniere_activite": null }
  ]
}
```

Détail des calculs (SQL d'agrégation, fenêtre = `created_at >= date('now','-{periode} days')`) :
- **passages / rdv** : `COUNT(*)` sur `passages`, filtré période ; `rdv` = `WHERE statut='rdv'`.
- **affaires** : `COUNT(*)` sur `affaires` créées dans la période.
- **mandats_ventes** : `COUNT(*)` sur `affaires` de statut `mandat`/`vente`, `updated_at` dans la période.
- **tendance** : `GROUP BY DATE(created_at)` pour passages et affaires ; granularité jour (7/30) ou
  semaine (90).
- **parCanal** : boitage/porte_a_porte → effort = passages de ce canal, résultats = ceux de statut `rdv` ;
  apporteurs → effort = affaires signalées, résultats = affaires `mandat`/`vente`. taux = résultats/effort.
- **parAgent** : jointure `users` LEFT JOIN passages/affaires, comptes + `MAX(created_at)` comme dernière
  activité ; seulement les utilisateurs de rôle `agent` (+ éventuellement managers actifs).

---

## 5. Écran (1 page « Pilotage »)

Onglet **Pilotage** ajouté à la navigation, **visible seulement manager/admin**. Page avec sélecteur de
période (7/30/90) et 4 blocs :

1. **KPIs** (cartes) : passages, affaires signalées, RDV, mandats+ventes, taux de transformation global.
2. **Tendance** : graphique (Recharts) de l'activité dans le temps (passages + affaires superposés).
3. **Performance par canal** : tableau/barres comparant boîtage / porte-à-porte / apporteurs
   (effort → résultats → taux).
4. **Activité par agent** : tableau (passages, RDV, affaires, dernière activité).

**États vides** : chaque bloc affiche un message clair (« Pas encore d'activité sur cette période »)
quand il n'y a pas de données, au lieu d'un graphique vide.

Charte quai-* + Icon (Lucide), aucun emoji. Couleurs de graphiques reprises de la charte
(navy, gold, variantes).

---

## 6. Découpage de construction (2 paliers)

1. **Palier A — Backend** : route `GET /api/pilotage` + agrégations SQL + test (insérer quelques
   passages/affaires, vérifier les comptes).
2. **Palier B — Frontend** : `recharts` ajouté au client ; navigation (onglet manager) ; page
   `PilotagePage` (KPIs, tendance, canaux, agents) avec états vides.

---

## 7. Réutilisation & cohérence

- Auth/rôles (manager/admin), charte quai-*, Icon, PageHeader, NavTabs (à étendre, masquer l'onglet aux
  agents), api.js — repris.
- **Une dépendance ajoutée** : `recharts` côté client immo-prospect (déjà éprouvée dans ImmoRelances).
- Aucune donnée externe, aucune nouvelle table. Impact base nul (lecture seule).

---

## 8. Hors périmètre (YAGNI)

- Export PDF / Excel du tableau de bord.
- Intégration des données ImmoRelances (base séparée).
- Objectifs / quotas par agent et suivi vs objectif.
- Comparaison entre deux périodes (évolution N vs N-1).
- Coût d'acquisition monétaire par canal (nécessiterait des données de coût non disponibles).

---

## 9. Définition de « terminé »

- [ ] Route `GET /api/pilotage?periode=` renvoie kpis + tendance + parCanal + parAgent, réservée manager/admin.
- [ ] Page Pilotage accessible aux managers/admins (onglet masqué aux agents).
- [ ] Sélecteur 7/30/90 jours recalcule tous les blocs.
- [ ] Les 4 blocs s'affichent, avec états vides soignés quand pas de données.
- [ ] Graphique de tendance (Recharts) fonctionnel.
- [ ] Build + run vérifiés ; charte respectée ; déployé sur Railway.
