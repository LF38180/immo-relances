import assert from 'assert'
import { detecterFormat, splitNomComplet, categorieModelo, bienVersContact } from '../src/utils/modelo-import.js'

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

const ROW_BIEN = {
  'Référence': 'TZ-8426', 'Type de mandat': 'Simple ', 'Prix de vente': '250 000  €',
  'Surface': '143.00 m²', 'Classe DPE': 'B',
  'Nom, Prenom': 'M. Michaël MERCYANO', 'E-mail': 'm@x.com',
  'Tél. port.': '0651663663', 'Tél. fixe': '',
  'Adresse_1': '615 Bd Lepic', 'Code postal_1': '73100', 'Commune_1': 'Aix-les-Bains',
  'Suivi par': 'Tara ZOPPAS', 'Création': '30-05-2026', 'Photo principale': '',
}

test('bienVersContact extrait le propriétaire', () => {
  const c = bienVersContact(ROW_BIEN)
  assert.strictEqual(c.prenom, 'Michaël')
  assert.strictEqual(c.nom, 'MERCYANO')
  assert.strictEqual(c.email, 'm@x.com')
  assert.strictEqual(c.telephone, '0651663663')
  assert.strictEqual(c.adresse, '615 Bd Lepic')
  assert.strictEqual(c.code_postal, '73100')
  assert.strictEqual(c.ville, 'Aix-les-Bains')
  assert.strictEqual(c.conseiller, 'Tara ZOPPAS')
  assert.strictEqual(c.date_estimation, '30-05-2026')
  assert.strictEqual(c.categorie, 'vendeur')
  assert.ok(c.source.startsWith('Mandat'))
  assert.ok(c.source.includes('TZ-8426'))
  assert.ok(c.notes.includes('TZ-8426'))
  assert.ok(c.notes.includes('143.00 m²'))
  assert.ok(c.notes.includes('DPE B'))
})

test('bienVersContact gère prix vide / champs manquants', () => {
  const c = bienVersContact({ 'Référence': 'X-1', 'Prix de vente': '0  €', 'Nom, Prenom': 'DURAND' })
  assert.strictEqual(c.nom, 'DURAND')
  assert.ok(c.notes.includes('X-1'))
  assert.ok(!c.notes.includes('Prix'))
})
