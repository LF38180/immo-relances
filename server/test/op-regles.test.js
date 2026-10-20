// Les règles légales de l'opération anciens clients. Elles sont testées en
// premier parce qu'une erreur ici est une infraction, pas un bug d'affichage.
const assert = require('assert');
const R = require('../src/utils/opRegles');

console.log('op-regles.test.js');
const t = (n, fn) => { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); process.exitCode = 1 } };

// Les dates sont construites en heure locale, comme le fait le serveur.
const d = (iso, h, m = 0) => { const [a, mo, j] = iso.split('-').map(Number); return new Date(a, mo - 1, j, h, m) };

// --- Plages horaires -------------------------------------------------------
// 2026-10-20 est un mardi ordinaire.
t('10h00 pile : autorisé', () => assert.ok(R.plageAppelOk(d('2026-10-20', 10)).ok));
t('09h59 : refusé', () => assert.ok(!R.plageAppelOk(d('2026-10-20', 9, 59)).ok));
t('12h59 : autorisé', () => assert.ok(R.plageAppelOk(d('2026-10-20', 12, 59)).ok));
t('13h00 : refusé (coupure déjeuner)', () => assert.ok(!R.plageAppelOk(d('2026-10-20', 13)).ok));
t('13h30 : refusé', () => assert.ok(!R.plageAppelOk(d('2026-10-20', 13, 30)).ok));
t('14h00 : autorisé', () => assert.ok(R.plageAppelOk(d('2026-10-20', 14)).ok));
t('19h59 : autorisé', () => assert.ok(R.plageAppelOk(d('2026-10-20', 19, 59)).ok));
t('20h00 : refusé', () => assert.ok(!R.plageAppelOk(d('2026-10-20', 20)).ok));

// --- Week-end --------------------------------------------------------------
t('samedi 11h : refusé', () => assert.ok(!R.plageAppelOk(d('2026-10-24', 11)).ok));
t('dimanche 11h : refusé', () => assert.ok(!R.plageAppelOk(d('2026-10-25', 11)).ok));

// --- Jours fériés ----------------------------------------------------------
t('1er novembre : refusé', () => assert.ok(!R.plageAppelOk(d('2026-11-01', 11)).ok));
t('11 novembre : refusé', () => assert.ok(!R.plageAppelOk(d('2026-11-11', 11)).ok));
t('25 décembre : refusé', () => assert.ok(!R.plageAppelOk(d('2026-12-25', 11)).ok));
t('Pâques 2026 calculé juste', () => {
  // Dimanche de Pâques 2026 : 5 avril. Lundi de Pâques : 6 avril.
  assert.ok(R.feries(2026).has('2026-04-06'), 'lundi de Pâques absent');
  assert.ok(R.feries(2026).has('2026-05-14'), 'Ascension absente');   // 5 avril + 39 j
  assert.ok(R.feries(2026).has('2026-05-25'), 'Pentecôte absente');   // 5 avril + 50 j
});
t('Pâques 2027 calculé juste', () => {
  // Dimanche de Pâques 2027 : 28 mars.
  assert.ok(R.feries(2027).has('2027-03-29'), 'lundi de Pâques 2027 absent');
});

// --- Les trois blocages ----------------------------------------------------
const ouvert = d('2026-10-20', 11);
const libre = { stop_telephone: 0, stop_mail: 0, email: 'x@y.fr' };

t('contact ordinaire en pleine plage : autorisé', () => {
  assert.ok(R.appelAutorise(libre, 0, ouvert).ok);
});
t('stop téléphone : refusé même en pleine plage', () => {
  const r = R.appelAutorise({ ...libre, stop_telephone: 1 }, 0, ouvert);
  assert.ok(!r.ok); assert.ok(r.definitif, 'le refus doit être marqué définitif');
});
t('3 appels ce mois : encore autorisé', () => assert.ok(R.appelAutorise(libre, 3, ouvert).ok));
t('4 appels ce mois : refusé (plafond légal)', () => {
  const r = R.appelAutorise(libre, 4, ouvert);
  assert.ok(!r.ok); assert.ok(/[Pp]lafond/.test(r.raison));
});
t('5 appels : refusé aussi', () => assert.ok(!R.appelAutorise(libre, 5, ouvert).ok));
t('stop téléphone prime sur la plage horaire', () => {
  // Hors plage ET stop : le message doit parler de l'opposition, pas de l'heure.
  const r = R.appelAutorise({ ...libre, stop_telephone: 1 }, 0, d('2026-10-20', 22));
  assert.ok(!r.ok); assert.ok(/oppos/.test(r.raison), 'message attendu : opposition, reçu : ' + r.raison);
});

// --- Mail ------------------------------------------------------------------
t('mail ordinaire : autorisé', () => assert.ok(R.mailAutorise(libre).ok));
t('stop mail : refusé', () => assert.ok(!R.mailAutorise({ ...libre, stop_mail: 1 }).ok));
t('sans adresse mail : refusé', () => assert.ok(!R.mailAutorise({ ...libre, email: '' }).ok));

// --- Mois civil ------------------------------------------------------------
t('mois courant au bon format', () => assert.strictEqual(R.moisCourant(d('2026-10-20', 11)), '2026-10'));
t('jour local ne bascule pas en UTC le soir', () => {
  assert.strictEqual(R.jourLocal(d('2026-10-20', 23, 30)), '2026-10-20');
});
