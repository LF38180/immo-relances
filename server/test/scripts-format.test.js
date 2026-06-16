const assert = require('assert')

// DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-test-scripts-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('scripts-format.test.js')

test('insert + read conserve le HTML de mise en forme', () => {
  const html = 'Bonjour <b>important</b> puis <i>doux</i> et <u>souligne</u>'
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test format', html, 0)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, html)
})

test('update conserve le HTML', () => {
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test maj', 'avant', 0)
  const html = 'apres <b>gras</b>'
  db.prepare('UPDATE scripts SET contenu = ? WHERE id = ?').run(html, info.lastInsertRowid)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, html)
})

test('texte brut multi-lignes inchange (retrocompat)', () => {
  const brut = 'Ligne 1\nLigne 2\nLigne 3'
  const info = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)')
    .run('autre', 'Test brut', brut, 0)
  const row = db.prepare('SELECT contenu FROM scripts WHERE id = ?').get(info.lastInsertRowid)
  assert.strictEqual(row.contenu, brut)
})
