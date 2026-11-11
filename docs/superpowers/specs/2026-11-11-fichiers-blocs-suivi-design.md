# Fichiers (« blocs »), corbeille et suivi sur période libre

Date : 11 novembre 2026. Demande de Loïck : audit avec les experts, puis
préparer l'arrivée de « Madame Fichier Acquéreurs », celle des agents avec leur
base découpée en blocs, et un suivi sur la durée qu'on veut. Sans toucher à
l'opération anciens clients, et sans aucune perte de données.

## Ce qui ne bouge pas

- Module opération anciens clients : `opRoutes.js`, tables `op_*`,
  `client/src/pages/operation/*`. Aucune ligne modifiée.
- Espace courtage de Marine : `courtageRoutes.js`, `CourtagePage.jsx`. Aucune
  ligne modifiée.
- Session d'appels de Chrystelle (`SessionPage.jsx`) : deux gardes invisibles
  seulement (raccourcis clavier ignorés quand une fenêtre est ouverte ; message
  si la file ne se charge pas).

## Le modèle

Une ligne de `contacts` = une personne dans UN fichier, avec son état de
travail (statut, prochain rappel, tentatives). La même personne dans deux
fichiers = deux lignes. Options écartées : une table par fichier (duplique
routes et écrans), une table d'appartenance contact ↔ fichier (oblige à
déplacer statut et rappel, donc à réécrire le cœur).

- `blocs` : id, code, libellé, `proprietaire_id` (NULL = fichier d'agence, sinon
  base personnelle d'un agent), `parent_id` (sous-bloc), `agence`, deux délais
  propres, `champs` (JSON des champs propres), `libelles_issues`, `actif`.
- `bloc_acces(bloc_id, user_id)` : qui travaille sur un fichier d'agence.
- `contacts.bloc_id` (défaut 1), `contacts.extra` (JSON des champs propres),
  `relances.bloc_id` (le fichier au moment de l'appel), `scripts.bloc_id`.
- Le fichier 1 « Fichier Estimés » reçoit tout l'existant. Les comptes « agent »
  présents à la migration y ont accès ; un compte créé ensuite n'a accès à rien
  tant que l'admin ne coche pas un fichier.

Règle unique côté serveur (`server/src/blocs.js`, `blocsVisibles`) : admin =
tous ; manager = ceux de son agence et ceux sans agence ; agent = ceux qu'on lui
a ouverts + ceux dont il est propriétaire ; courtage et conseiller = aucun.
Toutes les routes du cœur l'appliquent.

## Protection des données

- Corbeille : `contacts.supprime_le`, `supprime_par`. Supprimer une fiche la
  masque, ses appels restent. `DELETE /contacts/all` exige la confirmation côté
  serveur, écrit une sauvegarde avant, et envoie à la corbeille.
  `GET /contacts/corbeille`, `POST /contacts/corbeille/restaurer` (admin).
- `contacts.version` : la fenêtre de fiche renvoie tout le contact ; si la
  version a changé (un appel a été enregistré entre-temps), statut, prochain
  rappel et attribution ne sont pas réécrits.
- `POST /relances` : transaction, et même résultat renvoyé dans la minute = même
  appel.
- `contact_evenements` : changements faits à la main (statut, attribution,
  fichier, suppression, restauration), à partir du 11/11/2026.
- Rôles « courtage » et « conseiller » exclus des routes contacts et relances.
- `PUT /admin/parametres` : admin seulement, l'écran n'envoie que ce qui a
  changé, les clés `session_cloturee_*` ne s'écrivent pas par là.
- Copie de la base avant la première migration : `<base>.avant-blocs-2026-11-11`.

## Suivi sur période libre

`GET /relances/stats` : `debut` / `fin` (jours de Paris, bornes incluses),
`depuis_debut=1`, `agent_id`, `bloc_id`, `format=csv`. Regroupement par jour
jusqu'à 62 jours, par semaine jusqu'à 370, par mois au-delà. Totaux : appels,
appels aboutis, personnes appelées, personnes jointes, projets ; même période
précédente ; par personne (manager, admin) ; rappels promis en retard ; fiches
jamais appelées. Un agent ne voit que lui. Les champs d'origine sont conservés.

Écrans : `ChoixPeriode` dans le tableau de bord (à la place du menu 7/30/90) et
dans Supervision (section « Suivi », par personne, export).

## Ce qui reste à décider avec Loïck

1. Madame Acquéreurs : champs propres (budget, secteur, type de bien,
   financement), cadence, résultats d'appel et scripts. La structure est prête
   (`blocs.champs`, `contacts.extra`, `libelles_issues`, `scripts.bloc_id`) ;
   aucun écran ne les affiche encore.
2. Base par agent : un agent crée-t-il ses blocs seul ? Que voit le manager
   (fiches ou chiffres seulement) ? Que deviennent les blocs d'un agent qui part ?
3. À qui est un contact présent chez deux agents.
4. Règles de sortie (plafond de « pas de réponse », « ne plus appeler ») : elles
   touchent la session de Chrystelle.
5. Nettoyage des écrans du cœur (tableau de bord, contacts, réglages) : les
   experts sont d'accord, mais ce sont des écrans que Chrystelle voit.
