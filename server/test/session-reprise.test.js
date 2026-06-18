const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-reprise-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('session-reprise.test.js')

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
  // Format YYYY-MM-DD HH:MM:SS (UTC) pour correspondre au format created_at de SQLite
  // Les endpoints stockent ce format ; on l'utilise ici pour que la comparaison de chaînes soit cohérente.
  setCloture(AGENT, new Date().toISOString().slice(0,19).replace('T',' '))
  const s = sessionCourante(AGENT)
  assert.strictEqual(s.length, 0, 'devrait etre vide juste apres cloture')
})

test('nouvelle relance apres cloture reapparait', () => {
  db.prepare("INSERT INTO relances (contact_id, agent_id, statut, notes, issue, created_at) VALUES (?,?,?,?,?, datetime('now','+1 minute'))")
    .run(c1, AGENT, 'contacte', 'apres cloture', 'autre')
  const s = sessionCourante(AGENT)
  assert.strictEqual(s.length, 1)
  assert.strictEqual(s[0].notes, 'apres cloture')
})
