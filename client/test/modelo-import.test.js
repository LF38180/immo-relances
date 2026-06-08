import assert from 'assert'
import { detecterFormat, splitNomComplet, categorieModelo } from '../src/utils/modelo-import.js'

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}
console.log('modelo-import.test.js')

test('detecterFormat BIEN', () => {
  assert.strictEqual(detecterFormat(['Référence', 'Titre', 'Prix de vente', 'Suivi par']), 'bien')
})
test('detecterFormat CONTACT', () => {
  assert.strictEqual(detecterFormat(['Nom', 'Prénom', 'Tél. port.', 'Suivi par']), 'contact')
})
test('detecterFormat fichier quelconque -> contact (défaut)', () => {
  assert.strictEqual(detecterFormat(['nom', 'email', 'tel']), 'contact')
})

test('splitNomComplet retire civilité', () => {
  assert.deepStrictEqual(splitNomComplet('M. Michaël MERCYANO'), { prenom: 'Michaël', nom: 'MERCYANO' })
  assert.deepStrictEqual(splitNomComplet('Mme Marie Claire DURAND'), { prenom: 'Marie', nom: 'Claire DURAND' })
  assert.deepStrictEqual(splitNomComplet('DUPONT'), { prenom: '', nom: 'DUPONT' })
  assert.deepStrictEqual(splitNomComplet(''), { prenom: '', nom: '' })
})

test('categorieModelo mappe les libellés', () => {
  assert.strictEqual(categorieModelo('Prospect Acquéreur '), 'acquereur')
  assert.strictEqual(categorieModelo('Vendeur'), 'vendeur')
  assert.strictEqual(categorieModelo('Ancien client'), 'ancien_client')
  assert.strictEqual(categorieModelo('truc inconnu'), 'autre')
})
