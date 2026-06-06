# Design — Champs contacts + import auto (ImmoRelances)

> Spec validée le 2026-06-06. Branche `feat/contacts-champs-import`.

## But

Enrichir les contacts d'ImmoRelances avec des champs métier (source, conseiller en
charge, date d'estimation, photo) détectés **automatiquement à l'import** (CSV/Excel/
Numbers), affichés dans la fiche contact et l'écran d'appel. Réutilise le système de
détection auto existant (`guessMapping` / `FIELD_MAP`).

## Champs concernés

| Champ | Colonne DB | État | Type stockage |
|---|---|---|---|
| Source | `source_import` | EXISTE (hardcodé `import_csv`) | TEXT |
| Conseiller en charge | `assigned_to` | EXISTE (FK `users.id`) | INTEGER |
| Date d'estimation | `date_estimation` | NOUVELLE | TEXT (ISO `AAAA-MM-JJ`) |
| Photo | `photo_url` | NOUVELLE | TEXT (URL) |

Le suivi (statut, date_dernier_contact, nombre_tentatives, notes) existe déjà — on
ajoute seulement des alias d'import si besoin, pas de nouvelle colonne.

## 1. Migration DB (`server/src/database.js`)

Pas de bloc de migration idempotente actuellement (tables via `db.exec`, seed après).
Ajouter APRÈS le `db.exec` de création (~ligne 83), AVANT le seed :

```js
const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
if (!cols.includes('date_estimation')) db.exec("ALTER TABLE contacts ADD COLUMN date_estimation TEXT")
if (!cols.includes('photo_url')) db.exec("ALTER TABLE contacts ADD COLUMN photo_url TEXT")
```

Idempotent : ALTER seulement si colonne absente. Pas de migration pour `source_import`
/ `assigned_to` (déjà en place).

## 2. Détection auto à l'import (`client/src/components/ImportModal.jsx`)

Étendre `FIELD_MAP` (alias STANDARD, ajustables si fichier réel fourni plus tard) :

```js
source:          ['source', 'origine', 'provenance'],
conseiller:      ['conseiller', 'agent', 'négociateur', 'negociateur', 'responsable', 'assigné', 'assigne'],
date_estimation: ['date estimation', 'date création', 'date creation', 'date', 'créé le', 'cree le'],
photo_url:       ['photo', 'image', 'url photo', 'lien photo', 'photo_url'],
```

NB : `conseiller` est la CLÉ de mapping côté front (nom lisible). À l'envoi, on transmet
la valeur brute (nom du conseiller) sous la clé `conseiller` ; le back la résout en
`assigned_to`. De même `source` → `source_import` côté back.

Labels lisibles dans l'UI : la grille de mapping et l'aperçu affichent `field` brut en
`capitalize` (ex. "Date_estimation"). Ajouter un dict `FIELD_LABELS` pour des libellés
propres ("Source", "Conseiller en charge", "Date d'estimation", "Photo (URL)").

`doImport` : inclure les nouveaux champs mappés dans l'objet envoyé.

## 3. Back — import (`server/src/routes/contactRoutes.js`, POST `/import` ~ligne 126)

INSERT étendu : ajouter `date_estimation, photo_url, assigned_to` (source_import déjà
listé mais à dé-hardcoder).

Logique par ligne :
- **source_import** : valeur de la colonne `source` mappée si présente et non vide,
  sinon fallback `'import_csv'`.
- **assigned_to** : résolution NOM → `users.id`.
  - Charger les users actifs une fois (hors boucle).
  - Normaliser (minuscule, sans accents, trim) le nom du fichier et comparer à :
    `prenom nom`, `nom prenom`, `email`.
  - Match → `users.id`. Pas de match (ou colonne vide) → `null` ; incrémenter un
    compteur `conseillers_non_reconnus` (set des noms uniques non résolus).
- **date_estimation** : normaliser → ISO `AAAA-MM-JJ`. Gérer :
  - série Excel (nombre, ex. 45000) → date,
  - `jj/mm/aaaa` ou `jj-mm-aaaa`,
  - ISO `aaaa-mm-jj` (déjà bon).
  - Illisible → garder la chaîne brute + incrémenter `dates_ignorees`.

Résultat enrichi : `{ importes, erreurs, conseillers_non_reconnus, dates_ignorees }`.
Le front (step 3) affiche ces compteurs additionnels s'ils sont > 0.

## 4. Back — update (`contactRoutes.js`, PUT `/:id` ~ligne 94)

Étendre la liste `CHAMPS` : `+ 'source_import', 'assigned_to', 'date_estimation', 'photo_url'`.

## 5. Back — lecture (`contactRoutes.js`, GET `/` et GET `/:id`)

Actuellement `SELECT *` → renvoie déjà les nouveaux champs. Pour afficher le NOM du
conseiller sans fetch séparé, ajouter un `LEFT JOIN users u ON u.id = contacts.assigned_to`
renvoyant `u.nom AS assigned_nom, u.prenom AS assigned_prenom`. Join trivial (FK indexée
sur PK users). Le GET liste (68k) reste acceptable (join sur PK).

## 6. Affichage

### ContactModal.jsx (~lignes 13-17 state, 96-136 form)
Ajouter au form state + 4 champs :
- **source** (`source_import`) : input texte.
- **conseiller** (`assigned_to`) : `<select>` peuplé via `GET /api/admin/users`
  (liste id + nom + prenom). Option vide = non attribué.
- **date_estimation** : `<input type="date">` (valeur ISO en base, l'input HTML gère
  l'affichage local). Affichage lecture seule en `JJ/MM/AAAA`.
- **photo_url** : input URL + vignette d'aperçu (si valeur).

### SessionPage.jsx (~lignes 145-200, bloc fiche contact)
Ajouter dans la fiche du contact courant :
- **Source** : texte (si présent).
- **Conseiller** : `assigned_prenom assigned_nom` (du join), sinon rien.
- **Date d'estimation** : `JJ/MM/AAAA` (formatée depuis ISO).
- **Photo** : vignette cliquable (ouvre l'URL en grand). `onError` → remplacer par lien
  texte "Voir la photo". Robuste aux URL mortes.

Helper d'affichage date partagé : `AAAA-MM-JJ` → `JJ/MM/AAAA` (et inverse à la saisie).
AUCUN emoji (règle stricte). Icônes Lucide via `components/ui/Icon.jsx`.

## 7. Tests (`server/test/`)

Nouveau `contacts-import.test.js` (style `node ... .test.js`, imprime `... OK`) :
- migration applique `date_estimation` + `photo_url` (idempotent : 2e run sans erreur).
- résolution conseiller : match `prenom nom`, match `nom prenom`, match email,
  no-match → null + compté.
- normalisation date : série Excel, `jj/mm/aaaa`, ISO → ISO ; illisible → brut + compté.
- source : colonne présente → valeur ; absente → `import_csv`.
- PUT accepte les 4 champs.

## Hors scope (YAGNI)

- Pas d'upload de photo (URL/lien uniquement).
- Pas de création d'utilisateur conseiller manquant (laisser vide + signaler).
- Pas de refonte de l'UI mapping (juste libellés propres).
- Alias d'import = STANDARD ; ajustés si un fichier réel est fourni ensuite.
