const assert = require('assert')
process.env.DB_PATH = '/tmp/immo-test-suivi-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('dernier-suivi.test.js')

const AGENT = db.prepare("SELECT id FROM users WHERE role='agent'").get().id
const c1 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('AVEC','Relance','0600000001','autre','a_contacter')").run().lastInsertRowid
const c2 = db.prepare("INSERT INTO contacts (nom,prenom,telephone,categorie,statut) VALUES ('SANS','Relance','0600000002','autre','a_contacter')").run().lastInsertRowid

db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now','-2 days'))").run(c1, AGENT, 'contacte', 'vieille note', 'autre')
db.prepare("INSERT INTO relances (contact_id,agent_id,statut,notes,issue,created_at) VALUES (?,?,?,?,?, datetime('now'))").run(c1, AGENT, 'rdv_obtenu', 'derniere note RDV', 'projet')

function listeAvecSuivi() {
  return db.prepare(`
    SELECT contacts.id, contacts.nom,
      dr.issue AS derniere_issue, dr.notes AS derniere_note, dr.created_at AS derniere_relance_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY contacts.id ASC
  `).all()
}

test('contact avec relances -> derniere relance (la plus recente)', () => {
  const rows = listeAvecSuivi()
  const r = rows.find(x => x.id === c1)
  assert.strictEqual(r.derniere_issue, 'projet')
  assert.strictEqual(r.derniere_note, 'derniere note RDV')
  assert.ok(r.derniere_relance_date)
})

test('contact sans relance -> champs null', () => {
  const rows = listeAvecSuivi()
  const r = rows.find(x => x.id === c2)
  assert.strictEqual(r.derniere_issue, null)
  assert.strictEqual(r.derniere_note, null)
  assert.strictEqual(r.derniere_relance_date, null)
})
