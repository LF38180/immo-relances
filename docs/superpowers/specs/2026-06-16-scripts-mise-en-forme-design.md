# Scripts d'appel avec mise en forme (gras / italique / souligné)

Date : 2026-06-16
Statut : design validé

## Objectif

Permettre aux managers et admins de mettre en forme le texte des scripts
d'appel (gras, italique, souligné), et afficher ce formatage à tous les
utilisateurs, y compris les agents en session.

## Contexte existant

- Une seule page `client/src/pages/ScriptsPage.jsx` gère à la fois l'édition
  (formulaire, réservé manager + admin) et l'affichage (tous rôles).
- Édition actuelle : `<textarea>` texte brut (ScriptsPage.jsx:86).
- Affichage actuel : `{script.contenu}` dans une div `whitespace-pre-wrap`
  bordée de doré (ScriptsPage.jsx:148-149).
- Stockage : table `scripts`, colonne `contenu TEXT NOT NULL` (database.js:61-65).
- Droits : routes `scriptRoutes` POST/PUT/DELETE en `requireRole('manager', 'admin')` ;
  côté UI `canEdit = ['manager','admin'].includes(user?.role)` (ScriptsPage.jsx:19).
- DOMPurify est déjà présent dans le bundle (chunk `purify.es`).

## Décisions

- Éditeur : **WYSIWYG `contentEditable` maison** + `document.execCommand`.
  Aucune nouvelle dépendance.
- Droits d'édition : **inchangés** (manager + admin éditent, tous voient).
- Migration : **aucune**. Rétrocompatibilité gérée à l'affichage.
- Périmètre du formatage : **gras, italique, souligné uniquement** (G / I / U).

## Architecture

### 1. Stockage

- Colonne `scripts.contenu TEXT` **inchangée**.
- Stocke désormais du HTML pour les scripts formatés : balises autorisées
  `b, strong, i, em, u, br, div, p`.
- Anciens scripts (texte brut multi-lignes) restent stockés tels quels.
- Aucune migration de base.

### 2. Édition — composant `RichTextEditor`

Nouveau composant isolé `client/src/components/RichTextEditor.jsx`.

- **Props** : `value` (HTML string), `onChange(html)`, optionnel `rows`/hauteur min.
- **Barre d'outils** : 3 boutons G / I / U.
  - Icônes Lucide : `bold`, `italic`, `underline`.
  - Charte navy/doré, cohérente avec les boutons existants.
  - Zone tactile ≥ 44px (touch target).
  - `aria-label` sur chaque bouton (Gras / Italique / Souligné).
  - `type="button"` pour ne pas soumettre le formulaire.
- **Zone d'édition** : div `contentEditable`, stylée comme `.input` actuel
  (fond, bordure, focus). Hauteur min ≈ équivalent `rows={8}`.
- **Actions** : `onMouseDown` (preventDefault pour garder la sélection) puis
  `document.execCommand('bold' | 'italic' | 'underline')`.
- **État actif** : `document.queryCommandState(...)` met en surbrillance le
  bouton quand le curseur est dans du texte formaté (mise à jour sur
  selectionchange / keyup / mouseup dans la zone).
- **Remontée valeur** : sur `input`, lit `innerHTML` et appelle `onChange`.
- **Sanitize à la saisie/sauvegarde** : avant remontée finale (au save),
  `DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b','strong','i','em','u','br','div','p'], ALLOWED_ATTR: [] })`.
- **Lazy-load** : importé via `React.lazy` / dynamic import, chargé seulement
  quand le formulaire d'édition s'ouvre, pour ne pas alourdir le bundle initial.

### 3. Affichage — helper `renderScriptContenu`

Petit helper de rendu (dans `ScriptsPage.jsx` ou un util dédié).

- **Détection** : le contenu contient-il une balise HTML connue ?
  (test simple : présence de `<b`, `<strong`, `<i`, `<em`, `<u`, `<br`, `<div`, `<p`).
- **Si HTML** : `dangerouslySetInnerHTML` avec contenu passé par
  `DOMPurify.sanitize` (même whitelist qu'à l'édition). Defense in depth :
  on sanitize aussi à l'affichage, pas seulement à la sauvegarde.
- **Si texte brut** (ancien script) : rendu actuel inchangé, div
  `whitespace-pre-wrap`.
- La div conserve son style actuel (fond `quai-light`, bordure `quai-gold`).

### 4. Sécurité

- DOMPurify avec whitelist stricte : seulement G/I/U + sauts/paragraphes.
- Interdits : `<script>`, `<a>`, attributs `on*`, `style` inline, `class`,
  `src`, `href`, etc.
- Empêche toute injection XSS via le contenu d'un script (même si un éditeur
  malveillant tentait d'envoyer du HTML arbitraire à l'API).

## Découpage

| Unité | Rôle | Dépend de |
|-------|------|-----------|
| `RichTextEditor.jsx` | Éditeur visuel (barre + zone contentEditable) | DOMPurify, Icon |
| `renderScriptContenu` | Rendu sécurisé / rétrocompat à l'affichage | DOMPurify |
| `ScriptsPage.jsx` | Intègre l'éditeur (form) et le helper (ScriptCard) | les 2 ci-dessus |

Reste de ScriptsPage inchangé : catégories, ordre, droits, CRUD, suppression.
Routes serveur et schéma DB inchangés.

## Tests (garde-fous)

- **Test node serveur** (`server/test/`) : POST puis PUT d'un script avec
  contenu HTML (`<b>`, `<i>`, `<u>`) → relire via GET → contenu conservé
  intact.
- **Vérif navigateur live** (preview, port 5180) :
  1. Ouvrir Scripts d'appel en manager/admin, éditer un script, sélectionner
     du texte, cliquer G → texte en gras dans l'éditeur.
  2. Sauvegarder → le rendu de la carte affiche bien le gras.
  3. Vérifier qu'un ancien script (texte brut) s'affiche toujours
     correctement (sauts de ligne préservés).

## Hors scope (YAGNI)

Listes, titres, couleurs, liens, tailles de police, alignement, images.
Uniquement gras / italique / souligné.
