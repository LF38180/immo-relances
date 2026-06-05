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
