// Test pur (sans DOM) de formaterNotes. Lance : node client/src/utils/formaterNotes.test.cjs
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { formaterNotes } = require('./formaterNotes.cjs')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('formaterNotes.test.cjs')

test('chaine vide -> []', () => {
  assert.deepStrictEqual(formaterNotes(''), [])
  assert.deepStrictEqual(formaterNotes(null), [])
})

test('note manuelle simple sans libelle -> 1 ligne intacte', () => {
  const r = formaterNotes('Rappeler après 18h, intéressé par le T3')
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].libelle, 'Rappeler après 18h, intéressé par le T3')
  assert.strictEqual(r[0].valeur, null)
})

test('un champ Libelle : valeur -> separe', () => {
  const r = formaterNotes('Négo suiveur : Arthur SARTORELLI')
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].libelle, 'Négo suiveur')
  assert.strictEqual(r[0].valeur, 'Arthur SARTORELLI')
})

test('sous-champs colles -> eclates en lignes distinctes', () => {
  // motif reel Modelo : valeur collee au libelle suivant
  const r = formaterNotes('ID négo suiveur : 6365ID négo créateur : 6365Négo suiveur : Arthur SARTORELLI')
  const libelles = r.map(x => x.libelle)
  assert.ok(libelles.includes('ID négo suiveur'), 'ID négo suiveur manquant : ' + JSON.stringify(libelles))
  assert.ok(libelles.includes('ID négo créateur'), 'ID négo créateur manquant')
  assert.ok(libelles.includes('Négo suiveur'), 'Négo suiveur manquant')
  const idSuiveur = r.find(x => x.libelle === 'ID négo suiveur')
  assert.strictEqual(idSuiveur.valeur, '6365')
})

test('titre de section "Observations bien :" -> section', () => {
  const r = formaterNotes('Observations bien : Négo suiveur : Arthur')
  const sec = r.find(x => x.section)
  assert.ok(sec, 'aucune section detectee')
  assert.strictEqual(sec.libelle, 'Observations bien')
})

test('resume bien en tete (Réf · Prix · m²) -> titre', () => {
  const r = formaterNotes('Réf 1507 · Prix 259 000 € · 69.00 m²')
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].titre, true)
  assert.ok(r[0].libelle.includes('Réf 1507'))
})

test('chaine reelle Réf 1507 -> champs cles eclates', () => {
  const reel = fs.readFileSync(path.join('/tmp/notes-1507.txt'), 'utf8')
  const r = formaterNotes(reel)
  const libelles = r.map(x => x.libelle)
  // Champs clés repérables (numériques ou en début de bloc) : doivent être éclatés.
  // NB : les noms propres ALL-CAPS collés (ex "SARTORELLINégo") restent imparfaits
  //      — ambiguïté Modelo irréductible sans dictionnaire. Objectif = lisibilité,
  //      pas séparation parfaite de chaque nom. Voir limite documentée dans le .cjs.
  for (const l of ['ID négo suiveur', 'Health score', 'date met', 'Statut']) {
    assert.ok(libelles.includes(l), 'champ eclate manquant : ' + l)
  }
  const hs = r.find(x => x.libelle === 'Health score')
  assert.strictEqual(hs.valeur, '52')
  const statut = r.find(x => x.libelle === 'Statut')
  assert.strictEqual(statut.valeur, 'Rencontré')
  // le pavé doit être franchement éclaté (lisibilité)
  assert.ok(r.length >= 25, 'trop peu de lignes : ' + r.length)
  // aucune ligne ne doit rester un pavé géant (> 200 char)
  assert.ok(!r.some(x => (x.libelle || '').length > 200), 'pave residuel non eclate')
})
