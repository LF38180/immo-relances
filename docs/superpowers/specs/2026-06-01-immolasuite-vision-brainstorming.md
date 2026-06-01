# ImmoLaSuite — Vision & brainstorming (session 2026-06-01)

> Document de réflexion. Aucune décision de construction prise — pistes à arbitrer à tête reposée.
> Contexte : on a déjà ImmoRelances + ImmoProspect. Idée d'une SUITE d'apps métier pour les agents
> (complémentaires au CRM Modelo qui gère déjà contacts/biens/affaires/signatures/diffusion).

## Principe directeur de la suite (recommandation stratégique forte)

- **Modelo = système de référence** (vérité contacts/biens/affaires), MAIS **jamais le bus d'intégration**.
- Construire un **socle de données partagé** avec **identité de contact unique** (un contact = un ID partagé
  par toutes les apps), exposé par une API interne devant Modelo. Les apps consomment ce socle, ne se parlent
  jamais en direct → évite l'usine à gaz.
- Viser **4-5 apps réelles**, pas 10. Distinguer "app" et "module".
- **Risque n°1 = bus factor** (tout repose sur un seul dev) : documenter le socle, code+données propriété de
  l'agence, technos standard, envisager d'ACHETER les briques de conformité plutôt que les coder.
- Séquence logique : **socle → couvrir le risque (conformité) → prouver la valeur → enrichir**.

## Cadre légal 2025-2026 (les bornes du jeu — vérifié)

- **Pige / démarchage téléphonique** : loi 2025-594, applicable **11 août 2026**. Passage à un régime de
  CONSENTEMENT PRÉALABLE (opt-in). Sans accord = pas d'appel. Amendes jusqu'à 375 000 € (entreprise). Bloctel fermé.
  → Canal téléphone quasi mort hors base opt-in. Canaux légaux restants : **PHYSIQUE (boîtage/flyer/courrier),
  INBOUND, RELATIONNEL**.
- **Scraping des portails** (Leboncoin/SeLoger/Logic-Immo/Bien'ici/PAP) : ILLÉGAL. Droit sui generis des bases de
  données (art. L342-1 CPI) — l'extraction est interdite **même en usage interne** (la finalité est indifférente),
  et **l'extraction répétée/systématique** est sanctionnée même à faible volume. Jurisprudence récente :
  Leboncoin c/ Jinka (avril 2026) = 200 000 € ; SeLoger c/ Jinka (déc 2025) = 60 000 €. Tous protégés par DataDome
  ou robots.txt agressif. **Bien'ici = ROUGE aussi** (pas plus permissif). Seule zone souple : sites d'AGENCES
  INDIVIDUELLES (base trop petite pour sui generis solide) mais dispersé + RGPD + ne couvre pas les PAP.
  → CONCLUSION : ne pas scraper soi-même. Si besoin du flux d'annonces, passer par un abonnement pige
  (Pige Online ~29€/mois, Yanport) qui porte le risque, et coder seulement la couche d'enrichissement légale.

## Catalogue des apps proposées (3 angles d'experts)

### A. Capter le mandat (cycle vendeur)
- **ImmoEstim** : avis de valeur en 5 min sur comparables DVF réels → capter le mandat au bon prix. (données déjà
  dans ImmoProspect). RÉUTILISE le moteur DVF.
- **ImmoRapport** : book vendeur + page "exclusif vs simple" chiffrée → sceller l'exclusivité. (templating).
- **ImmoVendeur / ImmoPilot** : reporting auto au vendeur (vues, visites, retours) → éviter la perte de mandat à
  mi-parcours (semaines 4-8) et préparer la baisse de prix.
- **ImmoPrice** : débloqueur de mandats sur-évalués (mandat "endormi" → dossier de baisse argumenté par DVF).
- **ImmoRadar** : veille des biens en vente → ÉCARTÉ en build maison (scraping illégal). Possible seulement via
  abonnement pige + couche d'enrichissement. Note : un mandat exclusif est dénonçable après 3 mois d'irrévocabilité
  (préavis 15 j, LRAR — art. 78 décret 72-678) → règle exploitable si on a la donnée légalement.

### B. Vendre (acquéreur + productivité)
- **ImmoMatch** : croise acheteurs ↔ biens (scoring tolérant, classé, expliqué) → le chaînon entre CRM et
  ImmoRelances. Données déjà là.
- **ImmoBriefing** : fiche de RDV 1 page (bien + quartier + profil) hors-ligne → l'agent maîtrise son secteur.
- **ImmoFinance** : qualifie la capacité d'achat réelle + simule PTZ/MaPrimeRénov' → ne plus faire visiter des
  non-finançables ; branche les aides sur les passoires DPE.
- **ImmoTournée** : optimise le PARCOURS DE PROSPECTION (boîtage), pas les visites → extension du module Terrain
  d'ImmoProspect (quick win, peu de risque).
- **ImmoVisite** : capte le retour de visite, déclenche la relance offre.
- **ImmoSecteur** : mémoire-quartier de poche (prix DVF, écoles, transports, risques Géorisques) → ImmoProspect
  "retourné" côté connaissance fine. 80% des données déjà là + écoles/transports/risques en open data.

### C. Conformité & IA
- **ImmoConsent** (PRIORITAIRE conformité) : registre unique de contactabilité (consentement, oppositions/liste
  repoussoir, filtrage Bloctel, traçabilité RGPD + module Hoguet/apporteurs). Dépendance bloquante d'ImmoRelances
  et ImmoProspect. Couvre un risque juridique ACTIF.
- **ImmoPlume** : génération d'annonces/descriptifs depuis les données du bien (IA). Quick win, ROI immédiat,
  faible risque (garde-fous anti-discrimination + anti-invention + validation humaine).
- **ImmoÉcho** : synthèse d'appels → maj score+rappel. ⚠️ Conformité lourde (enregistrement = information préalable
  obligatoire). ALTERNATIVE MALIGNE : version "dictée assistée" (l'agent dicte un résumé 15s, l'IA structure) →
  80% de la valeur, zéro problème juridique, meilleure qualité. À privilégier pour démarrer.

### D. "Trouver des ventes supplémentaires" (brainstorm dédié — le plus aligné avec le besoin exprimé)
Principe : "le gisement le moins cher n'est pas un contact en plus, c'est un contact déjà en main qu'on laisse
filer". Colmater la fuite avant d'ouvrir un nouveau robinet. Moteur central commun = DVF.
- **ImmoConvert** ⭐ (TOP des 2 experts) : relance auto des ESTIMATIONS NON SIGNÉES (séquence J+2/J+10/J+30/J+90/
  J+180). 30-60% des estimations partent à la concurrence → vendeurs chauds déjà gratuits. Meilleur ROI, 0 risque
  légal (données first-party), moteur ImmoRelances déjà là. Quick win immédiat.
- **ImmoValeur** ⭐ : ESTIMATEUR EN LIGNE sur le site (adresse → fourchette DVF → résultat contre contact → rappel
  <5 min, ×9 sur la conversion). Inbound = faire VENIR les vendeurs ; 1er canal de leads vendeurs 2026. Remplace
  la pige interdite. NE JAMAIS donner le résultat sans capter le contact.
- **ImmoSuccession** : signal succession (fichier décès INSEE = open data libre) + réseau notaires. 1er générateur
  de ventes "non choisies". Démarrer en BOÎTAGE DE SECTEUR (légal) ; nominatif = validation avocat (RGPD). Idéal
  branché sur les notaires (qui voient les successions avant l'INSEE).
- **ImmoMûr / ImmoScore** : scoring de maturité "mûrs à vendre" sur les 68k contacts (durée de détention ~7-10 ans
  = pic de revente, âge, événements). Leads prédictifs convertissent 8-15% vs 2-5% froid. Données first-party.
- **ImmoRéseau / ImmoParrain** : systématiser parrainage clients (conversion 20-30%) + réseau prescripteurs
  (notaires/syndics/commerçants/artisans) + avis Google. Canal IMMUNISÉ contre la loi 2025 (recommandation/inbound).
  Le moat le plus durable.
- **ImmoRecycle** : acquéreurs déçus → alertes biens + détection du "bien à vendre pour acheter" (mandat caché).
- **ImmoSignal** : agrégat open data non encore exploité (Sitadel permis = proprio qui construit ailleurs va
  vendre l'ancien ; DVF contagion = voisin qui vend → boîtage ciblé ; LOVAC agrégé). Extension d'ImmoProspect.

## Sélection exprimée par l'utilisateur (à ce stade)
- Intérêt initial : ImmoRadar (recadré : non faisable en scraping maison), ImmoÉcho (version dictée), ImmoTournée
  (parcours de PROSPECTION, pas visites), ImmoSecteur.
- Recadrage final de l'utilisateur : "une app pour TROUVER DES VENTES SUPPLÉMENTAIRES" (légalement). → angle D.
- Décision : CONSIGNER, choisir plus tard. Pas de construction lancée.

## Synergie technique clé
Un seul moteur central — **DVF** (déjà maîtrisé dans ImmoProspect) — sert ImmoEstim, ImmoConvert, ImmoValeur,
ImmoPrice, ImmoQuartier/Secteur. À construire une fois, réutiliser partout.

## Recommandation de séquence (si on lance un jour)
1. ImmoConvert (semaines, ROI immédiat, 0 risque) — colmater la fuite.
2. ImmoValeur (estimateur inbound) — ouvrir le robinet légal.
3. ImmoRéseau/parrainage — le moat durable.
4. ImmoSignal (greffe ImmoProspect) puis ImmoSuccession (après cadrage juridique, via notaires).
En transverse : ImmoConsent (conformité) avant d'industrialiser davantage la relance.
