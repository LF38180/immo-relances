# Module Courtage Marine V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.

**Goal:** Espace courtage cloisonné pour Marine dans immo-relances (saisie manuelle, cycle de relances, mail injoignables, dashboard), sans RIEN changer pour Chrystelle.

**Architecture:** Tables dédiées `courtage_*` + rôle `courtage` + vue client dédiée. Spec : `docs/superpowers/specs/2026-07-22-module-courtage-marine-design.md`.

⚠️ CONTRAINTE ABSOLUE : aucune modification de comportement pour Chrystelle (tables contacts/relances, file, session, stats intouchées). Migration users = table-swap sûr FK. Tous les tests existants doivent rester verts.

---

## Task 1 : Backend base — rôle courtage, compte Marine, tables, paramètres, flag mot de passe

**Files:** Modify `server/src/database.js`, `server/src/routes/authRoutes.js` · Test `server/test/courtage-base.test.js`

- [ ] **Step 1 — CHECK users + must_change_password (base CREATE)**
Dans `database.js`, table users (CREATE IF NOT EXISTS) : CHECK devient
`CHECK(role IN ('agent','manager','admin','courtage'))` et AJOUTER la colonne
`must_change_password INTEGER NOT NULL DEFAULT 0,` (avant created_at).

- [ ] **Step 2 — Ordre des migrations users (CRITIQUE)**
L'ALTER `last_login` existe déjà (zone des ALTER idempotents). Juste APRÈS lui, ajouter :
```js
// Migration rôle 'courtage' : SQLite ne modifie pas un CHECK en place -> table-swap.
// FK-safe : relances.agent_id et contacts.assigned_to référencent users ; si les FK
// sont actives (cas prod), DROP TABLE users échoue et laisse users_new résiduelle
// -> crash en boucle. Procédure sûre : FK OFF avant, transaction, DROP IF EXISTS d'abord.
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (sql && /CHECK\(role IN/.test(sql.sql) && !/'courtage'/.test(sql.sql)) {
    db.pragma('foreign_keys = OFF');
    const swap = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS users_new');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL, prenom TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','manager','admin','courtage')),
          actif INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login TEXT
        );
        INSERT INTO users_new (id,nom,prenom,email,password,role,actif,created_at,last_login)
          SELECT id,nom,prenom,email,password,role,actif,created_at,last_login FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    swap();
    db.pragma('foreign_keys = ON');
  }
}
// Ceinture : colonne must_change_password si base créée avant cette version.
const uCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!uCols.includes('must_change_password')) db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
```
NB : l'ALTER last_login DOIT s'exécuter AVANT ce bloc (le SELECT du swap lit last_login).

- [ ] **Step 3 — Tables courtage** (après les tables existantes) :
```js
db.exec(`
  CREATE TABLE IF NOT EXISTS courtage_fiches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL, prenom TEXT,
    telephone TEXT, telephone_norm TEXT,
    mail TEXT, mail_norm TEXT,
    date_contact TEXT,
    montant_projet TEXT,
    reference_bien TEXT,
    source TEXT DEFAULT 'CI Facile',
    attribution_cr TEXT, capacite_emprunt TEXT,
    categorie TEXT NOT NULL DEFAULT 'manuel',
    priorite INTEGER NOT NULL DEFAULT 1,
    statut TEXT NOT NULL DEFAULT 'en_relance' CHECK(statut IN
      ('a_qualifier','en_relance','simulation_faite','dossier_en_cours',
       'gagne','perdu','injoignable','ne_plus_contacter')),
    prochaine_relance TEXT,
    tentatives_sans_reponse INTEGER NOT NULL DEFAULT 0,
    mail_propose_le TEXT,
    commentaire TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_courtage_fiches_relance ON courtage_fiches(prochaine_relance);
  CREATE INDEX IF NOT EXISTS idx_courtage_fiches_tel ON courtage_fiches(telephone_norm);
  CREATE TABLE IF NOT EXISTS courtage_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiche_id INTEGER NOT NULL REFERENCES courtage_fiches(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('creation','relance','pas_de_reponse','trop_tot','mail_propose','statut')),
    commentaire TEXT, prochaine_relance TEXT,
    statut_avant TEXT, statut_apres TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_courtage_actions_fiche ON courtage_actions(fiche_id);
  CREATE TABLE IF NOT EXISTS courtage_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telephone_norm TEXT, mail_norm TEXT, motif TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS courtage_demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiche_id INTEGER NOT NULL REFERENCES courtage_fiches(id) ON DELETE CASCADE,
    reference_bien TEXT, date_demande TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
```

- [ ] **Step 4 — Paramètres + seed Marine** (avec les autres seeds, idempotent) :
```js
[['courtage_delai_relance_jours','7'],
 ['courtage_tentatives_max','2'],
 ['courtage_tel_marine',''],
 ['courtage_mail_objet','Votre projet immobilier — étude de financement'],
 ['courtage_mail_corps',
`Bonjour [Prénom],

Vous avez récemment contacté notre agence au sujet d'un bien [BIEN] et manifesté un intérêt pour une étude de financement. Je me tiens à votre disposition pour en parler et vous proposer une simulation personnalisée, gratuite et sans engagement.

Vous pouvez me joindre au [TEL_MARINE] ou répondre directement à ce message.

Bien cordialement,
Marine Rosain — Conseillère en financement
Le Quai de l'Immobilier`],
 ['courtage_exclusion_agents','POITEVIN Lyes,BARRETO Nolan'],
].forEach(([c, v]) => insertParam.run(c, v));
// (réutiliser insertParam INSERT OR IGNORE existant ; sinon même pattern)

const marine = db.prepare('SELECT id FROM users WHERE email = ?').get('marine.rosain@lequai-immobilier.com');
if (!marine) {
  db.prepare('INSERT INTO users (nom, prenom, email, password, role, must_change_password) VALUES (?,?,?,?,?,1)')
    .run('Rosain', 'Marine', 'marine.rosain@lequai-immobilier.com', bcrypt.hashSync('MarineLeQuai', 10), 'courtage');
}
```

- [ ] **Step 5 — authRoutes** : le login renvoie `must_change_password` dans l'objet user
(`must_change_password: user.must_change_password`), et `PUT /password` fait aussi
`UPDATE users SET must_change_password = 0 WHERE id = ?` après le changement.

- [ ] **Step 6 — Test `courtage-base.test.js`** : CHECK contient courtage ; Marine existe
(rôle courtage, must_change_password=1) ; tables courtage existent (PRAGMA) ; params
courtage présents ; users existants intacts (admin + Chrystelle toujours là, rôles inchangés) ;
last_login toujours colonne de users. Modèle : tests existants (DB /tmp).
Run → tous OK. Puis TOUS les tests existants (non-régression) → verts.

- [ ] **Step 7 — Commit** : `feat(courtage): role courtage, compte Marine, tables et parametres`

---

## Task 2 : Backend routes courtage (cycle complet)

**Files:** Create `server/src/routes/courtageRoutes.js` · Modify `server/src/index.js` (mount `/api/courtage`) · Test `server/test/courtage-routes.test.js`

- [ ] **Step 1 — Créer courtageRoutes.js** :
Helpers :
```js
const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('33') && d.length === 11) d = '0' + d.slice(2); return d || null; };
const normMail = (m) => (m || '').trim().toLowerCase() || null;
const param = (cle, defaut) => { const r = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get(cle); return r ? r.valeur : defaut; };
const dansNJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const enListeNoire = (tel, mail) => !!db.prepare('SELECT 1 FROM courtage_blacklist WHERE (telephone_norm IS NOT NULL AND telephone_norm = ?) OR (mail_norm IS NOT NULL AND mail_norm = ?)').get(tel || '∅', mail || '∅');
```
Accès : `router.use(requireAuth)`. Écriture (`POST/PUT`) : `requireRole('courtage')`.
Lecture (`GET`) : `requireRole('courtage','manager','admin')`.
Routes :
- `POST /fiches` — création rapide : nom requis ; norm tél/mail ; refus 409 si liste
  noire ; statut 'en_relance' ; prochaine_relance = body.prochaine_relance ||
  J+param(courtage_delai_relance_jours,7) ; action 'creation'. Si reference_bien →
  insérer aussi dans courtage_demandes.
- `GET /fiches` — liste (query : statut, q sur nom/tél) triée updated_at DESC.
- `GET /fiches/relances-jour` — statut NOT IN ('gagne','perdu','ne_plus_contacter')
  AND prochaine_relance IS NOT NULL AND prochaine_relance <= date('now') ;
  ORDER BY priorite ASC, prochaine_relance ASC. Renvoie aussi le dernier commentaire
  (sous-requête sur courtage_actions).
- `GET /fiches/:id` — fiche + actions (DESC) + demandes.
- `POST /fiches/:id/relance` — { commentaire (requis), prochaine_relance (défaut J+7),
  statut? } → action 'relance' (+ action 'statut' si statut change) ; update fiche
  (prochaine_relance, statut éventuel, updated_at).
- `POST /fiches/:id/trop-tot` — { jours? , date? } : nouvelle date = date || J+7 ;
  action 'trop_tot'.
- `POST /fiches/:id/pas-de-reponse` — tentatives+1 ; si tentatives >=
  param(courtage_tentatives_max,2) → statut 'injoignable' (action 'statut') ;
  prochaine_relance = demain ; action 'pas_de_reponse'. Renvoie { tentatives, statut }.
- `PUT /fiches/:id/statut` — { statut } (valider contre la liste CHECK) ;
  'ne_plus_contacter' → insert blacklist (tel_norm, mail_norm, motif 'ne_plus_contacter')
  + prochaine_relance NULL ; 'gagne'/'perdu' → prochaine_relance NULL ; action 'statut'.
- `POST /fiches/:id/mail-propose` — set mail_propose_le = date('now'),
  prochaine_relance = J+7, action 'mail_propose'.
- `GET /mail-modele/:id` — renvoie { mailto } construit :
  `mailto:<mail>?subject=<objet>&body=<corps>` avec [Prénom] → prenom||'', [BIEN] →
  reference_bien ? `(${reference_bien})` : 'immobilier', [TEL_MARINE] →
  param(courtage_tel_marine) ; encodeURIComponent sur subject/body.
- `GET /dashboard` — { parStatut: [{statut,cnt}], relancesSemaine (actions type
  'relance' sur 7 derniers jours), simulations (fiches statut simulation_faite+dossier_en_cours+gagne),
  dossiers (dossier_en_cours+gagne), tauxOuiSimulation, tauxSimulationDossier,
  aRelancerAujourdhui (count relances-jour) }.
Mount dans index.js : `app.use('/api/courtage', require('./routes/courtageRoutes'));`

- [ ] **Step 2 — Test HTTP `courtage-routes.test.js`** (spawn, modèle mes-rappels.test.js, port 3014) :
login Marine (MarineLeQuai) → must_change_password=1 dans la réponse ; création fiche
(201, statut en_relance, prochaine_relance J+7) ; relances-jour vide (J+7 futur) puis
fiche avec date passée apparaît ; pas-de-reponse ×2 → injoignable ; relance (commentaire
+ date) historisée ; trop-tot +7 ; ne_plus_contacter → blacklist → re-création même tél
refusée 409 ; mail-modele contient mailto + prénom ; **isolation** : Chrystelle
(agent@... = agent) → POST /fiches 403 ; admin → GET /fiches 200, POST 403 ;
dashboard 200 pour Marine et admin. Run → tous OK.

- [ ] **Step 3 — Commit** : `feat(courtage): routes cycle de relances courtage (cloisonnees)`

---

## Task 3 : Front — gate mot de passe + espace Marine (cœur)

**Files:** Modify `client/src/App.jsx`, `client/src/hooks/useAuth.jsx` (si besoin pour must_change_password) · Create `client/src/pages/CourtagePage.jsx`, `client/src/pages/ChangePasswordGate.jsx`

- [ ] **Step 1 — Gate** : dans App.jsx, si `user.must_change_password` → rendre
`ChangePasswordGate` (plein écran, bloquant) : nouveau mdp ×2 → `PUT /auth/password`
(avec l'ancien = MarineLeQuai saisi ou champ ancien mdp) → maj user local
(must_change_password=0) → accès app. Lire useAuth pour voir comment user est stocké
(localStorage) et le mettre à jour proprement.
- [ ] **Step 2 — Routing rôle courtage** : `user.role === 'courtage'` → `CourtagePage`
UNIQUEMENT (pas le Layout/nav de Chrystelle). Bandeau : titre « Courtage — Marine »,
bouton Déconnexion (pattern VueReleveur d'immo-prospect : simple header).
- [ ] **Step 3 — CourtagePage** : 3 onglets (Relances du jour / Fiches / Tableau de bord)
+ bouton « + Nouvelle fiche » permanent.
  - **Relances du jour** : GET /courtage/fiches/relances-jour. Cartes : nom prénom,
    tél ÉNORME (cliquable tel:), montant/bien, badge priorité/catégorie/statut,
    dernier commentaire. Boutons par carte : « Relance faite » (ouvre commentaire
    obligatoire + date défaut J+7 → POST /relance), « Trop tôt » (+7 j direct ; petit
    lien « choisir une date »), « Pas de réponse » (POST ; si réponse statut
    'injoignable' → proposer le mail : bouton « Préparer le mail » → GET /mail-modele
    → window.location.href = mailto → POST /mail-propose). Boutons statut (Simulation
    faite / Dossier en cours / Gagné / Perdu / Ne plus contacter avec confirmation).
    Clic sur la carte → détail avec historique complet (actions datées).
  - **Fiches** : GET /courtage/fiches, filtre statut (select), recherche, mêmes cartes.
  - **Nouvelle fiche** (modale) : nom*, prénom, tél, mail, date simulation, montant,
    référence bien, commentaire, prochaine relance (défaut J+7 affiché). POST /fiches ;
    si 409 → message « Ce contact est en liste noire (ne plus contacter) ».
  - Styles : réutiliser les classes existantes (card, btn-primary, input, badges…)
    même charte que le reste de l'app.
- [ ] **Step 4 — Build** ✓ ; **Commit** : `feat(courtage): espace Marine (relances du jour, fiches, cycle complet)`

---

## Task 4 : Front — dashboard Marine + admin (lecture, paramètres, rôle)

**Files:** Modify `client/src/pages/CourtagePage.jsx` (onglet dashboard), `client/src/pages/SupervisionPage.jsx`, `client/src/pages/AdminPage.jsx`

- [ ] **Step 1 — Onglet Tableau de bord (Marine)** : GET /courtage/dashboard → tuiles
(relances cette semaine, à relancer aujourd'hui, simulations, dossiers en cours) +
répartition par statut (barres) + taux OUI→simulation, simulation→dossier. Même esprit
visuel que DashboardPage (tuiles/cartes existantes).
- [ ] **Step 2 — Supervision (admin/manager)** : section « Courtage — Marine » avec les
mêmes chiffres (GET /courtage/dashboard, autorisé manager/admin). Lecture seule.
- [ ] **Step 3 — AdminPage** : (a) select rôle utilisateur : ajouter option
« courtage » ; (b) section « Paramètres courtage » : délai relance (jours), tentatives
max, téléphone Marine, objet du mail, corps du mail (textarea), liste d'exclusion
(texte, séparé par virgules) → GET/PUT /admin/parametres existants (les clés courtage_*
passent par la même mécanique — vérifier que la route accepte des clés nouvelles ;
sinon l'étendre SANS toucher au comportement existant).
- [ ] **Step 4 — Build** ✓ ; **Commit** : `feat(courtage): dashboard Marine + supervision et parametres admin`

---

## Task 5 : Vérif navigateur + NON-RÉGRESSION Chrystelle + déploiement

- [ ] **Step 1 — Tous les tests** (nouveaux + existants) : 0 FAIL partout.
- [ ] **Step 2 — Vérif navigateur (env dev, base /tmp)** :
  (a) Login Marine → écran changement mdp obligatoire → changement → espace courtage.
  (b) Créer fiche → apparaît ; passer sa relance à aujourd'hui (via création avec date
  du jour) → Relances du jour ; « Pas de réponse » ×2 → Injoignable → « Préparer le
  mail » (vérifier le mailto généré : destinataire/objet/corps avec prénom) ; « Relance
  faite » avec commentaire ; statuts ; Ne plus contacter → re-création refusée.
  (c) **NON-RÉGRESSION Chrystelle** : login agent → Session relance intacte (file,
  issues, Mes relances), Contacts, Dashboard. AUCUNE trace du courtage dans sa vue.
  (d) Login admin → Supervision montre la section Courtage ; paramètres courtage
  éditables ; users : Marine visible rôle courtage.
- [ ] **Step 3 — Push + poll prod + vérif prod** : login Marine prod (must_change_password
  =1), données Chrystelle intactes (nb relances/contacts inchangés), dashboard admin OK.

## Garde-fous
- Migration users FK-safe testée sur copie de base AVANT push (reproduire prod).
- Écriture courtage = rôle courtage seul ; lecture élargie admin/manager ; agent = 403.
- Aucune requête des routes contacts/relances existantes modifiée.
- Paramètres modifiables sans redéploiement (table parametres).
