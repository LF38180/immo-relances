// L'onglet Démonstration : quatre fiches fictives, réservées à l'animateur.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

// Le compte de l'animateur est déjà semé au démarrage : on l'aligne au lieu
// de le recréer.
const mk = (email, role) => db.prepare(
  `INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES (?,'x','T','T',?,'LE QUAI',1)
   ON CONFLICT(email) DO UPDATE SET role = excluded.role, actif = 1`).run(email, role);
mk('performance@lequai-immobilier.com', 'admin');
mk('autre.admin@lequai-immobilier.com', 'admin');
mk('agent@lequai-immobilier.com', 'conseiller');

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));

const jeton = (email) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
};

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (email) => fetch(`${base}/operation/demo`,
    { headers: { authorization: 'Bearer ' + jeton(email) } }).then(async r => [r.status, await r.json()]);

  const [s1, d1] = await get('performance@lequai-immobilier.com');
  t('animateur : accès',        () => eq(s1, 200));
  t('quatre fiches',            () => eq(d1.fiches.length, 4));
  t('les quatre scripts',       () => eq(d1.fiches.map(f => f.script).join(','), '1,2,3,4'));
  t('en-tête calculé',          () => eq(!!d1.fiches[0].entete.titre, true));
  t('prénom à dire sur le 3',   () => eq(d1.fiches[2].entete.prenom_a_dire, 'Charlotte'));
  t('pas de prénom sur le 1',   () => eq(d1.fiches[0].entete.prenom_a_dire, null));
  t('numéros fictifs',          () => eq(d1.fiches.every(f => f.tel_portable.startsWith('063998')), true));
  t('aucun avertissement',      () => eq(d1.fiches.every(f => f.avertissements.length === 0), true));

  const [s2] = await get('autre.admin@lequai-immobilier.com');
  t('autre admin : refusé',     () => eq(s2, 403));
  const [s3] = await get('agent@lequai-immobilier.com');
  t('conseiller : refusé',      () => eq(s3, 403));

  t('base intacte',             () => eq(db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, 0));

  console.log(`\n${ok} ok, ${ko} ko`);
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ko ? 1 : 0);
});
