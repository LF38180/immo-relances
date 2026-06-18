# Reprise de session après fermeture — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** À la réouverture de la session d'appel après fermeture inopinée, restaurer le récap accumulé (actions + stats) ; "Fin de session" clôture et repart à vide.

**Architecture:** Marqueur de clôture par agent dans `parametres`. 2 endpoints serveur (clôturer, récap session courante). SessionPage reconstruit le récap au montage et clôture au "Fin de session". `file-relances` inchangé (exclut déjà les traités).

**Tech Stack:** Express + better-sqlite3, React. Tests = node.

Spec : `docs/superpowers/specs/2026-06-18-reprise-session-design.md`

---

## Task 1 : Endpoints serveur (clôture + récap session courante)

**Files:**
- Modify: `server/src/routes/relanceRoutes.js`
- Test: `server/test/session-reprise.test.js`

Contexte (vérifié) : `relanceRoutes.js` commence par `require` express/db/auth puis
`router.use(requireAuth)`. La table `relances` a les colonnes `contact_id,
agent_id, statut, notes, issue, created_at`. `parametres(cle, valeur)` existe.
Mapping stats : issue 'projet' = rdv ; 'sans_reponse' = pasRep ; autres issues
non-nulles = contactes.

- [ ] **Step 1: Écrire le test serveur (échoue)**

Créer `server/test/session-reprise.test.js` :

```js
const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-reprise-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('session-reprise.test.js')

// Helpers reproduisant la logique des endpoints (test unitaire de la requête).
const AGENT = db.prepare("SELECT id FROM users WHERE role='agent'").get().id
const c1 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('A','Un','0600000001','autre','a_contacter')").run().lastInsertRowid
const c2 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('B','Deux','0600000002','autre','a_contacter')").run().lastInsertRowid

function poserRelance(cid, issue, notes) {
  db.prepare("INSERT INTO relances (contact_id, agent_id, statut, notes, issue) VALUES (?,?,?,?,?)")
    .run(cid, AGENT, issue === 'sans_reponse' ? 'tente_sans_reponse' : 'contacte', notes || null, issue)
}
function getCloture(agentId) {
  const r = db.prepare("SELECT valeur FROM parametres WHERE cle = ?").get('session_cloturee_' + agentId)
  return r ? r.valeur : null
}
function setCloture(agentId, iso) {
  db.prepare("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)").run('session_cloturee_' + agentId, iso)
}
// requête "session courante" : relances de l'agent après clôture (ou toutes si null)
function sessionCourante(agentId) {
  const cloture = getCloture(agentId)
  const where = cloture ? 'AND r.created_at > ?' : ''
  const params = cloture ? [agentId, cloture] : [agentId]
  return db.prepare(`
    SELECT r.issue, r.notes, c.nom, c.prenom, c.telephone
    FROM relances r JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ? ${where} ORDER BY r.created_at ASC
  `).all(...params)
}

test('session courante renvoie les relances posees', () => {
  poserRelance(c1, 'projet', 'rdv ok')
  poserRelance(c2, 'sans_reponse', '')
  const s = sessionCourante(AGENT)
  assert.strictEqual(s.length, 2)
  assert.strictEqual(s[0].issue, 'projet')
})

test('apres cloture, session courante est vide', () => {
  setCloture(AGENT, new Date().toISOString())
  // petite pause logique : nouvelle relance APRES cloture
  const s = sessionCourante(AGENT)
  assert.strictEqual(s.length, 0, 'devrait etre vide juste apres cloture')
})

test('nouvelle relance apres cloture reapparait', () => {
  // created_at = now > cloture posee a l instant ? On force un created_at futur pour fiabilite.
  db.prepare("INSERT INTO relances (contact_id, agent_id, statut, notes, issue, created_at) VALUES (?,?,?,?,?, datetime('now','+1 minute'))")
    .run(c1, AGENT, 'contacte', 'apres cloture', 'autre')
  const s = sessionCourante(AGENT)
  assert.strictEqual(s.length, 1)
  assert.strictEqual(s[0].notes, 'apres cloture')
})
```

- [ ] **Step 2: Lancer -> FAIL** (puis PASS — c'est un test de la requête, pas de l'endpoint HTTP)

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/session-reprise.test.js`
Expected : 3 OK (le test valide la LOGIQUE SQL ; il passe dès création car il réimplémente la requête). C'est un garde-fou sur le comportement attendu de la requête que les endpoints utiliseront. Si un test échoue, la logique SQL est fausse — corriger avant d'écrire les endpoints.

- [ ] **Step 3: Ajouter les 2 endpoints dans relanceRoutes.js**

Dans `server/src/routes/relanceRoutes.js`, juste avant `module.exports = router;`, ajouter :

```js
// --- Reprise de session ---

// Début de journée locale Europe/Paris, exprimé en UTC (borne basse si aucune clôture).
function debutJourneeParisUtc() {
  const dateParis = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); // YYYY-MM-DD
  const midi = new Date(`${dateParis}T12:00:00Z`);
  const hParis = parseInt(midi.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' }), 10);
  const offsetMin = (hParis - 12) * 60;
  const [Y, M, D] = dateParis.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, 0, 0, 0) - offsetMin * 60000).toISOString().slice(0, 19).replace('T', ' ');
}

// Clôture la session courante de l'agent (marqueur = maintenant, UTC).
router.post('/cloturer-session', (req, res) => {
  const cle = 'session_cloturee_' + req.user.id;
  const iso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)').run(cle, iso);
  res.json({ ok: true, cloture: iso });
});

// Récap de la session courante : relances de l'agent depuis la dernière clôture
// (ou depuis le début de journée Paris si aucune clôture).
router.get('/session-courante', (req, res) => {
  const cle = 'session_cloturee_' + req.user.id;
  const row = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  const borne = row?.valeur || debutJourneeParisUtc();
  const relances = db.prepare(`
    SELECT r.issue, r.notes, c.nom, c.prenom, c.telephone
    FROM relances r JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ? AND r.created_at > ?
    ORDER BY r.created_at ASC
  `).all(req.user.id, borne);
  const actions = relances.map(r => ({
    nom: r.nom, prenom: r.prenom, telephone: r.telephone,
    statut: r.issue || 'contacte', notes: r.notes || '',
  }));
  const stats = {
    total: actions.length,
    rdv: actions.filter(a => a.statut === 'projet').length,
    contactes: actions.filter(a => !['projet', 'sans_reponse'].includes(a.statut)).length,
    pasRep: actions.filter(a => a.statut === 'sans_reponse').length,
  };
  res.json({ actions, stats, borne });
});
```

- [ ] **Step 4: Relancer le test (garde-fou logique)**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && JWT_SECRET=dev node server/test/session-reprise.test.js`
Expected: 3 OK.

- [ ] **Step 5: Vérif manuelle des endpoints (HTTP)**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
rm -f /tmp/immo-ep.db
DB_PATH=/tmp/immo-ep.db JWT_SECRET=dev PORT=3001 node server/src/index.js > /tmp/ep.log 2>&1 &
sleep 2
BASE=http://localhost:3001
T=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')
curl -s "$BASE/api/relances/session-courante" -H "Authorization: Bearer $T"
echo ""
curl -s -X POST "$BASE/api/relances/cloturer-session" -H "Authorization: Bearer $T"
echo ""
lsof -tiTCP:3001 -sTCP:LISTEN | xargs kill 2>/dev/null; rm -f /tmp/immo-ep.db
```
Expected: 1er appel renvoie `{"actions":[],"stats":{...},"borne":"..."}`. 2e renvoie `{"ok":true,"cloture":"..."}`.

- [ ] **Step 6: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add server/src/routes/relanceRoutes.js server/test/session-reprise.test.js
git commit -m "feat(session): endpoints cloturer-session + session-courante (reprise)"
```

---

## Task 2 : SessionPage — reconstruire le récap au montage

**Files:**
- Modify: `client/src/pages/SessionPage.jsx`

Contexte : `loadFile()` (vers ligne 62) charge la file. `useEffect(() => { loadFile() }, [])`
(ligne 74). États : `setActionsSession`, `setSessionStats` existent.

- [ ] **Step 1: Charger le récap courant au montage**

Remplacer :

```js
  useEffect(() => { loadFile() }, [])
```

par :

```js
  useEffect(() => {
    loadFile()
    // Restaure le récap de la session courante (après une fermeture inopinée).
    api.get('/relances/session-courante')
      .then(r => {
        if (r.data?.actions?.length) {
          setActionsSession(r.data.actions)
          setSessionStats(r.data.stats)
        }
      })
      .catch(() => {})
  }, [])
```

- [ ] **Step 2: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/SessionPage.jsx
git commit -m "feat(session): restaure le recap au montage (reprise apres fermeture)"
```

---

## Task 3 : SessionPage — clôturer à "Fin de session"

**Files:**
- Modify: `client/src/pages/SessionPage.jsx`

Contexte : fonction `telecharger` (vers ligne 48) génère le PDF. Il faut, après
génération réussie, clôturer côté serveur et remettre l'état à zéro.

- [ ] **Step 1: Clôturer après génération du récap**

Remplacer la fonction `telecharger` :

```js
  const telecharger = async () => {
    if (actionsSession.length === 0) { toast.error('Aucune action a exporter pour le moment'); return }
    const now = new Date()
    const dateLabel = format(now, 'dd/MM/yyyy HH:mm')
    const dateFichier = format(now, 'yyyy-MM-dd-HHmm')
    try {
      await genererRecapPdf(actionsSession, {
        agent: user ? `${user.prenom} ${user.nom}` : '',
        dateLabel, dateFichier,
        stats: sessionStats,
      })
    } catch { toast.error('Erreur generation du recap') }
  }
```

par :

```js
  const telecharger = async () => {
    if (actionsSession.length === 0) { toast.error('Aucune action a exporter pour le moment'); return }
    const now = new Date()
    const dateLabel = format(now, 'dd/MM/yyyy HH:mm')
    const dateFichier = format(now, 'yyyy-MM-dd-HHmm')
    try {
      await genererRecapPdf(actionsSession, {
        agent: user ? `${user.prenom} ${user.nom}` : '',
        dateLabel, dateFichier,
        stats: sessionStats,
      })
      // Clôture la session : repart à vide à la prochaine ouverture.
      await api.post('/relances/cloturer-session')
      setActionsSession([])
      setSessionStats({ total: 0, rdv: 0, contactes: 0, pasRep: 0 })
      setDone(false)
      loadFile()
    } catch { toast.error('Erreur generation du recap') }
  }
```

- [ ] **Step 2: Build**

Run: `cd /Users/loickferrucci/Desktop/immo-relances && npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-relances
git add client/src/pages/SessionPage.jsx
git commit -m "feat(session): cloture la session apres telechargement du recap"
```

---

## Task 4 : Vérif navigateur + déploiement

- [ ] **Step 1: Vérif live (backend 3001 + vite 5180, contacts seedés)**

Scénarios :
1. Login agent, Session : traiter 2-3 contacts (issues variées). Vérifier les compteurs récap.
2. **Recharger la page (F5)** → le récap doit être restauré (mêmes compteurs + lignes), la file reprend sans les traités.
3. Cliquer "Fin de session et télécharger récap" → PDF généré. **Recharger** → session vierge (récap à 0).
4. Traiter un nouveau contact après clôture → il apparaît dans le nouveau récap.

- [ ] **Step 2: Push + poll**

Capturer `ls -1 client/dist/assets/index-*.js`, push main, poller la prod jusqu'au nouveau chunk. (Si seul le serveur change sur un commit, poller via une signature endpoint.)

- [ ] **Step 3: Vérif prod légère**

Login agent en prod, Session, traiter 1 contact, recharger → récap restauré. (Ne pas polluer : supprimer la relance test ou utiliser un compte de test si possible. Sinon traiter un contact réel avec une note neutre puis laisser — la donnée est légitime.)

---

## Notes

- `file-relances` inchangé (exclut déjà les traités — vérifié).
- Marqueur de clôture dans `parametres` (clé par agent) — pas de migration.
- Bornage Paris pour la borne basse quand aucune clôture (cohérent avec endpoint relances-jour).
- Limite acceptée : un appel saisi mais non soumis avant fermeture reste perdu (le contact reste dans la file, refaisable).
