// Test pur (sans DOM) de contientHtml. Lance : node client/src/utils/scriptContenu.test.cjs
const assert = require('assert')
const { contientHtml } = require('./scriptContenu.cjs')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('scriptContenu.test.cjs')

test('texte brut multi-lignes -> pas de HTML', () => {
  assert.strictEqual(contientHtml('Bonjour [Prénom],\nComment allez-vous ?'), false)
})

test('contenu avec <b> -> HTML', () => {
  assert.strictEqual(contientHtml('Bonjour <b>important</b>'), true)
})

test('contenu avec <br> -> HTML', () => {
  assert.strictEqual(contientHtml('ligne1<br>ligne2'), true)
})

test('chaine vide -> pas de HTML', () => {
  assert.strictEqual(contientHtml(''), false)
})

test('texte avec < seul (math) -> pas de HTML', () => {
  assert.strictEqual(contientHtml('si x < 3 alors'), false)
})

test('balise tronquee en fin de chaine (<b) -> HTML', () => {
  assert.strictEqual(contientHtml('texte coupe <b'), true)
})
