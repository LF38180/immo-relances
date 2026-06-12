const assert = require('assert')

// Force une DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-flux-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('flux-appel.test.js')

test('migration : relances a la colonne issue', () => {
  const cols = db.prepare('PRAGMA table_info(relances)').all().map(c => c.name)
  assert.ok(cols.includes('issue'), 'colonne issue absente de relances')
})

test('params : delais semes', () => {
  const r1 = db.prepare("SELECT valeur FROM parametres WHERE cle = 'delai_sans_reponse_jours'").get()
  assert.ok(r1, 'delai_sans_reponse_jours absent')
  assert.strictEqual(r1.valeur, '3')

  const r2 = db.prepare("SELECT valeur FROM parametres WHERE cle = 'relance_sans_projet_jours'").get()
  assert.ok(r2, 'relance_sans_projet_jours absent')
  assert.strictEqual(r2.valeur, '180')
})

test('ISSUE_STATUT : issues mappees sur statuts CHECK-valides', () => {
  const { ISSUE_STATUT } = require('../src/routes/relanceRoutes')
  const ISSUES = ['sans_reponse', 'projet', 'rappel', 'demenage', 'sans_projet', 'autre']
  const STATUTS_VALIDES = ['tente_sans_reponse', 'rdv_obtenu', 'rappel_planifie', 'contacte']
  for (const issue of ISSUES) {
    assert.ok(issue in ISSUE_STATUT, 'issue manquante : ' + issue)
    assert.ok(STATUTS_VALIDES.includes(ISSUE_STATUT[issue]), 'statut invalide pour issue ' + issue + ' : ' + ISSUE_STATUT[issue])
  }
})

test('insert relance avec issue persiste', () => {
  // Inserer un contact minimal
  const cRes = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, categorie, tags, potentiel)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('TestIssue', 'Prenom', '0600000000', 'autre', '[]', 3)
  const contactId = cRes.lastInsertRowid

  // Inserer une relance avec issue
  db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, issue)
    VALUES (?, ?, ?, ?)
  `).run(contactId, 1, 'rdv_obtenu', 'projet')

  const relance = db.prepare('SELECT * FROM relances WHERE contact_id = ?').get(contactId)
  assert.ok(relance, 'relance non trouvee')
  assert.strictEqual(relance.issue, 'projet', 'issue non persistee : ' + relance.issue)
  assert.strictEqual(relance.statut, 'rdv_obtenu', 'statut incorrect')
})
