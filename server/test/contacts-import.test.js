const assert = require('assert')

// Force une DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-test-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('contacts-import.test.js')

test('migration ajoute date_estimation et photo_url', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('date_estimation'), 'date_estimation absente')
  assert.ok(cols.includes('photo_url'), 'photo_url absente')
})

const { normaliserDate } = require('../src/utils/import-helpers')

test('normaliserDate ISO inchangée', () => {
  assert.strictEqual(normaliserDate('2026-01-15'), '2026-01-15')
})
test('normaliserDate jj/mm/aaaa', () => {
  assert.strictEqual(normaliserDate('15/01/2026'), '2026-01-15')
})
test('normaliserDate jj-mm-aaaa', () => {
  assert.strictEqual(normaliserDate('15-01-2026'), '2026-01-15')
})
test('normaliserDate serie Excel', () => {
  // 45000 = 2023-03-15 (epoch Excel 1899-12-30)
  assert.strictEqual(normaliserDate(45000), '2023-03-15')
  assert.strictEqual(normaliserDate('45000'), '2023-03-15')
})
test('normaliserDate illisible -> null', () => {
  assert.strictEqual(normaliserDate('pas une date'), null)
  assert.strictEqual(normaliserDate(''), null)
  assert.strictEqual(normaliserDate(null), null)
})

const { resoudreConseiller } = require('../src/utils/import-helpers')

const USERS = [
  { id: 1, nom: 'Dupont', prenom: 'Marie', email: 'marie@x.com' },
  { id: 2, nom: 'Martin', prenom: 'Pierre', email: 'pierre@x.com' },
]

test('resoudreConseiller prenom nom', () => {
  assert.strictEqual(resoudreConseiller('Marie Dupont', USERS), 1)
})
test('resoudreConseiller nom prenom', () => {
  assert.strictEqual(resoudreConseiller('Dupont Marie', USERS), 1)
})
test('resoudreConseiller insensible casse + accents', () => {
  assert.strictEqual(resoudreConseiller('  PÏERRE  martin ', USERS), 2)
})
test('resoudreConseiller par email', () => {
  assert.strictEqual(resoudreConseiller('marie@x.com', USERS), 1)
})
test('resoudreConseiller no-match -> null', () => {
  assert.strictEqual(resoudreConseiller('Inconnu Personne', USERS), null)
  assert.strictEqual(resoudreConseiller('', USERS), null)
})

const { importerContacts } = require('../src/routes/contactRoutes')

test('importerContacts : source colonne, conseiller, date normalisée', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([
    { nom: 'Test1', source: 'site web', conseiller: 'Marie Dupont', date_estimation: '15/01/2026' },
    { nom: 'Test2' }, // pas de source -> fallback import_csv
    { nom: 'Test3', conseiller: 'Inconnu Personne', date_estimation: 'nimporte' },
  ], users)

  assert.strictEqual(r.importes, 3)
  assert.strictEqual(r.conseillers_non_reconnus, 1)
  assert.strictEqual(r.dates_ignorees, 1)

  const c1 = db.prepare("SELECT * FROM contacts WHERE nom='Test1'").get()
  assert.strictEqual(c1.source_import, 'site web')
  assert.ok(c1.assigned_to != null, 'conseiller Marie non résolu')
  assert.strictEqual(c1.date_estimation, '2026-01-15')

  const c2 = db.prepare("SELECT * FROM contacts WHERE nom='Test2'").get()
  assert.strictEqual(c2.source_import, 'import_csv')
})
