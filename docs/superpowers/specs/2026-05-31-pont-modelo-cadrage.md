# Pont ImmoProspect → CRM Modelo — Note de cadrage

> Date : 2026-05-31 · Statut : cadrage (pas d'implémentation — bloqué sur l'accès API Septeo)
> Objet : comment / pourquoi / gain d'une intégration entre ImmoProspect (prospection) et Modelo (CRM/transaction).

## 1. Le constat technique (recherche du 2026-05-31)

- **Modelo = suite CRM immobilier de Septeo** (consolidation des ex-Netty et Rodacom). Modelo Office = CRM
  transaction + mandats + diffusion portails ; Modelo InTouch = marketing client.
- **Pas d'API publique documentée.** La documentation technique n'est pas publique ; Septeo traite les
  intégrations « au cas par cas ». Un autre produit Septeo (Preventimmo) expose une API publique
  « pour éviter la double saisie » — preuve que Septeo *fait* de l'intégration, mais sur demande, pas en self-service.
- **Conséquence : le pont démarre par une démarche commerciale/technique auprès de Septeo**, pas par du code.
  Première action = demander à Septeo l'accès à l'API Modelo (webservice / REST), la doc, et les conditions
  (coût, périmètre, authentification).

## 2. Pourquoi ce pont (la valeur)

Convergence des avis stratégie + opérationnel (consultation produit 2026-05-31) :

- **Supprimer la double saisie** : aujourd'hui un contact rencontré en terrain (champs `contact_*` déjà
  présents sur la table `passages`) devrait être re-saisi dans Modelo. La double saisie est le **frein n°1
  à l'adoption** : les agents finiront par ne saisir que dans Modelo (l'outil qui « paie » : mandats, compromis).
- **Une seule source de vérité par donnée** : ImmoProspect = référentiel du CIBLAGE et du TERRAIN (où prospecter,
  statuts de passage) ; Modelo = référentiel du CONTACT et de la TRANSACTION (fiche client, mandat, vente).
- **Tracer le consentement au bon endroit** : le moment de bascule (contact qualifié) est aussi le moment où
  le consentement RGPD doit être enregistré — d'où l'intérêt de matérialiser ce moment par une action explicite.

## 3. Le flux cible (conception)

**Règle d'or : un contact ne se saisit qu'une fois. Flux UNIDIRECTIONNEL ImmoProspect → Modelo d'abord**
(le plus simple, le plus robuste ; bidirectionnel plus tard seulement si besoin avéré).

```
ImmoProspect (terrain)                          Modelo (CRM)
─────────────────────                          ─────────────
Passage de prospection
  statut: rdv / intéressé
  + contact_nom/prenom/tel/email
  + consentement (case datée)
        │
        │  [bouton "Envoyer vers Modelo"]
        │  (déclenché à la 1re donnée nominative qualifiée + consentement)
        ▼
   POST API Modelo  ───────────────────────►  Création/MAJ fiche prospect
        │                                      (source = "boîtage ImmoProspect",
        │                                       horodatage consentement)
        ◄─────────────────────────────────────  retour: ID Modelo
   on stocke l'ID Modelo sur le passage
   (ImmoProspect ne garde QUE la référence,
    pas une copie divergente)
```

**Le « moment de bascule »** = première donnée nominative qualifiée + consentement (un propriétaire intéressé
donne nom + tel + accepte d'être recontacté). Avant ça, la donnée reste anonyme/agrégée dans ImmoProspect
(statut d'adresse : « boîté », « absent », « passoire F/G ») — pas de RGPD lourd.

## 4. Ce qu'il faut côté ImmoProspect (préparé / à faire)

- **Déjà préparé** : colonnes `contact_nom`, `contact_prenom`, `contact_telephone`, `contact_email` sur `passages`
  + mention RGPD affichée (cf. session précédente).
- **À ajouter quand l'API sera dispo** :
  - colonne `modelo_id` sur `passages` (référence de la fiche créée côté Modelo, pour ne pas renvoyer 2 fois).
  - un champ `consentement` daté (case à cocher explicite au moment de la saisie du contact).
  - un client API Modelo (`server/src/lib/modelo.js`) : auth + POST contact, gestion des erreurs/retries.
  - un bouton « Envoyer vers Modelo » dans `PassageForm`, visible seulement si contact + consentement présents.
  - idempotence : si `modelo_id` existe déjà, faire un PUT (mise à jour) plutôt qu'un POST (création).

## 5. Le gain attendu

| Sans pont | Avec pont |
|---|---|
| Double saisie terrain → CRM | Saisie unique, bascule en 1 clic |
| Agents abandonnent ImmoProspect | Adoption : l'outil terrain alimente le CRM |
| Contacts désynchronisés (2 vérités) | 1 source de vérité par donnée |
| Consentement RGPD non tracé | Consentement horodaté au moment de la bascule |
| Pilotage sur données partielles | Pilotage fiable (le terrain remonte vraiment) |

## 6. Risques / points de vigilance

- **Dépendance à Septeo** : sans API ouverte, le pont dépend de leur bon vouloir et de leurs conditions
  (coût, SLA, évolutions). À négocier avant d'investir du dev.
- **RGPD** : le pont déverse des données nominatives dans Modelo → la chaîne collecte (information sur place,
  base légale, durée, opposition/Bloctel) doit être conforme AVANT (cf. avis COO). Ne pas industrialiser une
  collecte non conforme.
- **Sens unique d'abord** : éviter le bidirectionnel tant qu'il n'est pas indispensable (complexité de
  synchronisation, conflits de version).

## 7. Prochaines étapes (ordre)

1. **Contacter Septeo** : demander l'accès API Modelo (webservice/REST), la doc, l'authentification, le coût.
2. À réception de la doc : écrire la spec technique précise du client `modelo.js` + le mapping des champs
   (passage ImmoProspect → fiche prospect Modelo).
3. Implémenter le flux unidirectionnel + le bouton + la traçabilité consentement, en TDD.
4. Tester sur un compte Modelo de recette avant prod.

> En résumé : le pont Modelo est **prêt côté conception et côté préparation ImmoProspect**, mais **bloqué sur
> l'accès à l'API Septeo**. C'est une démarche à initier auprès de l'éditeur — le code viendra après.
