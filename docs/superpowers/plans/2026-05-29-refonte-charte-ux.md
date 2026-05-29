# Refonte charte graphique & UX — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer parfaitement la charte graphique du Quai de l'Immobilier (marine/or, Playfair/Montserrat, icônes Lucide) sur toute l'application, corriger l'accessibilité et l'ergonomie, et durcir le backend (sécurité + bugs métier).

**Architecture :** Design system d'abord — créer un socle de composants UI réutilisables (`Icon`, `Modal`, `ConfirmDialog`, `Stars`, `Skeleton`) sous `client/src/components/ui/`, puis migrer chaque page dessus. Backend : correctifs ciblés sans changer l'architecture. L'app garde sa navigation par state (`page`), pas de routeur.

**Tech Stack :** React 18 + Vite + TailwindCSS, lucide-react (nouveau), Express + better-sqlite3 + JWT/bcrypt, Recharts, react-hot-toast.

**Vérification (pas de harnais de tests front existant) :** backend testé par scripts Node/curl réels ; front vérifié par `npm run build` + lancement serveur prod + `grep` (zéro emoji, zéro couleur générique résiduelle) + contrôle de comportement. Commits fréquents.

---

## Convention de couleurs sémantiques (référence pour toutes les tâches)

La charte garde une sémantique fonctionnelle, exprimée via la palette charte + un petit jeu de couleurs d'état autorisées (cf. cahier des charges : la couleur fonctionnelle est permise, mais jamais seule — toujours doublée d'une icône/texte).

| Usage | Avant (générique) | Après |
|-------|-------------------|-------|
| Primaire / structure | `blue-*`, `indigo-*` | `quai-navy` (+ variantes `navymd`/`navylt`) |
| Accent / sélection | `blue-500` | `quai-gold` |
| Fond / surface | `gray-50`, `white` | `quai-light`, `white` + `border-quai-border` |
| Texte secondaire | `text-gray-400/500` | `text-quai-muted` |
| Succès (RDV, contacté) | `green-*`, `emerald-*` | `emerald-600/700` + icône (autorisé, sémantique) |
| Urgence / refus | `red-*` | `red-600` + icône (autorisé, sémantique) |
| En attente / rappel | `amber/orange/yellow` | `amber-600` + icône (autorisé, sémantique) |

Les couleurs d'état (emerald/red/amber) restent **uniquement** pour le sens fonctionnel (statuts, scores), jamais comme couleur de marque.

## Mapping emoji → icône Lucide (référence)

| Emoji actuel | Contexte | Icône Lucide (`name`) |
|--------------|----------|------------------------|
| 📊 | nav Tableau de bord | `layout-dashboard` |
| 📞 ☎️ | nav Session / téléphone | `phone` |
| 👥 | nav Contacts / total | `users` |
| 📝 | nav Scripts / script | `file-text` |
| 👁 | nav Supervision | `eye` |
| ⚙️ | nav Admin / params | `settings` |
| 🚪 | Déconnexion | `log-out` |
| ▲ ▼ | accordéon | `chevron-up` / `chevron-down` |
| ◀ ▶ | collapse sidebar | `chevron-left` / `chevron-right` |
| ← → | pagination / suivant | `arrow-left` / `arrow-right` |
| × ✕ | fermer modale / supprimer | `x` |
| 📵 | sans réponse | `phone-off` |
| 📨 | message laissé | `voicemail` |
| ✅ | contacté / contact | `check` / `phone-call` |
| 🎉 🏆 | RDV obtenu / session finie | `party-popper` / `trophy` |
| ❌ | pas intéressé | `x-circle` |
| 📅 | rappel planifié / prochain | `calendar-clock` |
| ✉️ | email | `mail` |
| 📌 | notes | `pin` |
| 📥 📤 | import / export | `upload` / `download` |
| 🔄 | actualiser | `refresh-cw` |
| 📄 | fichier | `file` |
| 🗑 | supprimer | `trash-2` |
| ★ ☆ | potentiel | `star` (rempli/contour via `fill`) |

---

## File Structure

**Créés :**
- `client/src/components/ui/Icon.jsx` — wrapper Lucide unique (tailles, stroke, a11y)
- `client/src/components/ui/Modal.jsx` — modale accessible (role/aria/Échap/focus trap)
- `client/src/components/ui/ConfirmDialog.jsx` — confirmation destructive chartée
- `client/src/components/ui/Stars.jsx` — potentiel accessible
- `client/src/components/ui/Skeleton.jsx` — placeholder de chargement
- `client/src/components/ui/PageHeader.jsx` — en-tête de page premium (titre Playfair + filet or)

**Modifiés (front) :**
- `client/package.json` — ajout `lucide-react`
- `client/src/utils/constants.js` — `icon` Lucide au lieu d'emoji ; couleurs chartées
- `client/src/index.css` — `.btn-ghost`, focus-visible, carte premium, reduced-motion
- `client/src/App.jsx` — toasts chartés
- `client/src/components/Layout.jsx` — nav Lucide, état actif charté
- `client/src/components/ContactBadge.jsx` — `Stars`, couleurs chartées
- `client/src/components/ContactModal.jsx` — refonte sur `Modal` + `ConfirmDialog`
- `client/src/components/ImportModal.jsx` — refonte sur `Modal`
- `client/src/pages/LoginPage.jsx` — polish premium
- `client/src/pages/DashboardPage.jsx` — KPIs sans emoji, `PageHeader`
- `client/src/pages/SessionPage.jsx` — refonte premium, icônes, charte
- `client/src/pages/ContactsPage.jsx` — toolbar responsive, charte
- `client/src/pages/SupervisionPage.jsx` — cartes chartées
- `client/src/pages/AdminPage.jsx` — onglets/badges chartés
- `client/src/pages/ScriptsPage.jsx` — cartes chartées + `ConfirmDialog`

**Modifiés (backend) :**
- `server/src/auth.js` — JWT_SECRET obligatoire en prod
- `server/src/routes/adminRoutes.js` — validation rôle + garde manager/admin
- `server/src/routes/contactRoutes.js` — PUT partiel correct + import statut/prochain_contact

---

## Phase 0 — Préparation

### Task 0 : Installer lucide-react & créer une branche

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Créer une branche de travail**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git checkout -b refonte-charte-ux
```

- [ ] **Step 2: Installer lucide-react côté client**

```bash
npm --prefix client install lucide-react
```

Expected: `added 1 package` (ou similaire), pas d'erreur.

- [ ] **Step 3: Vérifier que le build passe encore (baseline)**

```bash
npm --prefix client run build
```

Expected: build réussit (« built in … »).

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: ajout lucide-react pour icônes SVG"
```

---

## Phase 1 — Backend (correctifs vérifiables en premier)

### Task 1 : JWT_SECRET obligatoire en production

**Files:**
- Modify: `server/src/auth.js`

- [ ] **Step 1: Écrire un test de comportement**

Créer `server/test-jwt.js` :

```js
// Vérifie qu'en production sans JWT_SECRET, le module refuse de charger.
const { execFileSync } = require('child_process');
function run(env) {
  try {
    execFileSync('node', ['-e', "require('./server/src/auth.js')"], {
      env: { ...process.env, ...env }, stdio: 'pipe'
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: (e.stderr || '').toString() };
  }
}
const prod = run({ NODE_ENV: 'production', JWT_SECRET: '' });
const dev = run({ NODE_ENV: 'development', JWT_SECRET: '' });
if (prod.ok) { console.error('ECHEC: prod sans secret devrait planter'); process.exit(1); }
if (!prod.msg.includes('JWT_SECRET')) { console.error('ECHEC: message attendu JWT_SECRET, reçu:', prod.msg); process.exit(1); }
if (!dev.ok) { console.error('ECHEC: dev sans secret devrait fonctionner'); process.exit(1); }
console.log('OK: JWT_SECRET obligatoire en prod, toléré en dev');
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node server/test-jwt.js
```

Expected: ECHEC (le code actuel a un fallback en dur, donc prod ne plante pas).

- [ ] **Step 3: Modifier `server/src/auth.js`**

Remplacer les lignes 1-3 :

```js
const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'immo-relances-dev-secret');
if (!SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production. Définissez la variable d\'environnement JWT_SECRET.');
}
```

- [ ] **Step 4: Relancer le test, vérifier qu'il passe**

```bash
node server/test-jwt.js
```

Expected: `OK: JWT_SECRET obligatoire en prod, toléré en dev`

- [ ] **Step 5: Supprimer le test temporaire et commit**

```bash
rm server/test-jwt.js
git add server/src/auth.js
git commit -m "fix(security): JWT_SECRET obligatoire en production"
```

---

### Task 2 : Validation des rôles + garde manager/admin

**Files:**
- Modify: `server/src/routes/adminRoutes.js`

- [ ] **Step 1: Écrire un test d'API**

Créer `server/test-roles.js` :

```js
// Démarre le serveur en mémoire-disque temporaire, teste la création d'utilisateur.
process.env.DB_PATH = require('path').join(require('os').tmpdir(), 'test-roles-' + Date.now() + '.db');
process.env.JWT_SECRET = 'test';
const request = (app, method, url, body, token) => new Promise((resolve) => {
  const http = require('http'); const srv = app.listen(0, () => {
    const port = srv.address().port;
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port, method, path: url, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    }}, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ srv.close(); resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }); }); });
    if (data) req.write(data); req.end();
  });
});
(async () => {
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use('/api/auth', require('./server/src/routes/authRoutes'));
  app.use('/api/admin', require('./server/src/routes/adminRoutes'));
  // login manager (seedé)
  const login = await request(app, 'POST', '/api/auth/login', { email: 'manager@lequai-immobilier.com', password: 'manager123' });
  const mgrToken = login.body.token;
  // manager tente de créer un admin -> doit être refusé (403)
  const r1 = await request(app, 'POST', '/api/admin/users', { nom:'X', prenom:'Y', email:'a'+Date.now()+'@t.fr', password:'x', role:'admin' }, mgrToken);
  if (r1.status !== 403) { console.error('ECHEC: manager créant admin devrait être 403, reçu', r1.status); process.exit(1); }
  // login admin
  const la = await request(app, 'POST', '/api/auth/login', { email: 'admin@lequai-immobilier.com', password: 'admin123' });
  // admin crée avec rôle invalide -> 400
  const r2 = await request(app, 'POST', '/api/admin/users', { nom:'X', prenom:'Y', email:'b'+Date.now()+'@t.fr', password:'x', role:'superuser' }, la.body.token);
  if (r2.status !== 400) { console.error('ECHEC: rôle invalide devrait être 400, reçu', r2.status); process.exit(1); }
  console.log('OK: garde rôles manager/admin + validation rôle');
  process.exit(0);
})();
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node server/test-roles.js
```

Expected: ECHEC (actuellement manager peut créer admin, et rôle non validé).

- [ ] **Step 3: Modifier `server/src/routes/adminRoutes.js`**

Ajouter en haut du fichier (après les `require`) :

```js
const ROLES_VALIDES = ['agent', 'manager', 'admin'];
```

Remplacer la route `POST /users` (lignes ~14-23) :

```js
router.post('/users', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, password, role } = req.body;
  if (!ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (!nom || !prenom || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const result = db.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)')
      .run(nom, prenom, email.toLowerCase(), bcrypt.hashSync(password, 10), role);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});
```

Remplacer la route `PUT /users/:id` (lignes ~25-34) pour valider le rôle s'il est fourni :

```js
router.put('/users/:id', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, role, actif, password } = req.body;
  if (role !== undefined && !ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (password) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  db.prepare(`UPDATE users SET nom = COALESCE(?, nom), prenom = COALESCE(?, prenom),
    email = COALESCE(?, email), role = COALESCE(?, role), actif = COALESCE(?, actif) WHERE id = ?`)
    .run(nom, prenom, email, role, actif, req.params.id);
  res.json({ ok: true });
});
```

Note : `POST /users` est déjà protégé par `requireRole('admin')` — un manager reçoit donc 403, ce qui satisfait le test. La validation de rôle ajoute le 400.

- [ ] **Step 4: Relancer le test, vérifier qu'il passe**

```bash
node server/test-roles.js
```

Expected: `OK: garde rôles manager/admin + validation rôle`

- [ ] **Step 5: Supprimer le test temporaire et commit**

```bash
rm server/test-roles.js
git add server/src/routes/adminRoutes.js
git commit -m "fix(security): valider le rôle et réserver la création d'admin aux admins"
```

---

### Task 3 : PUT contact partiel + import statut/prochain_contact

**Files:**
- Modify: `server/src/routes/contactRoutes.js`

- [ ] **Step 1: Écrire un test d'API**

Créer `server/test-contact-update.js` :

```js
process.env.DB_PATH = require('path').join(require('os').tmpdir(), 'test-cu-' + Date.now() + '.db');
process.env.JWT_SECRET = 'test';
const http = require('http');
const request = (app, method, url, body, token) => new Promise((resolve) => {
  const srv = app.listen(0, () => {
    const port = srv.address().port; const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port, method, path: url, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    }}, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ srv.close(); resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }); }); });
    if (data) req.write(data); req.end();
  });
});
(async () => {
  const express = require('express'); const app = express(); app.use(express.json());
  app.use('/api/auth', require('./server/src/routes/authRoutes'));
  app.use('/api/contacts', require('./server/src/routes/contactRoutes'));
  const la = await request(app, 'POST', '/api/auth/login', { email: 'admin@lequai-immobilier.com', password: 'admin123' });
  const t = la.body.token;
  // créer un contact avec une ville
  const c = await request(app, 'POST', '/api/contacts', { nom:'Test', prenom:'A', ville:'Lyon', notes:'note initiale' }, t);
  const id = c.body.id;
  // PUT en effaçant la ville (ville = '') sans toucher aux notes
  await request(app, 'PUT', '/api/contacts/' + id, { ville: '' }, t);
  const after = await request(app, 'GET', '/api/contacts/' + id, null, t);
  if (after.body.ville !== '' && after.body.ville !== null) { console.error('ECHEC: ville devrait être vidée, reçu', JSON.stringify(after.body.ville)); process.exit(1); }
  if (after.body.notes !== 'note initiale') { console.error('ECHEC: notes ne devaient pas changer, reçu', JSON.stringify(after.body.notes)); process.exit(1); }
  // import avec statut + prochain_contact
  const imp = await request(app, 'POST', '/api/contacts/import', { contacts: [
    { nom:'Imp', prenom:'B', statut:'rappel_planifie', prochain_contact:'2026-12-01' }
  ]}, t);
  if (imp.body.importes !== 1) { console.error('ECHEC import:', JSON.stringify(imp.body)); process.exit(1); }
  console.log('OK: PUT partiel (efface ville, garde notes) + import statut/prochain_contact');
  process.exit(0);
})();
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node server/test-contact-update.js
```

Expected: ECHEC sur la ville (le COALESCE actuel ignore `ville: ''` car la valeur falsy n'est pas distinguée, et `''` est passé tel quel — vérifier ; sinon échec sur import statut non pris en compte).

- [ ] **Step 3: Réécrire la route `PUT /:id` en mise à jour partielle dynamique**

Remplacer la route `PUT /:id` (lignes ~94-118) par :

```js
// Modifier (mise à jour partielle : seules les clés présentes dans le body sont modifiées)
router.put('/:id', (req, res) => {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });

  const CHAMPS = ['nom','prenom','telephone','telephone2','email','adresse','code_postal',
    'ville','categorie','tags','notes','potentiel','statut','prochain_contact'];

  const sets = [];
  const params = [];
  for (const champ of CHAMPS) {
    if (!(champ in req.body)) continue;
    let val = req.body[champ];
    if (champ === 'tags') val = typeof val === 'string' ? val : JSON.stringify(val);
    if (champ === 'prochain_contact') val = val || null;
    sets.push(`${champ} = ?`);
    params.push(val);
  }
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);

  db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  recalculerScore(req.params.id);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Modifier l'import pour accepter statut/prochain_contact**

Remplacer la requête `insert` et la boucle dans `POST /import` (lignes ~131-155) :

```js
  const insert = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, notes, potentiel, statut, prochain_contact, source_import)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import_csv')
  `);

  let importes = 0;
  let erreurs = 0;
  const STATUTS_OK = ['a_contacter','tente_sans_reponse','rappel_planifie','rdv_obtenu','pas_interesse','a_recontacter','inactif'];

  const importMany = db.transaction((rows) => {
    for (const c of rows) {
      if (!c.nom && !c.prenom) { erreurs++; continue; }
      try {
        const statut = STATUTS_OK.includes(c.statut) ? c.statut : 'a_contacter';
        const result = insert.run(
          c.nom || '', c.prenom || '', c.telephone || '', c.telephone2 || '',
          c.email || '', c.adresse || '', c.code_postal || '', c.ville || '',
          c.categorie || 'autre', c.notes || '', parseInt(c.potentiel) || 3,
          statut, c.prochain_contact || null
        );
        recalculerScore(result.lastInsertRowid);
        importes++;
      } catch { erreurs++; }
    }
  });
```

- [ ] **Step 5: Relancer le test, vérifier qu'il passe**

```bash
node server/test-contact-update.js
```

Expected: `OK: PUT partiel (efface ville, garde notes) + import statut/prochain_contact`

- [ ] **Step 6: Supprimer le test et commit**

```bash
rm server/test-contact-update.js
git add server/src/routes/contactRoutes.js
git commit -m "fix(contacts): mise à jour partielle correcte + import statut/prochain_contact"
```

---

## Phase 2 — Socle design system (front)

### Task 4 : Composant Icon (Lucide)

**Files:**
- Create: `client/src/components/ui/Icon.jsx`

- [ ] **Step 1: Créer le composant**

```jsx
import { icons } from 'lucide-react'

const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 }

/**
 * Icône SVG unique pour toute l'app (charte : stroke 1.75 cohérent).
 * @param {string} name - nom Lucide en PascalCase OU kebab-case (ex: "phone-off")
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl' (défaut md)
 * @param {string} label - si fourni, l'icône est annoncée aux lecteurs d'écran ; sinon aria-hidden
 */
export default function Icon({ name, size = 'md', label, className = '', strokeWidth = 1.75, ...rest }) {
  const pascal = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  const LucideIcon = icons[pascal] || icons[name] || icons.Circle
  const px = SIZES[size] || size
  return (
    <LucideIcon
      width={px} height={px} strokeWidth={strokeWidth} className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      {...rest}
    />
  )
}
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/Icon.jsx
git commit -m "feat(ui): composant Icon basé sur lucide-react"
```

---

### Task 5 : Modale accessible

**Files:**
- Create: `client/src/components/ui/Modal.jsx`

- [ ] **Step 1: Créer le composant**

```jsx
import { useEffect, useRef } from 'react'
import Icon from './Icon'

/**
 * Modale accessible : role=dialog, aria-modal, fermeture Échap, focus trap,
 * focus restauré à la fermeture. Respecte prefers-reduced-motion (animation CSS).
 */
export default function Modal({ title, onClose, children, footer, size = 'lg' }) {
  const ref = useRef(null)
  const titleId = useRef('modal-title-' + Math.random().toString(36).slice(2)).current

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const node = ref.current
    // focus initial
    const focusable = () => node.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable()[0]
    first?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'Tab') {
        const els = focusable()
        if (els.length === 0) return
        const firstEl = els[0], lastEl = els[els.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  const maxW = size === 'sm' ? 'max-w-md' : size === 'md' ? 'max-w-lg' : 'max-w-2xl'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-scrim"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} max-h-[90vh] flex flex-col modal-panel`}
      >
        <div className="flex items-center justify-between p-5 border-b border-quai-border">
          <h2 id={titleId} className="text-lg font-display font-semibold text-quai-navy">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-quai-navy">
            <Icon name="x" size="md" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-3 p-5 border-t border-quai-border">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/Modal.jsx
git commit -m "feat(ui): modale accessible (role/aria/Échap/focus trap)"
```

---

### Task 6 : ConfirmDialog, Stars, Skeleton, PageHeader

**Files:**
- Create: `client/src/components/ui/ConfirmDialog.jsx`
- Create: `client/src/components/ui/Stars.jsx`
- Create: `client/src/components/ui/Skeleton.jsx`
- Create: `client/src/components/ui/PageHeader.jsx`

- [ ] **Step 1: Créer `ConfirmDialog.jsx`**

```jsx
import Modal from './Modal'
import Icon from './Icon'

/**
 * Dialogue de confirmation pour actions destructives.
 * danger=true → bouton de confirmation rouge.
 */
export default function ConfirmDialog({ title = 'Confirmer', message, confirmLabel = 'Confirmer', danger = true, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm"
      footer={(
        <>
          <button onClick={onCancel} className="btn-secondary">Annuler</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="flex gap-3">
        {danger && <Icon name="alert-triangle" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />}
        <p className="text-sm text-quai-text">{message}</p>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Créer `Stars.jsx`**

```jsx
import Icon from './Icon'

const LABELS = { 1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Très élevé' }

/** Affiche un potentiel 1-5 sous forme d'étoiles, accessible. */
export default function Stars({ potentiel = 3, size = 'sm' }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Potentiel : ${potentiel} sur 5 (${LABELS[potentiel] || ''})`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon key={i} name="star" size={size}
          className={i <= potentiel ? 'text-quai-gold' : 'text-quai-border'}
          fill={i <= potentiel ? 'currentColor' : 'none'} />
      ))}
    </span>
  )
}
```

- [ ] **Step 3: Créer `Skeleton.jsx`**

```jsx
/** Placeholder de chargement (shimmer sobre charte). */
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-quai-border/50 rounded ${className}`} />
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Créer `PageHeader.jsx`**

```jsx
/** En-tête de page premium : titre Playfair + filet or + actions à droite. */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-display font-semibold text-quai-navy">{title}</h1>
        <div className="mt-1.5 w-10 h-0.5 bg-quai-gold" />
        {subtitle && <p className="text-quai-muted text-sm mt-2">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-3 items-center flex-wrap">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ui/
git commit -m "feat(ui): ConfirmDialog, Stars, Skeleton, PageHeader"
```

---

### Task 7 : Tokens transverses (constants, index.css, toasts)

**Files:**
- Modify: `client/src/utils/constants.js`
- Modify: `client/src/index.css`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Réécrire `STATUTS_RELANCE` dans `constants.js`**

Remplacer le bloc `STATUTS_RELANCE` (lignes ~20-27) — `icon` devient un nom Lucide, couleurs chartées :

```js
export const STATUTS_RELANCE = {
  tente_sans_reponse: { label: 'Pas de réponse',  color: 'bg-amber-50 text-amber-700 border border-amber-200',     icon: 'phone-off' },
  message_laisse:     { label: 'Message laissé',  color: 'bg-amber-50 text-amber-700 border border-amber-200',     icon: 'voicemail' },
  contacte:           { label: 'Contacté',         color: 'bg-sky-50 text-sky-700 border border-sky-200',           icon: 'phone-call' },
  rdv_obtenu:         { label: 'RDV obtenu',       color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: 'calendar-check' },
  pas_interesse:      { label: 'Pas intéressé',   color: 'bg-red-50 text-red-700 border border-red-200',           icon: 'x-circle' },
  rappel_planifie:    { label: 'Rappel planifié',  color: 'bg-orange-50 text-orange-700 border border-orange-200',   icon: 'calendar-clock' },
}
```

- [ ] **Step 2: Enrichir `index.css`**

Ajouter dans `@layer components` (après `.kbd`), et un bloc reduced-motion :

```css
  .btn-ghost { @apply btn bg-transparent text-quai-muted hover:bg-quai-navy/5 hover:text-quai-navy focus:ring-quai-navy/30; }

  /* Carte premium : surface blanche, ombre douce, accent or au survol optionnel */
  .card-premium { @apply bg-white rounded-xl shadow-sm border border-quai-border p-5 transition-shadow hover:shadow-md; }

  /* Animations modale (désactivées si reduced-motion) */
  .modal-panel { animation: modal-in 180ms ease-out; }
  .modal-scrim { animation: fade-in 150ms ease-out; }
```

Ajouter, hors `@layer`, à la fin du fichier :

```css
@keyframes modal-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

/* Focus visible cohérent charte */
:focus-visible { outline: 2px solid #0D0D2B; outline-offset: 2px; }
```

- [ ] **Step 3: Charter les toasts dans `App.jsx`**

Remplacer le bloc `toastOptions` (lignes ~41-45) :

```jsx
      <Toaster position="top-right" toastOptions={{
        style: { borderRadius: '12px', background: '#0D0D2B', color: '#fff', fontSize: '14px' },
        success: { iconTheme: { primary: '#C9A96E', secondary: '#0D0D2B' }, style: { background: '#0D0D2B', color: '#fff' } },
        error: { style: { background: '#7f1d1d', color: '#fff' } },
        duration: 3500,
      }} />
```

- [ ] **Step 4: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/constants.js client/src/index.css client/src/App.jsx
git commit -m "feat(ui): tokens charte — statuts iconographiés, btn-ghost, carte premium, toasts navy, reduced-motion"
```

---

## Phase 3 — Migration des composants partagés

### Task 8 : ContactBadge (Stars + couleurs chartées)

**Files:**
- Modify: `client/src/components/ContactBadge.jsx`

- [ ] **Step 1: Réécrire le fichier**

```jsx
import { CATEGORIES, STATUTS } from '../utils/constants'
import Stars from './ui/Stars'

export function CategorieBadge({ categorie }) {
  const c = CATEGORIES[categorie] || CATEGORIES.autre
  return <span className={`badge ${c.color}`}>{c.label}</span>
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.a_contacter
  return <span className={`badge ${s.color}`}>{s.label}</span>
}

export function ScoreBadge({ score }) {
  // Score élevé = priorité forte (sémantique : navy plein = prioritaire)
  const color = score >= 70
    ? 'bg-quai-navy text-white'
    : score >= 50
      ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40'
      : 'bg-quai-light text-quai-muted border border-quai-border'
  return <span className={`badge ${color} font-bold tabular-nums`}>{score}</span>
}

export function PotentielStars({ potentiel }) {
  return <Stars potentiel={potentiel} />
}
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ContactBadge.jsx
git commit -m "refactor(ui): ContactBadge sur Stars + couleurs chartées"
```

---

### Task 9 : Layout (navigation Lucide)

**Files:**
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Réécrire `NAV_ITEMS` et les icônes**

Remplacer le tableau `NAV_ITEMS` (lignes ~4-11) :

```jsx
const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Tableau de bord', icon: 'layout-dashboard', roles: ['agent', 'manager', 'admin'] },
  { id: 'session',    label: 'Session relance', icon: 'phone',            roles: ['agent', 'manager', 'admin'] },
  { id: 'contacts',   label: 'Contacts',        icon: 'users',            roles: ['agent', 'manager', 'admin'] },
  { id: 'scripts',    label: "Scripts d'appel", icon: 'file-text',        roles: ['agent', 'manager', 'admin'] },
  { id: 'supervision',label: 'Supervision',     icon: 'eye',              roles: ['manager', 'admin'] },
  { id: 'admin',      label: 'Administration',  icon: 'settings',         roles: ['admin'] },
]
```

- [ ] **Step 2: Importer Icon et remplacer les emojis/chevrons**

En haut, ajouter : `import Icon from './ui/Icon'`

Remplacer le bouton collapse (lignes ~37-42) :

```jsx
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="text-white/40 hover:text-white p-1 rounded transition-colors ml-auto focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size="sm" />
          </button>
```

Remplacer l'icône de nav dans le `.map` (ligne ~67) :

```jsx
              <Icon name={item.icon} size="md" className="flex-shrink-0" aria-current={page === item.id ? 'page' : undefined} />
```

Remplacer le bouton déconnexion (lignes ~74-83) :

```jsx
          <button
            onClick={logout}
            aria-label="Déconnexion"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name="log-out" size="md" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
```

- [ ] **Step 3: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Layout.jsx
git commit -m "refactor(ui): navigation latérale sur icônes Lucide + a11y"
```

---

### Task 10 : ContactModal (sur Modal + ConfirmDialog)

**Files:**
- Modify: `client/src/components/ContactModal.jsx`

- [ ] **Step 1: Réécrire le composant sur `Modal`**

Remplacer l'intégralité de `ContactModal.jsx` :

```jsx
import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS, POTENTIEL_LABELS, STATUTS_RELANCE } from '../utils/constants'
import { CategorieBadge, StatutBadge, ScoreBadge } from './ContactBadge'
import Modal from './ui/Modal'
import ConfirmDialog from './ui/ConfirmDialog'
import Icon from './ui/Icon'
import { format } from 'date-fns'

export default function ContactModal({ contact, onClose, onSaved }) {
  const isNew = !contact
  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', telephone2: '', email: '',
    adresse: '', code_postal: '', ville: '', categorie: 'autre',
    notes: '', potentiel: 3, statut: 'a_contacter', prochain_contact: '', tags: '',
  })
  const [relances, setRelances] = useState([])
  const [tab, setTab] = useState('infos')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (contact) {
      const tags = (() => { try { return JSON.parse(contact.tags || '[]').join(', ') } catch { return '' } })()
      setForm({ ...contact, tags, prochain_contact: contact.prochain_contact?.slice(0, 10) || '' })
      api.get(`/relances/contact/${contact.id}`).then(r => setRelances(r.data))
    }
  }, [contact?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nom) { toast.error('Le nom est requis'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: JSON.stringify(form.tags.split(',').map(t => t.trim()).filter(Boolean)),
        prochain_contact: form.prochain_contact || null,
      }
      if (isNew) { await api.post('/contacts', payload); toast.success('Contact créé') }
      else { await api.put(`/contacts/${contact.id}`, payload); toast.success('Contact mis à jour') }
      onSaved()
    } catch { toast.error('Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  const del = async () => {
    setDeleting(true)
    try {
      await api.delete(`/contacts/${contact.id}`)
      toast.success('Contact supprimé')
      onSaved()
    } finally { setDeleting(false); setConfirmDel(false) }
  }

  const footer = (
    <>
      {!isNew ? (
        <button onClick={() => setConfirmDel(true)} disabled={deleting} className="btn-danger btn-sm inline-flex items-center gap-1.5">
          <Icon name="trash-2" size="sm" /> Supprimer
        </button>
      ) : <div />}
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : isNew ? 'Créer' : 'Sauvegarder'}
        </button>
      </div>
    </>
  )

  return (
    <>
      <Modal title={isNew ? 'Nouveau contact' : `${contact.prenom} ${contact.nom}`} onClose={onClose} footer={footer}>
        {!isNew && (
          <div className="flex items-center gap-2 mb-4">
            <CategorieBadge categorie={contact.categorie} />
            <StatutBadge statut={contact.statut} />
            <ScoreBadge score={contact.score_priorite} />
          </div>
        )}
        {!isNew && (
          <div className="flex border-b border-quai-border mb-4 -mt-1">
            {['infos', 'historique'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
                {t === 'infos' ? 'Informations' : `Historique (${relances.length})`}
              </button>
            ))}
          </div>
        )}

        {tab === 'infos' ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prénom" value={form.prenom} onChange={v => set('prenom', v)} autoComplete="given-name" />
            <Field label="Nom *" value={form.nom} onChange={v => set('nom', v)} autoComplete="family-name" />
            <Field label="Téléphone" value={form.telephone} onChange={v => set('telephone', v)} type="tel" autoComplete="tel" />
            <Field label="Téléphone 2" value={form.telephone2} onChange={v => set('telephone2', v)} type="tel" />
            <Field label="Email" value={form.email} onChange={v => set('email', v)} type="email" className="col-span-2" autoComplete="email" />
            <Field label="Adresse" value={form.adresse} onChange={v => set('adresse', v)} className="col-span-2" />
            <Field label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} />
            <Field label="Ville" value={form.ville} onChange={v => set('ville', v)} />
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Catégorie</label>
              <select className="input" value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Statut</label>
              <select className="input" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Potentiel</label>
              <select className="input" value={form.potentiel} onChange={e => set('potentiel', Number(e.target.value))}>
                {Object.entries(POTENTIEL_LABELS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Prochain contact</label>
              <input type="date" className="input" value={form.prochain_contact} onChange={e => set('prochain_contact', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-quai-muted mb-1">Tags (séparés par virgule)</label>
              <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="vendeur, budget 400k, urgent…" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-quai-muted mb-1">Notes</label>
              <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informations sur ce contact…" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {relances.length === 0 && <div className="text-center text-quai-muted py-8">Aucune relance enregistrée</div>}
            {relances.map(r => {
              const s = STATUTS_RELANCE[r.statut] || { label: r.statut, icon: 'circle', color: 'bg-quai-light text-quai-muted' }
              return (
                <div key={r.id} className="flex gap-3 p-3 bg-quai-light rounded-lg border border-quai-border">
                  <Icon name={s.icon} size="md" className="text-quai-navy flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-quai-muted">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      <span className="text-xs text-quai-muted">par {r.agent_prenom} {r.agent_nom}</span>
                    </div>
                    {r.notes && <p className="text-sm text-quai-text">{r.notes}</p>}
                    {r.prochain_contact && (
                      <p className="text-xs text-quai-navy mt-1 inline-flex items-center gap-1">
                        <Icon name="calendar-clock" size="sm" /> Prochain : {format(new Date(r.prochain_contact), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {confirmDel && (
        <ConfirmDialog
          title="Supprimer le contact"
          message={`Voulez-vous vraiment supprimer ${contact.prenom} ${contact.nom} ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={del}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  )
}

function Field({ label, value, onChange, type = 'text', className = '', autoComplete }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-quai-muted mb-1">{label}</label>
      <input type={type} autoComplete={autoComplete} className="input" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ContactModal.jsx
git commit -m "refactor(ui): ContactModal sur Modal accessible + ConfirmDialog + charte"
```

---

### Task 11 : ImportModal (sur Modal)

**Files:**
- Modify: `client/src/components/ImportModal.jsx`

- [ ] **Step 1: Adapter ImportModal à `Modal`**

Remplacer l'import en tête : ajouter `import Modal from './ui/Modal'` et `import Icon from './ui/Icon'`.

Remplacer tout le `return (...)` (lignes ~107-217) par une structure utilisant `Modal`. Le contenu des 3 étapes est conservé, mais les emojis (📄 📊 ✅) deviennent des `Icon`, les couleurs `blue/gray` deviennent chartées, et le wrapper/scrim/header est fourni par `Modal` :

```jsx
  const footer = (
    <>
      <button onClick={onClose} className="btn-secondary">Fermer</button>
      {step === 2 && (
        <button onClick={doImport} disabled={importing} className="btn-primary">
          {importing ? 'Import en cours…' : `Importer ${rows.length.toLocaleString('fr')} contacts`}
        </button>
      )}
      {step === 3 && <button onClick={onImported} className="btn-primary">Terminer</button>}
    </>
  )

  return (
    <Modal title="Import de contacts" onClose={onClose} footer={footer}>
      {step === 1 && (
        <div className="text-center py-8">
          <Icon name="file-up" size="xl" className="text-quai-navy mx-auto mb-4" />
          <h3 className="text-lg font-display font-medium text-quai-navy mb-2">Sélectionnez votre fichier</h3>
          <p className="text-sm text-quai-muted mb-2">Formats acceptés :</p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {['.xlsx', '.xls', '.csv', '.ods', '.tsv'].map(f => (
              <span key={f} className="badge bg-quai-navy/10 text-quai-navy border border-quai-navy/20 text-xs font-mono">{f}</span>
            ))}
          </div>
          <p className="text-xs text-quai-muted mb-4">La première ligne doit contenir les en-têtes de colonnes.</p>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" className="hidden"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          <button onClick={() => fileRef.current.click()} className="btn-primary">Choisir un fichier</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-4 p-3 bg-quai-navy/5 rounded-lg text-sm text-quai-navy inline-flex items-center gap-2">
            <Icon name="table" size="sm" /> {rows.length.toLocaleString('fr')} lignes détectées. Vérifiez le mapping des colonnes.
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-quai-text mb-1">Catégorie par défaut</label>
            <select className="input w-auto" value={defaultCategorie} onChange={e => setDefaultCategorie(e.target.value)}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(FIELD_MAP).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-quai-muted mb-1 capitalize">{field}</label>
                <select className="input" value={mapping[field] || ''} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || null }))}>
                  <option value="">— Ignorer —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {rows.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-quai-muted mb-2">Aperçu (3 premières lignes)</div>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-quai-light">
                      {Object.entries(mapping).filter(([,v]) => v).map(([f]) => (
                        <th key={f} className="border border-quai-border px-2 py-1 text-left capitalize">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(mapping).filter(([,v]) => v).map(([f, col]) => (
                          <td key={f} className="border border-quai-border px-2 py-1 max-w-32 truncate">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && result && (
        <div className="text-center py-8">
          <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold text-quai-navy mb-2">Import terminé</h3>
          <div className="grid grid-cols-2 gap-4 my-4 max-w-xs mx-auto">
            <div className="card text-center">
              <div className="text-2xl font-bold text-emerald-600">{result.importes}</div>
              <div className="text-xs text-quai-muted">Importés</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-red-600">{result.erreurs}</div>
              <div className="text-xs text-quai-muted">Erreurs</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ImportModal.jsx
git commit -m "refactor(ui): ImportModal sur Modal accessible + icônes + charte"
```

---

## Phase 4 — Migration des pages

### Task 12 : SessionPage (cœur de l'app — refonte premium)

**Files:**
- Modify: `client/src/pages/SessionPage.jsx`

- [ ] **Step 1: Remplacer les imports et les emojis/couleurs**

En tête, ajouter : `import Icon from '../components/ui/Icon'`

Remplacer l'écran de fin (lignes ~107-125) — l'emoji trophée devient une icône, couleurs chartées :

```jsx
  if (done || file.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-quai-light">
        <div className="text-center max-w-md">
          <Icon name="trophy" size="xl" className="text-quai-gold mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-quai-navy mb-2">
            {file.length === 0 ? 'Aucune relance à faire' : 'Session terminée'}
          </h2>
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="card text-center"><div className="text-2xl font-bold text-quai-navy">{sessionStats.total}</div><div className="text-xs text-quai-muted">Relances</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-emerald-600">{sessionStats.rdv}</div><div className="text-xs text-quai-muted">RDV obtenus</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-quai-navy">{sessionStats.contactes}</div><div className="text-xs text-quai-muted">Contactés</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{sessionStats.pasRep}</div><div className="text-xs text-quai-muted">Sans réponse</div></div>
          </div>
          <button onClick={loadFile} className="btn-primary inline-flex items-center gap-2"><Icon name="refresh-cw" size="sm" /> Recharger la file</button>
        </div>
      </div>
    )
  }
```

- [ ] **Step 2: Remplacer la barre de progression (compteurs sans emoji)**

Remplacer le bloc compteurs (lignes ~132-144) :

```jsx
      <div className="max-w-3xl mx-auto mb-4">
        <div className="flex items-center justify-between text-sm text-quai-muted mb-1">
          <span>Contact {index + 1} / {file.length}</span>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-600 font-medium inline-flex items-center gap-1"><Icon name="calendar-check" size="sm" /> {sessionStats.rdv} RDV</span>
            <span className="text-quai-navy font-medium inline-flex items-center gap-1"><Icon name="phone-call" size="sm" /> {sessionStats.contactes} contactés</span>
            <span className="text-amber-600 font-medium inline-flex items-center gap-1"><Icon name="phone-off" size="sm" /> {sessionStats.pasRep} sans réponse</span>
          </div>
        </div>
        <div className="h-2 bg-quai-border rounded-full overflow-hidden">
          <div className="h-full bg-quai-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
```

- [ ] **Step 3: Refondre le bloc téléphone (premium, charte navy)**

Remplacer le bloc téléphone (lignes ~169-187) :

```jsx
          {contact.telephone && (
            <div className="bg-quai-navy rounded-xl p-5 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-quai-gold font-medium uppercase tracking-wider mb-1">Téléphone</div>
                <a href={`tel:${contact.telephone}`} className="text-3xl font-bold text-white hover:text-quai-gold transition-colors inline-flex items-center gap-2">
                  <Icon name="phone" size="lg" /> {contact.telephone}
                </a>
              </div>
              {contact.telephone2 && (
                <div className="text-right">
                  <div className="text-xs text-quai-gold/80 font-medium uppercase mb-1">Tél. 2</div>
                  <a href={`tel:${contact.telephone2}`} className="text-lg font-semibold text-white/80 hover:text-white">{contact.telephone2}</a>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 4: Email / Notes / Score / titre — charte + icônes**

Remplacer le titre contact (ligne ~156) `text-gray-900` → `text-quai-navy font-display`.
Remplacer la ligne email (ligne ~190) :

```jsx
          {contact.email && (
            <div className="text-sm text-quai-muted mb-3 inline-flex items-center gap-1.5"><Icon name="mail" size="sm" /> {contact.email}</div>
          )}
```

Remplacer le bloc notes (lignes ~193-197) :

```jsx
          {contact.notes && (
            <div className="bg-quai-gold/10 border border-quai-gold/30 rounded-lg p-3 text-sm text-quai-text mb-3 flex gap-2">
              <Icon name="pin" size="sm" className="text-quai-gold flex-shrink-0 mt-0.5" />
              <span><span className="font-medium">Notes : </span>{contact.notes}</span>
            </div>
          )}
```

Remplacer les tags `bg-gray-100 text-gray-600` (ligne ~202) → `bg-quai-light text-quai-muted border border-quai-border`.

- [ ] **Step 5: Bloc script (icône + charte)**

Remplacer le bloc script (lignes ~208-222) :

```jsx
        {scripts.length > 0 && (
          <div className="card">
            <button onClick={() => setShowScript(v => !v)} className="w-full flex items-center justify-between text-sm font-medium text-quai-navy">
              <span className="inline-flex items-center gap-2"><Icon name="file-text" size="sm" /> Script d'appel <span className="kbd ml-1">S</span></span>
              <Icon name={showScript ? 'chevron-up' : 'chevron-down'} size="sm" />
            </button>
            {showScript && scripts.map(s => (
              <div key={s.id} className="mt-3 p-3 bg-quai-light rounded-lg text-sm text-quai-text whitespace-pre-wrap border-l-4 border-quai-gold">
                <div className="font-medium text-quai-navy mb-1">{s.titre}</div>
                {s.contenu}
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 6: Boutons de statut (icône Lucide + sélection chartée)**

Remplacer la grille de boutons statuts (lignes ~229-245) :

```jsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {Object.entries(STATUTS_RELANCE).map(([key, val], i) => (
              <button
                key={key}
                onClick={() => setStatutRelance(key)}
                aria-pressed={statutRelance === key}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] ${
                  statutRelance === key
                    ? 'border-quai-gold bg-quai-gold/10 text-quai-navy'
                    : 'border-quai-border hover:border-quai-navy/40 text-quai-muted'
                }`}
              >
                <Icon name={val.icon} size="sm" className="flex-shrink-0" />
                <span className="flex-1 text-left">{val.label}</span>
                <kbd className="kbd text-xs">{i + 1}</kbd>
              </button>
            ))}
          </div>
```

- [ ] **Step 7: Bouton enregistrer + titres restants**

Remplacer `text-gray-700`/`text-gray-900` restants de la page par `text-quai-navy` ou `text-quai-text`, le fond `bg-gray-50` (ligne ~130) par `bg-quai-light`.
Remplacer le bouton principal (lignes ~266-272) :

```jsx
            <button onClick={() => submit()} disabled={!statutRelance || submitting} className="btn-primary flex-1 inline-flex items-center justify-center gap-2">
              {submitting ? 'Enregistrement…' : <>Enregistrer et suivant <Icon name="arrow-right" size="sm" /></>}
            </button>
```

Remplacer le toast RDV (ligne ~73) : retirer l'emoji →

```jsx
      if (s === 'rdv_obtenu') toast.success('RDV obtenu ! Excellent !', { duration: 3000 })
```

- [ ] **Step 8: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/SessionPage.jsx
git commit -m "refactor(ui): SessionPage premium — charte navy/or, icônes Lucide, a11y"
```

---

### Task 13 : ContactsPage (toolbar responsive + charte)

**Files:**
- Modify: `client/src/pages/ContactsPage.jsx`

- [ ] **Step 1: Importer Icon + PageHeader**

En tête : `import Icon from '../components/ui/Icon'` et `import PageHeader from '../components/ui/PageHeader'`.

- [ ] **Step 2: Toolbar responsive + boutons icône**

Remplacer la toolbar (lignes ~63-92) :

```jsx
      <div className="bg-white border-b border-quai-border p-4">
        <div className="flex flex-col lg:flex-row lg:flex-wrap gap-3 lg:items-center">
          <input
            className="input flex-1 min-w-0 lg:min-w-[16rem]"
            placeholder="Rechercher (nom, téléphone, ville…)"
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Rechercher un contact"
          />
          <div className="flex flex-wrap gap-3">
            <select className="input w-auto" value={categorie} onChange={e => setCategorie(e.target.value)} aria-label="Filtrer par catégorie">
              <option value="">Toutes catégories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input w-auto" value={statut} onChange={e => setStatut(e.target.value)} aria-label="Filtrer par statut">
              <option value="">Tous statuts</option>
              {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input w-auto" value={`${sort}:${order}`} onChange={e => { const [s, o] = e.target.value.split(':'); setSort(s); setOrder(o) }} aria-label="Trier">
              <option value="score_priorite:DESC">Score décroissant</option>
              <option value="nom:ASC">Nom A-Z</option>
              <option value="date_dernier_contact:DESC">Dernier contact</option>
              <option value="prochain_contact:ASC">Prochain contact</option>
              <option value="created_at:DESC">Ajouté récemment</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <button onClick={openNew} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Nouveau</button>
            <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="upload" size="sm" /> Importer</button>
            <button onClick={handleExport} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="download" size="sm" /> Exporter</button>
          </div>
        </div>
        <div className="text-xs text-quai-muted mt-2">{total.toLocaleString('fr')} contact(s) trouvé(s)</div>
      </div>
```

- [ ] **Step 3: Charter table + pagination**

Remplacer dans la table : `border-gray-200` → `border-quai-border`, `bg-gray-50` → `bg-quai-light`, `text-gray-600` → `text-quai-muted`, `text-gray-900` → `text-quai-navy`, `hover:bg-blue-50` → `hover:bg-quai-light`, `divide-gray-100` → `divide-quai-border`, `text-gray-400` → `text-quai-muted`.
Remplacer la pagination (lignes ~146-152) — flèches en icônes :

```jsx
      {pages > 1 && (
        <div className="bg-white border-t border-quai-border px-4 py-3 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="arrow-left" size="sm" /> Précédent</button>
          <span className="text-sm text-quai-muted">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm inline-flex items-center gap-1.5">Suivant <Icon name="arrow-right" size="sm" /></button>
        </div>
      )}
```

- [ ] **Step 4: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ContactsPage.jsx
git commit -m "refactor(ui): ContactsPage — toolbar responsive, charte, icônes"
```

---

### Task 14 : DashboardPage (KPIs sans emoji + PageHeader)

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Importer Icon + PageHeader, remplacer le header**

En tête : `import Icon from '../components/ui/Icon'` et `import PageHeader from '../components/ui/PageHeader'`.
Remplacer le header (lignes ~48-58) :

```jsx
        <PageHeader title="Vue d'ensemble" subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}>
          <select value={periode} onChange={e => setPeriode(Number(e.target.value))} className="input w-auto text-sm" aria-label="Période">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
          </select>
        </PageHeader>
```

- [ ] **Step 2: KPIs avec icônes Lucide**

Remplacer les 4 `KpiCard` (lignes ~62-65) :

```jsx
          <KpiCard label="Total contacts" value={stats.totalContacts.toLocaleString('fr')} icon="users" variant="navy" />
          <KpiCard label="Relances (période)" value={stats.totalRelances} icon="phone" variant="gold" />
          <KpiCard label="Taux de contact" value={`${tauxContact}%`} icon="trending-up" variant="light" />
          <KpiCard label="RDV obtenus (total)" value={stats.rdvObtenus} icon="calendar-check" variant="success" onClick={() => onNavigate('contacts')} />
```

Remplacer la fonction `KpiCard` (lignes ~139-158) :

```jsx
function KpiCard({ label, value, icon, variant, onClick }) {
  const styles = {
    navy:    'bg-quai-navy text-white',
    gold:    'bg-quai-gold text-quai-navy',
    light:   'bg-white border border-quai-border text-quai-navy',
    success: 'bg-emerald-600 text-white',
  }
  return (
    <div
      className={`rounded-xl p-5 flex items-center gap-4 ${styles[variant]} ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
      onClick={onClick}
      {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && onClick() } : {})}
    >
      <Icon name={icon} size="xl" className="opacity-80" />
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs opacity-70 mt-0.5">{label}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "refactor(ui): DashboardPage — KPIs iconographiés, PageHeader, a11y"
```

---

### Task 15 : SupervisionPage (charte)

**Files:**
- Modify: `client/src/pages/SupervisionPage.jsx`

- [ ] **Step 1: Importer Icon + PageHeader**

En tête : `import Icon from '../components/ui/Icon'` et `import PageHeader from '../components/ui/PageHeader'`.

- [ ] **Step 2: Header + bouton actualiser**

Remplacer le header (lignes ~37-49) :

```jsx
        <PageHeader title="Supervision" subtitle="Actualisation automatique toutes les 30 secondes">
          <select className="input w-auto" value={agentId} onChange={e => setAgentId(e.target.value)} aria-label="Filtrer par agent">
            <option value="">Tous les agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
          </select>
          <button onClick={load} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="refresh-cw" size="sm" /> Actualiser</button>
        </PageHeader>
```

- [ ] **Step 3: Cartes agents + StatCard chartées**

Dans les cartes agents : remplacer `bg-blue-100 text-blue-700` (avatar, ligne ~59) → `bg-quai-navy text-white` ; `text-gray-900` → `text-quai-navy` ; `text-gray-400/500` → `text-quai-muted`. Remplacer les 4 mini-cartes de stats (lignes ~71-88) :

```jsx
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.relances_total}</div>
                    <div className="text-xs text-quai-muted">Relances</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded p-2">
                    <div className="text-xl font-bold text-emerald-700">{a.rdv}</div>
                    <div className="text-xs text-quai-muted">RDV</div>
                  </div>
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.contactes}</div>
                    <div className="text-xs text-quai-muted">Contactés</div>
                  </div>
                  <div className="bg-quai-gold/10 border border-quai-gold/30 rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{taux}%</div>
                    <div className="text-xs text-quai-muted">Contact</div>
                  </div>
                </div>
```

Remplacer les titres `text-gray-700` → `text-quai-navy`, les `text-gray-400` → `text-quai-muted`. Remplacer la barre de progression `bg-gray-100`/`bg-blue-500` (lignes ~114-118) → `bg-quai-border`/`bg-quai-navy`. Réécrire `StatCard` (lignes ~132-140) :

```jsx
function StatCard({ label, value }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-quai-navy">{value}</div>
      <div className="text-xs text-quai-muted mt-1">{label}</div>
    </div>
  )
}
```

Et adapter les appels `StatCard` (lignes ~102-105) en retirant la prop `color` :

```jsx
              <StatCard label="Total relances" value={stats.totalRelances} />
              <StatCard label="RDV obtenus (total)" value={stats.rdvObtenus} />
              <StatCard label="Total contacts" value={stats.totalContacts?.toLocaleString('fr')} />
              <StatCard label="Types de statuts" value={(stats.parStatut?.length || 0) + ' types'} />
```

Remplacer le loader (ligne ~32) `text-gray-400` → `text-quai-muted`.

- [ ] **Step 4: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SupervisionPage.jsx
git commit -m "refactor(ui): SupervisionPage — charte navy/or, icônes, PageHeader"
```

---

### Task 16 : AdminPage (charte + onglets iconographiés)

**Files:**
- Modify: `client/src/pages/AdminPage.jsx`

- [ ] **Step 1: Importer Icon + PageHeader**

En tête : `import Icon from '../components/ui/Icon'` et `import PageHeader from '../components/ui/PageHeader'`.
Remplacer `<h1 className="text-2xl font-bold mb-6">Administration</h1>` (ligne ~41) par `<PageHeader title="Administration" />`.

- [ ] **Step 2: Onglets avec icônes, charte**

Remplacer le bloc onglets (lignes ~43-50) :

```jsx
        <div className="flex border-b border-quai-border mb-6">
          {[['users','Utilisateurs','users'],['params','Paramètres','settings']].map(([t, lbl, ic]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
              <Icon name={ic} size="sm" /> {lbl}
            </button>
          ))}
        </div>
```

- [ ] **Step 3: Charter le reste (badges rôle, bordures, libellés)**

Remplacer `border-blue-300` (carte nouvel user, ligne ~60) → `border-quai-gold/40` ; `text-gray-700`/`text-gray-600` → `text-quai-navy`/`text-quai-muted` ; `bg-gray-50` → `bg-quai-light` ; `divide-gray-100` → `divide-quai-border`.
Remplacer les badges de rôle (lignes ~102-106) :

```jsx
                        <span className={`badge ${u.role === 'admin' ? 'bg-quai-navy text-white' : u.role === 'manager' ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.role}
                        </span>
```

Remplacer le badge actif/inactif (lignes ~108-110) :

```jsx
                        <span className={`badge ${u.actif ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
```

Remplacer le lien d'action (lignes ~112-115) `text-gray-500` → `text-quai-navy hover:text-quai-gold font-medium`.

- [ ] **Step 4: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/AdminPage.jsx
git commit -m "refactor(ui): AdminPage — onglets iconographiés, badges & charte"
```

---

### Task 17 : ScriptsPage (charte + ConfirmDialog)

**Files:**
- Modify: `client/src/pages/ScriptsPage.jsx`

- [ ] **Step 1: Importer Icon, PageHeader, ConfirmDialog**

En tête : `import Icon from '../components/ui/Icon'`, `import PageHeader from '../components/ui/PageHeader'`, `import ConfirmDialog from '../components/ui/ConfirmDialog'`.

- [ ] **Step 2: État de confirmation + remplacer `confirm()`**

Ajouter dans le composant `ScriptsPage`, après `const [form, ...]` : `const [confirmId, setConfirmId] = useState(null)`.
Remplacer la fonction `del` (lignes ~34-39) :

```jsx
  const del = async (id) => {
    await api.delete(`/scripts/${id}`)
    toast.success('Script supprimé')
    setConfirmId(null)
    load()
  }
```

- [ ] **Step 3: Header + bouton nouveau iconographié**

Remplacer le header (lignes ~53-66) :

```jsx
        <PageHeader title="Scripts d'appel">
          <select className="input w-auto" value={filtre} onChange={e => setFiltre(e.target.value)} aria-label="Filtrer par catégorie">
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {canEdit && (
            <button onClick={() => { setEditId(null); setForm({ categorie: 'autre', titre: '', contenu: '' }); setShowNew(true) }} className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <Icon name="plus" size="sm" /> Nouveau script
            </button>
          )}
        </PageHeader>
```

- [ ] **Step 4: Charter le formulaire et les cartes**

Remplacer `border-blue-300` (ligne ~69) → `border-quai-gold/40` ; `text-gray-600` → `text-quai-muted` ; `text-gray-400` → `text-quai-muted` ; `text-gray-800` → `text-quai-navy`.
Réécrire `ScriptCard` (lignes ~118-141) :

```jsx
function ScriptCard({ script, canEdit, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <h4 className="font-medium text-quai-navy">{script.titre}</h4>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit(script) }} className="btn-secondary btn-sm">Modifier</button>
              <button onClick={e => { e.stopPropagation(); onDelete(script.id) }} aria-label="Supprimer le script" className="text-red-600 hover:text-red-700 p-1 rounded">
                <Icon name="trash-2" size="sm" />
              </button>
            </>
          )}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted" />
        </div>
      </div>
      {open && (
        <div className="mt-3 p-4 bg-quai-light rounded-lg text-sm text-quai-text whitespace-pre-wrap border-l-4 border-quai-gold">
          {script.contenu}
        </div>
      )}
    </div>
  )
}
```

Modifier l'appel à `onDelete` dans le `.map` (ligne ~104) pour ouvrir le dialogue : `onDelete={(id) => setConfirmId(id)}`.
Avant la fermeture du composant `ScriptsPage` (juste avant `</div></div>` final), ajouter le dialogue :

```jsx
        {confirmId && (
          <ConfirmDialog
            title="Supprimer le script"
            message="Voulez-vous vraiment supprimer ce script d'appel ?"
            confirmLabel="Supprimer"
            onConfirm={() => del(confirmId)}
            onCancel={() => setConfirmId(null)}
          />
        )}
```

Remplacer le « Aucun script » (ligne ~111) `text-gray-400` → `text-quai-muted`.

- [ ] **Step 5: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ScriptsPage.jsx
git commit -m "refactor(ui): ScriptsPage — charte, icônes, ConfirmDialog"
```

---

### Task 18 : LoginPage (polish premium)

**Files:**
- Modify: `client/src/pages/LoginPage.jsx`

- [ ] **Step 1: Titre en Playfair + filet or sous le titre**

Remplacer le bloc titre (lignes ~61-64) :

```jsx
          <div className="mb-8">
            <h2 className="text-2xl font-display font-semibold text-quai-navy">Connexion</h2>
            <div className="mt-2 w-10 h-0.5 bg-quai-gold" />
            <p className="text-quai-muted text-sm mt-3">Accédez à votre espace de relances</p>
          </div>
```

- [ ] **Step 2: Vérifier le build**

```bash
npm --prefix client run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/LoginPage.jsx
git commit -m "refactor(ui): LoginPage — titre Playfair + filet or"
```

---

## Phase 5 — Vérification finale

### Task 19 : Vérification globale (zéro emoji, build, run, parcours)

**Files:** aucun (vérification)

- [ ] **Step 1: Vérifier zéro emoji dans le code source**

```bash
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{25A0}-\x{25FF}]' client/src 2>/dev/null
```

Expected: **aucune ligne** affichée. Si un fichier ressort, l'ouvrir et remplacer le caractère restant par une icône, puis recommitter.

- [ ] **Step 2: Vérifier l'absence de couleurs génériques résiduelles dans les pages/composants**

```bash
grep -rnE '\b(bg|text|border)-(blue|gray|indigo|purple)-[0-9]' client/src/pages client/src/components/Layout.jsx client/src/components/ContactBadge.jsx client/src/components/ContactModal.jsx client/src/components/ImportModal.jsx 2>/dev/null
```

Expected: aucune ligne (les seules couleurs hors charte tolérées sont les couleurs d'état emerald/red/amber/sky/orange pour la sémantique des statuts). Si du `blue/gray/indigo/purple` ressort, le remplacer par la classe `quai-*` équivalente.

- [ ] **Step 3: Build complet**

```bash
npm --prefix client run build
```

Expected: build OK, aucune erreur.

- [ ] **Step 4: Lancer le serveur en prod et tester le parcours**

```bash
NODE_ENV=production JWT_SECRET=test-verif PORT=3010 node server/src/index.js &
sleep 2
# login agent
TOKEN=$(curl -s -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
echo "Token reçu: ${TOKEN:0:20}..."
# file de relances
curl -s http://localhost:3010/api/contacts/file-relances -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
# la racine sert bien le build
curl -s http://localhost:3010/ | grep -o "<title>[^<]*</title>"
kill %1 2>/dev/null
```

Expected: token reçu, file de relances en JSON, `<title>` présent.

- [ ] **Step 5: Vérifier que le serveur refuse de démarrer en prod sans secret**

```bash
NODE_ENV=production node -e "try{require('./server/src/auth.js');console.log('ECHEC: aurait dû planter')}catch(e){console.log('OK refus:', e.message.slice(0,40))}"
```

Expected: `OK refus: JWT_SECRET est obligatoire…`

- [ ] **Step 6: Commit final éventuel (si corrections aux steps 1-2)**

```bash
git add -A && git commit -m "chore: corrections finales charte/emoji" || echo "rien à committer"
```

- [ ] **Step 7: Mettre à jour le README de lancement si présent**

Vérifier `start.sh` et `Lancer ImmoRelances.command` — s'assurer qu'ils définissent `JWT_SECRET` pour le mode prod local. Si `start.sh` lance en prod sans secret, ajouter `export JWT_SECRET=...`. Commit si modifié.

---

## Definition of Done (rappel spec §4)
- [x] Build client OK
- [x] Serveur prod : login 3 rôles + pages chargées
- [x] Zéro emoji dans `client/src`
- [x] Couleurs génériques non sémantiques éliminées des pages
- [x] Modales : Échap + focus trap
- [x] Enregistrer une relance recalcule le score + met à jour le statut (logique backend inchangée, déjà conforme)
