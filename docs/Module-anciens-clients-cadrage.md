# Module « Opération anciens clients » — cadrage

**20 octobre 2026 · à valider avant développement**

Source : réponses du 20 octobre + `Suivi_Appels_Anciens_Clients_V6_20_OCTOBRE_2026.xlsx`.
Les chiffres ci-dessous ont été **recomptés dans le fichier**, pas repris du document.

---

## Ce que disent les données

| Vérification | Résultat |
|---|---|
| Contacts | **1 088** — dont 725 attribués, 363 orphelins |
| Identifiants Modelo | 1 088 uniques, **aucun doublon** |
| Scripts | 513 / 234 / 216 / 125 — conforme |
| Rôles | 507 vendeurs · 557 acquéreurs · 24 indéterminés |
| Stop téléphone | **11**, à bloquer |
| Courrier | 729 envoyés · 261 à appeler · 52 non imprimés · 46 à trancher |
| Sans aucun téléphone | **39** |
| Sans adresse mail | **43** |
| Orphelins déjà attribués | **5 sur 363** — 358 restent à répartir |

Tout concorde avec le document. Les données sont importables en l'état.

### Deux points relevés à la lecture

**Cindy Bertrand** a un classeur dans le dossier par agent, mais c'est une
**ancienne conseillère** (24 fiches « suivi avant par »), pas une participante.
Elle ne doit pas recevoir de compte. À confirmer.

**10 des 11 « stop téléphone » ont un numéro renseigné.** Le blocage ne peut donc
pas reposer sur l'absence de numéro : il faut un verrou explicite.

---

## Les six contraintes qui structurent le module

Ce sont elles qui commandent, pas les écrans.

### 1. Trois blocages durs, pas des avertissements

| Règle | Comportement |
|---|---|
| Horaires légaux | 10h–13h et 14h–20h, lundi au vendredi, hors fériés. **Hors plage : bouton d'appel désactivé.** |
| Plafond mensuel | 4 appels par personne et par mois, tous motifs. **Au 4e : fiche retirée de la file.** |
| Stop téléphone | 11 contacts. **Jamais appelables, jamais affichés dans une file.** |

Ces trois règles sont vérifiées **côté serveur**, pas seulement à l'écran : une
interface peut être contournée, une route non.

### 2. L'identifiant Modelo est la clé

Conservé tel quel, présent partout, exporté partout. C'est lui qui permettra de
réinjecter les 359 adresses recueillies et les stops téléphone dans Modelo.
Sans lui, l'opération produit des données qui meurent dans l'application.

### 3. Le script est une donnée, pas un calcul

Les quatre scripts sont déjà déterminés dans le fichier. Le module les importe
et affiche le bon, avec le champ `Prénom à dire` pour les scripts 3 et 4.
Il ne les recalcule jamais.

### 4. Traçabilité du retrait, trois ans

Un refus ferme crée une ligne horodatée et inaltérable. Conservation trois ans,
export à la demande de la personne. Obligation du décret du 23 juillet 2026.

### 5. Attribution nominative, modifiable

Chacun voit sa liste et elle seule. Le manager voit tout. L'attribution se
change à tout moment, y compris en masse pour les 358 orphelins restants.

### 6. Alerte double appel

Un bandeau sur la fiche si la personne a été appelée récemment depuis un autre
module. Lecture seule, aucune modification des données de Chrystelle ou Marine.

---

## Ce qui ne bouge pas

Les écrans de Chrystelle (session de relance) et de Marine (espace courtage)
**ne sont pas modifiés**. Le module se construit à côté : tables préfixées
`op_*`, routes dédiées, exactement comme l'espace courtage.

### L'aiguillage à la connexion

| Personne | Ce qu'elle voit |
|---|---|
| Marine | Écran de choix : « Mon espace courtage » / « Opération anciens clients » |
| Chrystelle | Une entrée de plus dans son menu existant |
| Les 13 autres conseillers | Directement l'opération — ils n'ont rien d'autre |
| Toi et Jérémy | L'opération, plus le pilotage consolidé |

Marine est le seul cas délicat : elle n'a aujourd'hui aucune navigation. Son
écran de travail reste identique ; seul s'ajoute l'écran de choix **avant**.

---

## L'écran d'appel

Il suit les cinq étapes du script plutôt qu'un formulaire à plat.

1. **Ouverture** — identité, civilité, `Prénom à dire`, script affiché
2. **Pourquoi j'appelle** — le bien concerné, la date de la vente
3. **Prendre des nouvelles** — adresse à confirmer, toujours propriétaire, projet
4. **Les trois propositions** — actualisation de valeur, soirée du 3 décembre, panneau
5. **Clôture** — issue de l'appel, rendez-vous posé, envois déclenchés

Les neuf issues : joint · répondeur · faux numéro · pas de réponse · à rappeler
avec créneau · refus ferme · erreur d'identité · a suivi son ancien conseiller ·
décédé.

Le champ libre porte la mention « faits uniquement — le client peut demander à
lire sa fiche ».

---

## Le pilotage

Le matin, en un écran : appels d'hier et par qui · rendez-vous obtenus ·
adresses mises à jour · reste à appeler par conseiller · les rappels du jour ·
les refus de la veille.

Indicateur principal : **actualisations de valeur calées**. Secondaires :
adresses récupérées, inscriptions à la soirée. Pas de compteur de mandats.

Export Excel pour la réunion du lundi.

---

## Ce que je propose de ne pas faire en première version

**L'envoi automatique des mails** (point 5.2). C'est le seul élément qui sort de
l'application : serveur d'envoi, pièce jointe, désinscription, traçabilité.
Je préfère livrer d'abord le module d'appel complet — c'est lui qui bloque le
démarrage du 26 octobre — et traiter les envois juste après, pendant que
l'opération tourne.

En attendant : un bouton qui ouvre le mail pré-rempli dans la messagerie de
l'agent, avec le texte et la pièce jointe. Un clic de plus, zéro risque.

Dis-moi si tu préfères l'inverse.

---

## Ce qu'il me faut pour démarrer

1. **La liste des comptes à créer** : les 15 conseillers avec leur adresse mail
   professionnelle. Lilas, Nolan, Yasmina, Chrystelle, Marine en ont déjà une
   côté prospection — même adresse ?
2. **Confirmation pour Cindy Bertrand** : ancienne conseillère, donc pas de compte ?
3. **Le PDF du courrier du président** et le modèle de mail, pour les préparer.
4. **Un accès manager en production**, ou la confirmation que je crée les comptes
   à l'import.

Le reste, je l'ai.
