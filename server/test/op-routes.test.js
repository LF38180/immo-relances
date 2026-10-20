// Routes de l'opération anciens clients, exercées par HTTP.
//
// Les règles d'appel avertissent sans bloquer (décision du 20 octobre). Ce qui
// est vérifié ici : l'appel passe toujours, l'agent est renseigné, et tout
// appel hors cadre laisse une trace horodatée. Le cloisonnement entre
// conseillers, lui, reste une vraie barrière.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const tmp = path.join(os.tmpdir(), 'op-routes-test-' + Date.now() + '.db');
const PORT = 4877;
const SECRET = 'dev';

const CSV = '/Users/loickferrucci/Downloads/anciens_clients_import.csv';
if (!fs.existsSync(CSV)) { console.log('op-routes.test.js\n  -- fichier source absent'); process.exit(0); }

// Prépare la base avant de lancer le serveur.
process.env.DB_PATH = tmp;
{
  const { db } = require('../src/database');
  require('../src/utils/opImport').importer(fs.readFileSync(CSV, 'utf8'), { motDePasseProvisoire: 'x' });
  db.close();
}

const jwt = require('jsonwebtoken');
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: SECRET, DB_PATH: tmp, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));

const base = `http://127.0.0.1:${PORT}/api`;
const call = (m, p, tok, body) => fetch(base + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

console.log('op-routes.test.js');
let echecs = 0;
const t = (n, fn) => { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); echecs++ } };

(async () => {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/health'); if (r.ok) break } catch {}
    await new Promise(r => setTimeout(r, 150));
  }

  const Database = require('better-sqlite3');
  const db = new Database(tmp);
  const u = (email) => db.prepare('SELECT id, role, email FROM users WHERE LOWER(email)=?').get(email);

  const tara = u('tara.zoppas@lequai-immobilier.com');
  const gilles = u('gilles.borghin@lequai-immobilier.com');
  const tok = (x) => jwt.sign({ id: x.id, role: x.role, email: x.email }, SECRET, { expiresIn: '1h' });
  const tTara = tok(tara), tGilles = tok(gilles);
  const tAdmin = tok(u('admin@lequai-immobilier.com'));

  // Gilles devient manager de Saint-Égrève : c'est le cas que Loïck veut.
  db.prepare("UPDATE users SET role='manager', agence=? WHERE id=?")
    .run("LE QUAI DE L'IMMOBILIER - SAINT ÉGRÈVE", gilles.id);
  const tGillesMgr = jwt.sign({ id: gilles.id, role: 'manager', email: gilles.email }, SECRET, { expiresIn: '1h' });

  // --- Cloisonnement ------------------------------------------------------
  let r = await call('GET', '/operation/file', tTara);
  t('un conseiller voit sa file', () => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.compteurs.portefeuille, 149 - 0, 'portefeuille : ' + r.body.compteurs.portefeuille);
  });

  const fileTara = r.body.file;
  t('la file ne contient que ses contacts', () => {
    assert.ok(fileTara.every(c => c.conseiller === 'Tara ZOPPAS'));
  });

  t('les personnes opposées restent visibles, mais signalées', () => {
    const op = fileTara.filter(c => c.stop_telephone);
    op.forEach(c => assert.ok(c.avertissements.some(a => a.code === 'OPPOSITION'),
      'une fiche opposée sans avertissement : ' + c.id_modelo));
  });

  t('les fiches signalées sont reléguées en fin de file', () => {
    const premierSignale = fileTara.findIndex(c => c.stop_telephone || c.appels_ce_mois >= 4);
    if (premierSignale === -1) return;
    assert.ok(fileTara.slice(premierSignale).every(c => c.stop_telephone || c.appels_ce_mois >= 4),
      'une fiche saine se trouve après une fiche signalée');
  });

  t('la file exclut les fiches non attribuées', () => {
    assert.ok(fileTara.every(c => !c.a_dispatcher));
  });

  t('les objectifs adresse passent avant les autres', () => {
    const g = r.body.groupes;
    const prem = fileTara.slice(g.rappels_dus, g.rappels_dus + g.adresse_jamais_appeles);
    assert.ok(prem.every(c => c.objectif_principal === 'ADRESSE'),
      'les premières fiches après les rappels doivent être les objectifs adresse');
  });

  const dAutrui = db.prepare("SELECT id_modelo FROM op_contacts WHERE conseiller='Lynda GUDINCI' LIMIT 1").get().id_modelo;
  r = await call('GET', '/operation/contacts/' + dAutrui, tTara);
  t('un conseiller ne lit pas la fiche d un collègue', () => assert.strictEqual(r.status, 403));

  r = await call('POST', '/operation/contacts/' + dAutrui + '/appel', tTara, { issue: 'JOINT' });
  t('un conseiller n écrit pas sur la fiche d un collègue', () => assert.strictEqual(r.status, 403));

  // --- Manager d'agence ---------------------------------------------------
  r = await call('GET', '/operation/pilotage', tGillesMgr);
  t('un manager d agence ne voit que la sienne', () => {
    assert.strictEqual(r.status, 200);
    const noms = r.body.avancement.map(x => x.conseiller).sort();
    assert.deepStrictEqual(noms,
      ['Alexandre DUDOUET', 'Gilles BORGHIN', 'Hervé MARTIN', 'Jérôme PAGLIARO', 'Nathalie ALBIN', 'Virginie DURAND'],
      'reçu : ' + JSON.stringify(noms));
  });

  r = await call('GET', '/operation/pilotage', tAdmin);
  t('l admin voit les 15 conseillers', () => assert.strictEqual(r.body.avancement.length, 15));

  r = await call('GET', '/operation/dispatch', tTara);
  t('un conseiller n accède pas au dispatch', () => assert.strictEqual(r.status, 403));

  // --- Les trois blocages -------------------------------------------------
  const libre = fileTara.find(c => !c.stop_telephone);
  const bloque = db.prepare('SELECT id_modelo, conseiller FROM op_contacts WHERE stop_telephone=1 AND a_dispatcher=0 LIMIT 1').get();

  r = await call('POST', `/operation/contacts/${bloque.id_modelo}/appel`, tAdmin, { issue: 'JOINT' });
  t('appeler une personne opposée est permis, mais tracé', () => {
    assert.strictEqual(r.status, 201, 'statut ' + r.status + ' ' + JSON.stringify(r.body));
    assert.ok(/OPPOSITION/.test(r.body.hors_cadre || ''), 'trace : ' + r.body.hors_cadre);
    const l = db.prepare("SELECT hors_cadre FROM op_appels WHERE id_modelo=? ORDER BY id DESC LIMIT 1").get(bloque.id_modelo);
    assert.ok(/OPPOSITION/.test(l.hors_cadre || ''), 'la ligne d appel ne porte pas la trace');
  });

  r = await call('POST', `/operation/contacts/${libre.id_modelo}/appel`, tTara, { issue: 'INVENTEE' });
  t('une issue inconnue est refusée', () => assert.strictEqual(r.status, 400));

  r = await call('POST', `/operation/contacts/${libre.id_modelo}/appel`, tTara, { issue: 'A_RAPPELER' });
  t('un rappel sans créneau est refusé', () => {
    assert.strictEqual(r.status, 400);
    assert.ok(/date/i.test(r.body.error), r.body.error);
  });

  // Le plafond : on écrit 4 appels directement en base, puis on tente le 5e.
  const cible = fileTara[fileTara.length - 1];
  const ins = db.prepare(`INSERT INTO op_appels (id_modelo, conseiller, issue, horodatage)
    VALUES (?,?, 'PAS_DE_REPONSE', datetime('now'))`);
  for (let i = 0; i < 4; i++) ins.run(cible.id_modelo, 'Tara ZOPPAS');

  r = await call('POST', `/operation/contacts/${cible.id_modelo}/appel`, tTara, { issue: 'JOINT' });
  t('le 5e appel du mois passe, et porte la trace du plafond', () => {
    assert.strictEqual(r.status, 201, 'statut ' + r.status);
    assert.ok(/PLAFOND/.test(r.body.hors_cadre || ''), 'trace : ' + r.body.hors_cadre);
  });

  r = await call('GET', '/operation/file', tTara);
  t('une fiche plafonnée reste proposée, avec son avertissement', () => {
    const f = r.body.file.find(c => c.id_modelo === cible.id_modelo);
    assert.ok(f, 'la fiche plafonnée a disparu de la file');
    assert.ok(f.avertissements.some(a => a.code === 'PLAFOND'), 'pas d avertissement de plafond');
    assert.ok(r.body.compteurs.plafonnes >= 1);
  });

  // --- Refus ferme : opposition + retrait ---------------------------------
  const pourRefus = r.body.file.find(c => c.id_modelo !== cible.id_modelo);
  r = await call('POST', `/operation/contacts/${pourRefus.id_modelo}/appel`, tTara,
    { issue: 'REFUS_FERME', notes: 'Ne souhaite plus être appelé.' });

  t('un refus ferme est accepté', () => assert.strictEqual(r.status, 201, JSON.stringify(r.body)));

  t('le refus écrit au journal des oppositions', () => {
    const j = db.prepare('SELECT * FROM op_journal_opposition WHERE id_modelo=?').get(pourRefus.id_modelo);
    assert.ok(j, 'aucune ligne au journal');
    assert.strictEqual(j.canal, 'TELEPHONE');
    assert.ok(j.horodatage, 'opposition non horodatée');
  });

  t('le refus pose le stop téléphone', () => {
    assert.strictEqual(db.prepare('SELECT stop_telephone n FROM op_contacts WHERE id_modelo=?').get(pourRefus.id_modelo).n, 1);
  });

  const apres = await call('GET', '/operation/file', tTara);
  t('un refus ferme clôt le dossier : la fiche quitte la file', () => {
    // Un refus n'est pas un avertissement, c'est une conversation terminée.
    assert.ok(!apres.body.file.some(c => c.id_modelo === pourRefus.id_modelo));
  });

  // --- Résultat -----------------------------------------------------------
  const pourResultat = apres.body.file[0];
  await call('POST', `/operation/contacts/${pourResultat.id_modelo}/appel`, tTara, { issue: 'JOINT' });
  r = await call('PUT', `/operation/contacts/${pourResultat.id_modelo}/resultat`, tTara,
    { adresse_maj: '12 rue des Lilas', code_postal_maj: '38000', commune_maj: 'Grenoble',
      actualisation: 'ACCEPTEE', date_rdv: '2026-10-28', soiree: 1, consentement_tel: 1 });
  t('le résultat s enregistre', () => assert.strictEqual(r.status, 200, JSON.stringify(r.body)));
  t('le consentement est daté automatiquement', () => {
    assert.ok(r.body.resultat.date_consentement, 'consentement non daté');
  });

  // --- Dispatch -----------------------------------------------------------
  r = await call('GET', '/operation/dispatch', tAdmin);
  t('le dispatch liste les 363 orphelins', () => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.a_dispatcher, 363, 'reçu ' + r.body.a_dispatcher);
  });

  t('le compteur montre la charge actuelle et suggérée', () => {
    const tz = r.body.compteur.find(x => x.nom === 'Tara ZOPPAS');
    assert.strictEqual(tz.actuel, 149);
    assert.strictEqual(tz.suggere, 109, 'suggéré pour Tara : ' + tz.suggere);
    assert.strictEqual(tz.total_si_suivi, 258);
  });

  const trois = r.body.lignes.slice(0, 3).map(x => x.id_modelo);
  r = await call('POST', '/operation/dispatch', tAdmin, { ids: trois, conseiller: 'Tara ZOPPAS' });
  t('l attribution en lot fonctionne', () => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.attribuees, 3);
    assert.strictEqual(r.body.restantes, 360);
  });

  r = await call('POST', '/operation/dispatch', tAdmin, { ids: ['999999'], conseiller: 'Jean INCONNU' });
  t('attribuer à quelqu un sans compte est refusé', () => {
    assert.strictEqual(r.status, 400);
    assert.ok(/compte/i.test(r.body.error), r.body.error);
  });

  db.close();
  srv.kill();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(tmp + s, { force: true });
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error('  ERREUR ' + e.stack); srv.kill(); process.exit(1) });
