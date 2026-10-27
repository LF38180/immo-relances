// La route de correction d'attribution, sur une base jetable.
const path = require('path');
const fs = require('fs');
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attrib-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');

let ok = 0, ko = 0;
const t = (nom, f) => { try { f(); console.log('  ok  ', nom); ok++; }
  catch (e) { console.log('  KO  ', nom, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif)
  VALUES ('t@x.fr','x','Yasmina','MAHDJOUB','admin','Grenoble',1)`).run();
db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, a_dispatcher, script, courrier_etat)
  VALUES ('999','TEST','Jean',NULL,1,3,'ENVOYE')`).run();

const express = require('express');
const app = express();
app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));

// Un vrai jeton : le routeur porte son propre requireAuth, un faux middleware
// placé devant ne le contourne pas.
const jwt = require('jsonwebtoken');
const u = db.prepare("SELECT * FROM users WHERE email='t@x.fr'").get();
const TOK = jwt.sign({ id: u.id, email: u.email, role: 'admin' }, process.env.JWT_SECRET);
const AUTH = { 'content-type': 'application/json', authorization: `Bearer ${TOK}` };

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const put = (b) => fetch(`${base}/operation/contacts/999/attribution`,
    { method:'PUT', headers: AUTH, body: JSON.stringify(b) }).then(r => r.json());

  const r1 = await put({ conseiller: 'Yasmina MAHDJOUB', conseiller_precedent: 'Corinne MARTIN' });
  t('attribue le conseiller', () => eq(r1.apres.conseiller, 'Yasmina MAHDJOUB'));
  t('sort du pot commun',     () => eq(r1.apres.a_dispatcher, 0));
  t('herite de l agence',     () => eq(r1.apres.agence, 'Grenoble'));
  t('deduit le prenom a dire',() => eq(r1.apres.prenom_a_dire, 'Corinne'));

  const r2 = await put({ prenom_a_dire: 'Coco' });
  t('prenom explicite gagne', () => eq(r2.apres.prenom_a_dire, 'Coco'));
  t('n efface pas le reste',  () => eq(r2.apres.conseiller, 'Yasmina MAHDJOUB'));

  const r3 = await put({ conseiller: '' });
  t('renvoie au pot commun',  () => { eq(r3.apres.conseiller, null); eq(r3.apres.a_dispatcher, 1); });

  const r4 = await put({ conseiller: 'Fantome INEXISTANT' });
  t('refuse un inconnu',      () => eq(!!r4.error, true));

  const r5 = await put({ script: 9 });
  t('refuse script hors 1-4', () => eq(!!r5.error, true));

  const r6 = await fetch(`${base}/operation/contacts/999/exclure`,
    { method:'POST', headers: AUTH, body: JSON.stringify({ motif: 'Locataire' }) }).then(r => r.json());
  t('exclut avec motif',      () => eq(r6.ok, true));
  t('retire des contacts',    () => eq(db.prepare("SELECT COUNT(*) n FROM op_contacts WHERE id_modelo='999'").get().n, 0));
  t('garde la trace',         () => eq(db.prepare("SELECT motif FROM op_exclus WHERE id_modelo='999'").get().motif, 'Locataire'));

  console.log(`\n${ok} ok, ${ko} ko`);
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ko ? 1 : 0);
});
