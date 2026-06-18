const assert = require('assert')
const { labelDateContact } = require('./labelDateContact.cjs')
function test(n, fn){ try{ fn(); console.log('  OK  '+n) } catch(e){ console.error('  FAIL '+n+' : '+e.message); process.exitCode=1 } }
console.log('labelDateContact.test.cjs')
test('RDV obtenu -> Date du rendez-vous', () => { assert.strictEqual(labelDateContact('rdv_obtenu'), 'Date du rendez-vous') })
test('rappel_planifie -> Date de rappel', () => { assert.strictEqual(labelDateContact('rappel_planifie'), 'Date de rappel') })
test('a_recontacter -> Date de rappel', () => { assert.strictEqual(labelDateContact('a_recontacter'), 'Date de rappel') })
test('autre statut -> Prochain contact', () => {
  assert.strictEqual(labelDateContact('a_contacter'), 'Prochain contact')
  assert.strictEqual(labelDateContact('tente_sans_reponse'), 'Prochain contact')
  assert.strictEqual(labelDateContact(null), 'Prochain contact')
})
