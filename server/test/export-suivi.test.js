const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-exp-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('export-suivi.test.js')

const AGENT = db.prepare("SELECT id FROM users WHERE role='agent'").get().id
const c1 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('EXPORTE','Jean','0600000001','autre','a_contacter')").run().lastInsertRowid
db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now'))").run(c1, AGENT, 'rdv_obtenu', 'note de suivi export', 'projet')

function exportRows() {
  return db.prepare(`
    SELECT contacts.*,
      dr.issue AS dernier_suivi_issue, dr.notes AS dernier_suivi_note, dr.created_at AS dernier_suivi_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY contacts.nom
  `).all()
}

test('export inclut le dernier suivi du contact', () => {
  const rows = exportRows()
  const r = rows.find(x => x.id === c1)
  assert.strictEqual(r.dernier_suivi_issue, 'projet')
  assert.strictEqual(r.dernier_suivi_note, 'note de suivi export')
  assert.ok(r.dernier_suivi_date)
})
