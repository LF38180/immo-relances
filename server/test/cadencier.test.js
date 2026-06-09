const assert = require('assert')

// Force une DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-cadencier-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('cadencier.test.js')

const { parseJalons, estDuCadencier } = require('../src/utils/cadence')

// --- parseJalons ---

test('parseJalons("2,7,15,30") retourne [2,7,15,30]', () => {
  const r = parseJalons('2,7,15,30')
  assert.deepStrictEqual(r, [2, 7, 15, 30])
})

test('parseJalons("") retourne defaut [2,7,15,30]', () => {
  const r = parseJalons('')
  assert.deepStrictEqual(r, [2, 7, 15, 30])
})

test('parseJalons(null) retourne defaut [2,7,15,30]', () => {
  const r = parseJalons(null)
  assert.deepStrictEqual(r, [2, 7, 15, 30])
})

test('parseJalons("0,3") retourne [0,3]', () => {
  const r = parseJalons('0,3')
  assert.deepStrictEqual(r, [0, 3])
})

// --- estDuCadencier ---

// Dates fixes pour les tests
// today = '2026-06-09'
// estimation J-3 = '2026-06-06' → jalon 2 jours → echeance = '2026-06-08' <= today → du
test('estDuCadencier : estimation J-3, etape 0, jalon 2j → du (true)', () => {
  const contact = { date_estimation: '2026-06-06', cadence_etape: 0, mandat_signe: 0, statut: 'a_contacter' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), true)
})

// estimation aujourd'hui, jalon 2j → echeance = '2026-06-11' > today → pas encore du
test('estDuCadencier : estimation aujourd\'hui, jalon 2j → pas encore du (false)', () => {
  const contact = { date_estimation: '2026-06-09', cadence_etape: 0, mandat_signe: 0, statut: 'a_contacter' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// mandat_signe = 1 → false
test('estDuCadencier : mandat_signe=1 → false', () => {
  const contact = { date_estimation: '2026-06-01', cadence_etape: 0, mandat_signe: 1, statut: 'rdv_obtenu' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// etape >= nb jalons → false
test('estDuCadencier : etape >= nb jalons → false', () => {
  const contact = { date_estimation: '2026-06-01', cadence_etape: 4, mandat_signe: 0, statut: 'a_contacter' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// pas de date_estimation → false
test('estDuCadencier : pas de date_estimation → false', () => {
  const contact = { date_estimation: null, cadence_etape: 0, mandat_signe: 0, statut: 'a_contacter' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// statut pas_interesse → false
test('estDuCadencier : statut pas_interesse → false', () => {
  const contact = { date_estimation: '2026-06-01', cadence_etape: 0, mandat_signe: 0, statut: 'pas_interesse' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// statut inactif → false
test('estDuCadencier : statut inactif → false', () => {
  const contact = { date_estimation: '2026-06-01', cadence_etape: 0, mandat_signe: 0, statut: 'inactif' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), false)
})

// echeance = exactement today → du (borne inclusive)
test('estDuCadencier : echeance exactement today → du (true)', () => {
  // estimation J-2, jalon 2j → echeance = today
  const contact = { date_estimation: '2026-06-07', cadence_etape: 0, mandat_signe: 0, statut: 'a_contacter' }
  const jalons = [2, 7, 15, 30]
  const today = '2026-06-09'
  assert.strictEqual(estDuCadencier(contact, jalons, today), true)
})

// --- Migration DB ---

test('migration ajoute cadence_etape', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('cadence_etape'), 'cadence_etape absente')
})

test('migration ajoute mandat_signe', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('mandat_signe'), 'mandat_signe absente')
})

test('seed cadence_estimation_jours present', () => {
  const row = db.prepare("SELECT valeur FROM parametres WHERE cle = 'cadence_estimation_jours'").get()
  assert.ok(row, 'parametre cadence_estimation_jours absent')
  assert.strictEqual(row.valeur, '2,7,15,30')
})

test('cadence_etape defaut = 0', () => {
  const r = db.prepare(`INSERT INTO contacts (nom) VALUES ('TestCadence')`).run()
  const c = db.prepare('SELECT cadence_etape, mandat_signe FROM contacts WHERE id = ?').get(r.lastInsertRowid)
  assert.strictEqual(c.cadence_etape, 0)
  assert.strictEqual(c.mandat_signe, 0)
})
