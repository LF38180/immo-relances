# Spec — Refonte charte graphique & UX — ImmoRelances (Le Quai de l'Immobilier)

**Date :** 2026-05-29
**Type :** Revue complète + corrections sur application existante
**Périmètre :** Front (charte + UX + accessibilité) + Backend (sécurité + bugs métier)

---

## 1. Contexte

L'application `immo-relances` existe déjà et **fonctionne** (Express + SQLite + React/Vite/Tailwind,
build OK, login OK, DB seedée). Le backend est solide. Le problème central est **l'incohérence
visuelle** : la charte graphique du Quai de l'Immobilier est *définie* (`tailwind.config.js`,
`constants.js`) mais *appliquée partiellement* — certaines pages (Login, Dashboard) la respectent,
d'autres (Session, Contacts, Supervision, Admin, Scripts, modales) utilisent des couleurs Tailwind
génériques. Des emojis sont utilisés comme icônes partout, ce qui est interdit par le cahier des charges.

### Charte officielle (confirmée)
- **Couleurs** : `quai-navy #0D0D2B` (marine), `quai-gold #C9A96E` (or/accent), `quai-light #F7F6F3`
  (crème), `quai-border #E2DDD6`, `quai-text #1C1C1C`, `quai-muted #6B6660`. Variantes navy/gold présentes.
- **Typo** : Playfair Display (titres/display, serif élégant) + Montserrat (corps, sans).
- **Style** : sobre, élégant, professionnel, « agence haut de gamme ».
- **Logo** : `https://img.netty.fr/logo/company55382byt/2/logo_web.png` (blanc, conçu pour fond marine).
- **Baseline** : « Le symbole d'un départ, d'une rencontre, d'une destination ».

---

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Périmètre | Revue complète + corrections (front **et** backend) |
| Structure du travail | **Design system d'abord**, puis migration des pages |
| Librairie d'icônes | **lucide-react** (ajout dépendance client) |
| Ampleur visuelle | **Refonte visuelle poussée** (premium) en plus de l'harmonisation |
| Aperçus | Pas de captures ; vérification build + run, test par l'utilisateur ensuite |
| Langue | 100 % français (inchangé) |

---

## 3. Audit — problèmes identifiés

### 🔴 Critique
1. **Emojis comme icônes** dans 11 fichiers (nav, session, boutons, KPIs…). Interdit par le cahier des charges.
2. **Charte non appliquée** : `blue-*`/`gray-*`/`green-*`/`indigo-*` au lieu de `quai-*` (Session, Contacts, Supervision, Admin, Scripts, ContactModal, ImportModal).
3. **Caractères pseudo-icônes** `▲▼◀▶←→×★☆` (chevrons, fermeture modale, pagination, étoiles).
4. **Accessibilité** : boutons icône sans `aria-label`, fermeture modale non labellisée, toasts sans `aria-live`, contrastes `text-gray-400` souvent < 4.5:1.

### 🟠 Important
5. **Modales non accessibles** : pas de fermeture `Échap`, pas de focus trap, pas de `role="dialog"`.
6. **`confirm()` natif** pour suppressions (contacts, scripts).
7. **PotentielStars** : étoiles non labellisées, contraste faible.
8. **Toolbar Contacts non responsive** ; rendu mobile/PWA à fiabiliser.
9. **Sécurité backend** : fallback `JWT_SECRET` en dur ; rôle non validé à la création d'utilisateur ; un manager peut créer un admin.
10. **Bugs métier** : `PUT /contacts/:id` utilise `COALESCE` partout → impossible d'effacer un champ ; import n'accepte pas `statut`/`prochain_contact`.

### 🟡 Mineur / polish
- Toasts gris (`#1f2937`) hors charte.
- États de chargement = simple texte « Chargement… » (pas de squelette).
- `ScoreBadge`/`PotentielStars` en couleurs génériques.
- Pas de `prefers-reduced-motion`.

---

## 4. Conception de la solution

### Section A — Socle « design system » (nouveau dossier `client/src/components/ui/`)

- **`Icon.jsx`** — wrapper unique sur `lucide-react`. Tailles par tokens (`sm`=16, `md`=20, `lg`=24),
  stroke `1.75` cohérent. `aria-hidden` par défaut ; `aria-label` + `role="img"` si l'icône porte du sens seule.
- **`Modal.jsx`** — modale accessible réutilisable : `role="dialog"`, `aria-modal="true"`, titre lié via
  `aria-labelledby`, fermeture **Échap**, **focus trap**, focus restauré à la fermeture, scrim `bg-black/50`,
  bouton fermer `aria-label="Fermer"`. Respecte `prefers-reduced-motion` pour l'animation d'entrée.
- **`ConfirmDialog.jsx`** — remplace `confirm()`. Action destructive en rouge sémantique, séparée
  visuellement de l'action d'annulation. Construit sur `Modal`.
- **`Stars.jsx`** — potentiel 1–5 accessible : `aria-label="Potentiel : N sur 5"`, couleur charte (`quai-gold`).
- **`Skeleton.jsx`** — placeholder shimmer pour les états de chargement > ~300 ms.
- **`Badge`** — conservé via classes CSS, mais palette harmonisée charte.

### Tokens / fichiers transverses
- **`index.css`** : ajouter `.btn-ghost`, fiabiliser focus (`focus-visible`), états disabled ; classes
  utilitaires de carte premium (en-tête de page, séparateurs or). Garder Playfair pour les titres de page.
- **`constants.js`** : remplacer la propriété `icon` (emoji) de `STATUTS_RELANCE` par un nom d'icône Lucide.
  Harmoniser les couleurs de badges sur la charte tout en gardant la sémantique (rouge=urgent/refus,
  vert=succès, ambre=en attente).
- **`App.jsx`** : toasts re-stylés en charte (fond navy, succès vert sobre, erreur rouge sobre),
  `aria-live` géré par react-hot-toast (vérifier le rôle).

### Section B — Migration des pages (refonte premium + charte + a11y)

Pour **chaque** page et composant :
- Emojis & pseudo-icônes → `<Icon name="…">`.
- Couleurs génériques → tokens `quai-*`.
- `aria-label` sur tout bouton icône ; ordre de focus logique ; focus visibles.
- Contrastes : `text-gray-400` → `text-quai-muted` (≥ 4.5:1 sur fond clair).
- En-têtes de page premium (titre Playfair + filet or + sous-titre).

Pages concernées : `Layout` (nav latérale Lucide + état actif charté), `LoginPage` (polish premium,
déjà proche), `DashboardPage` (KPIs sans emoji, graphes déjà chartés), `SessionPage` (cœur : numéro en
grand sur fond navy clair charté, boutons statut iconographiés, raccourcis clavier conservés),
`ContactsPage` (toolbar responsive, table soignée), `SupervisionPage` (cartes agents chartées,
auto-refresh conservé), `AdminPage` (onglets chartés), `ScriptsPage` (cartes chartées, `ConfirmDialog`).
Composants : `ContactModal` & `ImportModal` (refondues sur `Modal`), `ContactBadge` (utilise `Stars`).

### Section C — Backend (correctifs)
- **`auth.js`** : en `NODE_ENV=production`, exiger `JWT_SECRET` (sinon refus de démarrage explicite) ;
  fallback uniquement en développement.
- **`adminRoutes.js`** : valider `role ∈ {agent, manager, admin}` à la création et à la mise à jour ;
  interdire à un `manager` de créer/promouvoir un `admin` (réservé `admin`). Conserver les routes existantes.
- **`contactRoutes.js`** :
  - `PUT /:id` : distinguer « champ non fourni » (ne pas toucher) de « champ vidé » (mettre à NULL/'').
    Implémentation : ne mettre à jour que les clés présentes dans le body.
  - `POST /import` : accepter `statut` et `prochain_contact` optionnels si fournis par le mapping ;
    recalcul de score conservé.

### Section D — Vérification (definition of done)
1. `npm --prefix client run build` réussit sans erreur.
2. Serveur lancé en `NODE_ENV=production` : login OK (admin/manager/agent), pages se chargent.
3. `grep -rP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' client/src` = **aucun résultat** (zéro emoji).
4. `grep` des couleurs génériques (`blue-`, `gray-`, `green-`, `indigo-`, `purple-`) ≈ nul dans les
   pages (hors cas sémantiques justifiés et documentés).
5. Modales : fermeture Échap + focus trap vérifiés.
6. Parcours fonctionnel : enregistrer une relance recalcule le score et met à jour le statut.

---

## 5. Hors périmètre (YAGNI)
- Pas de routeur (l'app utilise un state `page` ; on conserve). Le cahier des charges mentionne le
  deep-linking : **noté comme amélioration future**, non bloquant pour cette intervention.
- Pas de tests automatisés ajoutés (aucun harnais existant) — vérification manuelle + build.
- Pas d'intégration CRM Modelo (export/import CSV déjà présents et suffisants pour le futur pont).
- Pas de refonte de la logique de scoring (conforme et validée).

---

## 6. Risques & mitigations
- **Régression visuelle** sur pages déjà correctes (Login/Dashboard) → migration incrémentale, build à chaque étape.
- **Refonte premium trop ambitieuse** → on garde les structures de mise en page existantes comme base,
  l'effort premium porte sur en-têtes, espacements, cartes, iconographie — pas sur une refonte d'architecture UI.
- **`better-sqlite3`** recompilé pour Node 24 (déjà installé et fonctionnel) → ne pas réinstaller inutilement.
