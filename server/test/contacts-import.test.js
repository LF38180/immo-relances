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
