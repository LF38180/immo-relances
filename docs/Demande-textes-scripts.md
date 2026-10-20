# Demande — le texte des 4 scripts d'appel

À coller dans la discussion qui a produit les scripts.

---

## Pourquoi je redemande

Les quatre PDF sont des **images** : aucun texte n'en est extractible. Le
fichier HTML est une page empaquetée en JavaScript, illisible elle aussi par un
programme.

Je peux afficher les PDF tels quels — c'est prévu — mais deux choses s'y
perdent :

**Le prénom de l'ancien conseiller.** Un PDF est statique : il ne peut pas
substituer `{prenom_a_dire}`. Or ce champ est renseigné sur **341 fiches**,
exactement celles des scripts 3 et 4, où l'ouverture en dépend :
*« je reprends les dossiers qui étaient suivis par Charlotte »*. Sans lui,
l'agent reste vague au moment précis où l'appel se gagne.

**La lisibilité au téléphone.** Un PDF demande de zoomer entre deux phrases.
L'agent appelle debout, souvent sur mobile.

---

## Ce qu'il me faut

Tu avais fait une **mise en page par arborescence** — c'est exactement la bonne
forme pour l'écran d'appel, et c'est elle que je veux reproduire. Donne-la-moi
en texte structuré plutôt qu'en image.

### Si le script est un arbre de décision

Le format qui se code directement :

```markdown
## SCRIPT 3 — Dossier repris · courrier reçu

### Ouverture
> Bonjour, {civilite} {nom} ? ... (texte exact, mot pour mot)

**Il répond oui** → Étape 2
**Ce n'est pas la bonne personne** → Issue : erreur d'identité
**Il est pressé** → « Je rappelle quand ? » → Issue : à rappeler

### 2. Pourquoi j'appelle
> (texte exact)

**Il se souvient** → Étape 3
**Il ne se souvient pas** → « C'était {prenom_a_dire} qui suivait votre
  dossier » → Étape 3
```

Autrement dit : à chaque étape, **le texte à dire**, puis **les branches**
selon ce que répond le client, et où chacune mène.

### Les variables

Entre accolades, avec exactement ces noms — ce sont les colonnes du fichier :

`{civilite}` · `{nom}` · `{prenom}` · `{commune}` · `{bien_concerne}` ·
`{prenom_a_dire}` · `{conseiller}`

**Attention :** l'année de la vente n'est pas une colonne du fichier. Si les
scripts la prononcent, dis-le — il faudra l'ajouter à l'export, ou reformuler.

### Les objections

Si l'arborescence les traite déjà, parfait. Sinon, donne-les à part :
« je n'ai besoin de rien », « je ne me souviens pas de vous »,
« comment avez-vous eu mon numéro ? », « rappelez-moi plus tard ».

Elles s'afficheront dans un volet dépliable à côté du script.

---

## Les quatre scripts, pour mémoire

| SCRIPT 1 | Son client · courrier reçu | 513 fiches |
| SCRIPT 2 | Son client · courrier **non envoyé** | 234 |
| SCRIPT 3 | Dossier repris · courrier reçu | 216 |
| SCRIPT 4 | Dossier repris · courrier **non envoyé** | 125 |

**Une précision qui change l'ouverture des scripts 2 et 4 :** les 307 fiches
« objectif adresse » ne sont pas des courriers revenus. Les plis sont partis la
semaine dernière et les NPAI mettront des semaines à nous parvenir. Ce sont des
personnes à qui **on a renoncé à écrire** — 261 dont l'adresse était fausse,
46 dont l'identité n'était pas établie. L'agent n'appelle donc pas après un
échec d'envoi : il appelle quelqu'un à qui on n'a jamais écrit.

Si les textes actuels disent « le courrier vous est revenu » ou équivalent, il
faut les reformuler.

---

## En attendant

L'écran affiche le PDF, avec à côté un bloc toujours visible : le numéro de
script, le nom du client, **le prénom à dire** (scripts 3 et 4 seulement), le
bien concerné, et une ligne de contexte sur l'état du courrier.

Ça fonctionne pour démarrer le 26. L'arborescence en texte le rendra
utilisable d'une main, dans la rue.
