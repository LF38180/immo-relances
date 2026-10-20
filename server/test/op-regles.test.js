// Les règles d'appel de l'opération anciens clients.
//
// Elles avertissent sans bloquer (décision du 20 octobre) : ce qui est testé
// ici, c'est que l'agent est correctement RENSEIGNÉ — le bon avertissement, au
// bon moment, et aucun quand tout va bien. Un faux avertissement use autant
// qu'un avertissement manquant.
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

// --- Les avertissements ----------------------------------------------------
const ouvert = d('2026-10-20', 11);
const libre = { stop_telephone: 0, stop_mail: 0, email: 'x@y.fr' };
const codes = (c, n, qd) => R.avertissementsAppel(c, n, qd).map(a => a.code);

t('contact ordinaire en pleine plage : aucun avertissement', () => {
  assert.deepStrictEqual(codes(libre, 0, ouvert), []);
});
t('personne opposée : avertissement grave', () => {
  const av = R.avertissementsAppel({ ...libre, stop_telephone: 1 }, 0, ouvert);
  assert.deepStrictEqual(av.map(a => a.code), ['OPPOSITION']);
  assert.strictEqual(av[0].niveau, 'grave');
});
t('3 appels ce mois : rien à signaler', () => assert.deepStrictEqual(codes(libre, 3, ouvert), []));
t('4 appels ce mois : plafond signalé', () => {
  const av = R.avertissementsAppel(libre, 4, ouvert);
  assert.deepStrictEqual(av.map(a => a.code), ['PLAFOND']);
  assert.strictEqual(av[0].niveau, 'grave');
  assert.ok(/4 appels/.test(av[0].texte), av[0].texte);
});
t('hors plage : signalé en attention, pas en grave', () => {
  const av = R.avertissementsAppel(libre, 0, d('2026-10-20', 22));
  assert.deepStrictEqual(av.map(a => a.code), ['HORS_PLAGE']);
  assert.strictEqual(av[0].niveau, 'attention');
});
t('plusieurs problèmes : tous signalés, le plus grave en premier', () => {
  const av = R.avertissementsAppel({ ...libre, stop_telephone: 1 }, 5, d('2026-10-20', 22));
  assert.deepStrictEqual(av.map(a => a.code), ['OPPOSITION', 'PLAFOND', 'HORS_PLAGE']);
  assert.strictEqual(av[0].niveau, 'grave');
});
t('un appel hors cadre est reconnu comme tel', () => {
  assert.strictEqual(R.horsCadre(R.avertissementsAppel(libre, 0, ouvert)), false);
  assert.strictEqual(R.horsCadre(R.avertissementsAppel(libre, 0, d('2026-10-20', 22))), true);
  assert.strictEqual(R.horsCadre(R.avertissementsAppel({ ...libre, stop_telephone: 1 }, 0, ouvert)), true);
});

// --- Mail ------------------------------------------------------------------
const codesMail = (c) => R.avertissementsMail(c).map(a => a.code);
t('mail ordinaire : rien à signaler', () => assert.deepStrictEqual(codesMail(libre), []));
t('opposition mail : signalée', () => assert.deepStrictEqual(codesMail({ ...libre, stop_mail: 1 }), ['OPPOSITION_MAIL']));
t('sans adresse mail : signalé', () => assert.deepStrictEqual(codesMail({ ...libre, email: '' }), ['SANS_MAIL']));

// --- Mois civil ------------------------------------------------------------
t('mois courant au bon format', () => assert.strictEqual(R.moisCourant(d('2026-10-20', 11)), '2026-10'));
t('jour local ne bascule pas en UTC le soir', () => {
  assert.strictEqual(R.jourLocal(d('2026-10-20', 23, 30)), '2026-10-20');
});
