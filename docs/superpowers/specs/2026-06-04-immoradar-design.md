# Module ImmoRadar — Spec de conception

> Projet : **ImmoProspect** (`/Users/loickferrucci/Desktop/immo-prospect/`)
> Date : 2026-06-04 · Statut : conception validée, prêt pour plan d'implémentation

## 1. Objectif

Ajouter un 6e onglet **« Radar »** qui suit les **biens mis en vente en Isère** (particuliers + agences),
les affiche sur carte + liste filtrable avec un **suivi dans le temps** (nouveautés, baisses de prix, retraits,
ancienneté, délai théorique de dénonciation des exclusifs), et permet de les envoyer en **cibles de boîtage**
dans le module Terrain. But métier : repérer les opportunités de mandat et aller les travailler **en physique**
(toquer / flyer — canal légal, la pige téléphonique étant restreinte).

## 2. Contrainte fondatrice : indépendance totale du fournisseur

L'app ne connaît JAMAIS le fournisseur de flux. Architecture en **3 couches étanches** :

1. **Adaptateur** (le seul morceau qui connaît le fournisseur) : appelle l'API externe, traduit SON format vers
   NOTRE format normalisé. Aujourd'hui `fluximmo-adapter.js`. Demain : un autre adaptateur, même sortie → on change
   d'adaptateur, pas l'app.
2. **Moteur ImmoRadar** (100 % à nous, ignore le fournisseur) : stockage, détection des évolutions, calculs métier,
   croisement avec le socle ImmoProspect.
3. **Affichage** : onglet Radar (carte + liste + filtres) + pont vers Terrain.

### Format normalisé d'annonce (ce que l'app manipule, indépendant de toute source)
```
{ ref_source, source (leboncoin/seloger/pap/agence…), type_vendeur (particulier|agence|reseau),
  nom_vendeur, siren_vendeur, type_bien (maison|appartement|programme|immeuble|autre),
  prix, surface, pieces, lat, lon, code_insee, commune, code_postal, adresse_texte,
  url, titre, description, photos[], date_premiere_pub, date_derniere_vue, en_ligne }
```

### Cadre juridique (rappel — pourquoi cette architecture)
- Scraper soi-même les portails = ILLÉGAL (droit sui generis, même usage interne). L'agence ne doit JAMAIS être
  l'extracteur. On consomme une API tierce via contrat : le fournisseur porte le risque d'extraction.
- Canal d'action = PHYSIQUE (boîtage/flyer), légal. Pas de démarchage téléphonique sur ces données.
- RGPD : ne pas constituer de fichier de coordonnées de particuliers pour démarchage. On stocke l'adresse/le bien
  pour aller en physique, pas le téléphone du vendeur pour l'appeler.

### API Fluximmo — validée en réel (clé d'essai testée le 2026-06-04)
- Endpoint : `POST https://api.fluximmo.io/v2/protected/adverts/search`, header `x-api-key`.
- Filtres confirmés : `location.department` (38), `offer.type` (OFFER_BUY), `isPro` (true=pro / false=particulier),
  `type` (CLASS_FLAT/CLASS_HOUSE/…), `isOnline`, `currentPrice` min/max, `firstSeenAt` plage. Pagination via
  `searchAfterHash`.
- Champs retournés (vérifiés) : `currentPrice.value`, `habitation.surface.total`, `habitation.roomCount`, `type`,
  `isPro`, `seller.type` (SELLER_TYPE_AGENCY / SELLER_TYPE_NETWORK / SELLER_TYPE_UNKNOWN), `seller.name`,
  `seller.siren`, `location.city/inseeCode/postalCode/locationCoordinate.location` (lon,lat), `source.url/website`,
  `firstSeenAt`, `lastSeenAt`, `isOnline`, `medias.images[]`, `title`, `description`.

## 3. Le moteur de suivi (cœur "radar")

Le script de synchro appelle l'API (Isère, ventes, en ligne) page par page, et compare avec la base :

| Cas | Détection | Effet |
|---|---|---|
| Annonce jamais vue | `ref_source` absente | INSERT + marqueur "nouveau" |
| Annonce déjà connue | présente | UPDATE `date_derniere_vue` (+ champs si changés) |
| Prix changé | prix ≠ dernier connu | INSERT dans `radar_prix_historique` + maj prix |
| Plus renvoyée par l'API | était en_ligne, absente de la réponse complète | `en_ligne = 0` ("retirée/vendue") |

**Calculs dérivés :**
- **Ancienneté** = `today - date_premiere_pub` (jours).
- **Délai de dénonciation théorique** = `date_premiere_pub + 105 jours` (3 mois irrévocabilité + 15 j préavis,
  art. 78 décret 72-678). Affiché pour les annonces d'AGENCE. NUANCE ASSUMÉE : l'API ne dit pas si un mandat est
  exclusif ou simple → on n'affirme rien sur le type de mandat ; on affiche l'ancienneté + la date théorique de
  dénonciation *si c'était un exclusif*, l'agent juge. Un bien d'agence en ligne depuis 4 mois est un signal en soi.

**Détection des retraits** : le retrait n'est fiable que si la sync parcourt la totalité des annonces Isère
(sinon une annonce absente d'une page ≠ retirée). Le sync charge donc TOUT le périmètre Isère/vente/en-ligne, puis
marque `en_ligne=0` toute annonce connue non revue lors de cette passe complète.

**Déclenchement** : script `npm run radar:sync`, lancé manuellement (planifiable plus tard). Pas de temps réel au V1.

## 4. Stockage (3 tables)

```sql
radar_annonces (
  ref_source TEXT, source TEXT, type_vendeur TEXT, nom_vendeur TEXT, siren_vendeur TEXT,
  type_bien TEXT, prix REAL, surface REAL, pieces INTEGER,
  lat REAL, lon REAL, code_insee TEXT, commune TEXT, code_postal TEXT, adresse_texte TEXT,
  url TEXT, titre TEXT, description TEXT, photos TEXT,            -- photos = JSON array d'URLs
  date_premiere_pub TEXT, date_derniere_vue TEXT, en_ligne INTEGER DEFAULT 1,
  nouveau INTEGER DEFAULT 1, score_potentiel_commune INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (ref_source, source)
)
radar_prix_historique ( ref_source TEXT, source TEXT, prix REAL, date TEXT )
-- + ligne 'radar' dans sources_data (fraîcheur = date de dernière sync)
```

`score_potentiel_commune` : croisé depuis `commune_potentiel.score` via le code INSEE, au moment de la sync.

## 5. API interne

- `GET /api/radar` — liste filtrable (carte + tableau). Filtres : type_vendeur, code_insee/commune, type_bien,
  prix min/max, ancienneté min (jours), statut (nouveau / baisse / dénonçable / en ligne). `?light=1` sans
  description/photos pour la liste.
- `GET /api/radar/:source/:ref` — détail d'un bien (description, photos, historique de prix).
- Route protégée par `requireAuth`, pattern copié sur `potentielRoutes.js`. Montée dans `index.js`.

## 6. Frontend

- **`RadarPage.jsx`** : layout carte + liste (comme TerrainPage). Filtres en haut.
- **`CarteRadar.jsx`** : carte Leaflet, 1 marqueur par bien, couleur selon type_vendeur (particulier / agence /
  réseau). Tooltip au survol, clic → panneau détail.
- **`RadarPanel.jsx`** : détail d'un bien (titre, prix + historique, surface, vendeur, ancienneté, date de
  dénonciation, score potentiel de la commune, lien annonce, photos). Bouton **« Prospecter ce secteur »** →
  crée/ouvre le secteur de boîtage autour de l'adresse dans Terrain (réutilise le mécanisme du pont Ciblage→Terrain :
  POST /secteurs avec l'IRIS de l'adresse, puis onOpenSecteur).
- Liste/tableau : type_bien, prix (flèche si baisse), surface, commune, vendeur, ancienneté, date dénonciation,
  badges (nouveau / baisse), lien annonce.
- Onglet « Radar » ajouté dans `AppHeader` (icône Lucide ex. 'radar' ou 'satellite-dish'). Charte quai-navy/
  quai-gold, icônes Lucide, AUCUN emoji (marqueurs = pastilles de couleur ou icônes Lucide).
- Responsive mobile (barre d'onglets basse + bottom sheet, comme les autres vues).

## 7. Sécurité & configuration

- Clé API dans variable d'environnement **`FLUXIMMO_API_KEY`** (jamais en dur). En dev : un fichier non committé /
  variable shell. En prod (Railway) : variable d'environnement.
- L'app fonctionne SANS clé en mode dégradé : affiche les annonces déjà stockées ; la sync échoue proprement avec
  un message clair (pas de crash).
- La clé d'essai actuelle est temporaire (1 semaine) → à remplacer par une clé pérenne pour la prod.

## 8. Vérification

- **Adaptateur** : mappe correctement le format Fluximmo → format normalisé (test sur un échantillon réel/fixture).
- **Moteur** : détecte nouveauté (insert), baisse de prix (historique), retrait (en_ligne=0) sur un jeu de test
  simulant 2 passes successives.
- **API** : liste filtrée (par vendeur, commune, ancienneté), détail, 404 sur ref inexistante, tri.
- **Live navigateur** (pas seulement DOM) : onglet rend, carte affiche les biens, filtres fonctionnent, panneau
  détail s'ouvre AU-DESSUS de la carte (z-index), bouton « Prospecter ce secteur » crée le secteur et ouvre Terrain.
- Non-régression : la suite de tests existante passe ; build client OK.

## 9. Hors périmètre (V1)

- Pas de synchro temps réel / webhooks (sync manuelle au V1 ; planification possible plus tard).
- Pas de détection automatique du type de mandat (exclusif vs simple) — l'API ne le fournit pas.
- Pas de stockage des coordonnées personnelles du vendeur pour démarchage (RGPD) — on garde l'adresse du bien.
- Pas de scraping maison — uniquement consommation d'une API tierce via l'adaptateur.
