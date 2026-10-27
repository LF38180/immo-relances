# Module « Opération anciens clients » — ce qui a été construit

**Le Quai de l'Immobilier · 20 octobre 2026 · en production**

Récapitulatif à destination de la discussion qui a cadré l'opération.
Tout ce qui suit est déployé et vérifié en production, sauf mention contraire.

---

## 1 · Tes décisions, et ce qu'elles sont devenues dans le code

### Les quatre objectifs

Ton arbitrage — quatre objectifs au même niveau plutôt qu'un principal et trois
secondaires — est appliqué partout.

| À l'écran | Ce qui est compté |
|---|---|
| Estimations calées | `actualisation = ACCEPTEE` |
| Soirée | `soiree = 1` |
| Panneaux | `panneau = 1` |
| Fiches à jour | adresse, statut, projet, « toujours propriétaire » **ou** confirmation explicite |

Le vocabulaire suit ta règle : « estimation » sur les tableaux de bord,
« actualisation » dans les textes prononcés.

### L'adresse redescendue

Tout ce que tu avais listé a été fait : la section s'appelle **« Mise à jour de
la fiche »** et contient aussi le statut, le projet et l'échéance ; le badge est
devenu **« courrier non envoyé »** ; l'encadré doré et le contexte « objectif
premier » ont disparu ; le tri par objectif adresse est supprimé, la file est
alphabétique.

La ligne grise que tu proposais est là, affichée seulement quand l'adresse n'est
pas fiable : *« Sa fiche porte l'adresse du bien qu'il a vendu — il n'y habite
plus. »*

### Les 46 fiches à vérifier

Sorties de la file, comme tu le demandais. Un écran les présente avec
`partie_au_registre` en regard du nom, pour trancher à l'œil. Deux issues :
confirmée — elle rejoint la file ; écartée — opposition posée et tracée.

### La page d'accueil

Deux lignes, comme proposé. Avancement : contacts · restent à appeler ·
**personnes jointes**. Puis les quatre objectifs, même taille, même poids.

### L'issue « a suivi son ancien conseiller »

Retirée, sur décision de Loïck. Conséquence assumée : sur 341 dossiers repris,
personne ne saura combien de clients sont partis avec leur conseiller. L'agent
le note en texte libre.

---

## 2 · Ce qui a été construit

**Neuf écrans** : accueil (« Repères »), session d'appel enchaînée, écran
d'appel, récapitulatif modifiable, répartition des orphelines, pilotage,
vérification d'identité, saisie des NPAI, aide contextuelle.

**Le parcours d'appel** reprend le fonctionnement éprouvé de la session de
relance existante : un contact plein écran, on appelle, on note, « Enregistrer
et suivant » affiche le suivant. Pas de retour à une liste entre deux appels.

**Les scripts** s'affichent en PDF, avec un en-tête permanent qui porte ce
qu'un PDF ne peut pas substituer : le numéro de script, le nom, **le prénom de
l'ancien conseiller** (341 fiches), le bien et le contexte du courrier.

**L'aide** reprend ton arborescence : dix objections avec la réponse mot pour
mot, les quatre objectifs, la lecture de la liste, les règles. Une FAQ plutôt
qu'une IA — sur une objection il faut la phrase validée, pas une improvisation.

**La saisie d'adresse** interroge l'API Adresse de l'État : on tape « 65 avenue
de Claix », on choisit, code postal et commune se remplissent.

**Un bouton « tout est déjà bon »** quand rien n'a changé : c'est une
information, pas une absence d'information, et elle compte comme fiche à jour.

---

## 3 · Les données

Les trois fichiers ont été importés et vérifiés : 1 088 contacts, zéro rejet,
191 exclus en liste noire. Tous les contrôles du contrat passent — 729/52/261/46
sur `courrier_etat`, 513/234/216/125 sur `script`, 725 + 363, et les quatre
drapeaux (46 à vérifier, 22 à corriger, 11 stop téléphone, 38 stop mail).

**15 comptes conseillers** créés depuis les adresses du fichier. Les comptes
existants n'ont jamais été touchés : rôle et mot de passe préservés.

Les colonnes `bien_type` / `bien_voie` / `bien_commune` sont intégrées, et le
bien se dit : « l'appartement du 15 Rue Olympe de Gouges ».

---

## 4 · Les accès

| | Voit | Ne voit pas |
|---|---|---|
| Un conseiller | sa liste, ses résultats | tout le reste |
| Gilles, manager Saint-Égrève | ses 6 conseillers, 267 fiches, ses 63 appels | les 821 de Meylan, les comptes |
| Jérémy, manager | les 16 conseillers, les 340 à répartir, ses 51 appels | les comptes |
| Loïck, admin | tout | — |

Marine conserve son espace courtage, Chrystelle ses relances : un écran de choix
s'ajoute **avant**, sans rien modifier à leur écran de travail.

---

## 5 · Les règles d'appel

Décision de Loïck : **l'application avertit, elle ne bloque pas**. Les
conseillers sont des professionnels qui répondent du cadre légal.

Ce que le code garde : chaque appel hors cadre — hors plage, au-delà de quatre
par mois, vers une personne opposée — est horodaté avec son motif. Le journal
des oppositions est en écriture seule, conservé trois ans. Le consentement
recueilli pendant l'appel est daté automatiquement.

---

## 6 · Ce qu'une table ronde a corrigé

Cinq relectures ont été menées — un conseiller débutant, une conseillère de
douze ans, un manager, le président, un ancien client rappelé. Les défauts
qu'ils ont trouvés sont corrigés :

**La saisie était jetée** si l'appel n'aboutissait pas. « Rappelez-moi jeudi,
mais notez ma nouvelle adresse » perdait tout, y compris le consentement,
pendant qu'un message vert affichait « Enregistré ». Le message dit désormais
ce qui est parti.

**Les heures étaient fausses de deux heures** : un rappel calé à 13h était
présenté comme dû dès 11h.

**Un résultat écrasait l'autre** sur un contact appelé plusieurs fois.

**Le point d'attention et l'historique** n'apparaissaient pas pendant l'appel,
alors qu'ils étaient déjà chargés.

**Deux fuites d'accès** : un manager pouvait administrer les comptes, et voyait
les fiches des deux agences.

**Le cache hors ligne** resservait indéfiniment des versions périmées.

La conseillère expérimentée avait chiffré la saisie à 67 secondes par appel,
pour un plafond tenable de 60. Les corrections, les raccourcis clavier et les
sections dépliées par défaut ramènent sous ce seuil.

---

## 7 · Ce qui reste

**Avant le 26** — à faire depuis l'administration : répartir les 340 orphelines
(l'écran les groupe par ancien conseiller et propose un attributaire), et
trancher les 46 identités incertaines (une demi-heure).

**Pendant l'opération** : les NPAI se saisissent au fil des retours.

**Avant le 15 novembre** : l'export vers Modelo par fiche, la liste des inscrits
à la soirée avec le nombre de couverts, et un écran de bilan.

---

## 8 · Deux questions pour toi

**Le panneau et les acquéreurs.** 557 des 1 088 ont acheté, pas vendu. Un ancien
client consulté sur le sujet l'a dit sans détour : « je n'ai pas vendu, j'ai
acheté — le panneau raconte votre affaire, pas la mienne ». Faut-il adapter la
proposition, ou la retirer pour eux ?

**Le vocabulaire interne/client.** Le même client a relevé : « vous avez écrit
que le mot estimation me ferait penser à un mandat, donc vous savez très bien
que c'est ce que c'est, et vous avez choisi le mot qui ne me le dit pas ». La
règle est appliquée telle que tu l'as posée ; la remarque est transmise sans
jugement.
