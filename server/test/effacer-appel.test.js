// Effacer un appel enregistré par erreur, sans perdre la trace du retrait.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eff-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b) => { if (a !== b) throw new Error(`attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif)
  VALUES ('a@x.fr','x','A','D','admin',1)
  ON CONFLICT(email) DO UPDATE SET role='admin'`).run();
db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif)
  VALUES ('c@x.fr','x','C','C','conseiller',1)`).run();
db.prepare(`INSERT INTO op_contacts (id_modelo, nom, conseiller, script, courrier_etat, a_dispatcher)
  VALUES ('900','T','A D',1,'ENVOYE',0)`).run();
const a1 = db.prepare(`INSERT INTO op_appels (id_modelo, conseiller, issue, notes)
  VALUES ('900','A D','PAS_DE_REPONSE','erreur')`).run().lastInsertRowid;

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const jeton = (e) => { const u = db.prepare('SELECT * FROM users WHERE email=?').get(e);
  return jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET); };

const srv = app.listen(0, async () => {
  const b = `http://127.0.0.1:${srv.address().port}`;
  const del = (id, who) => fetch(`${b}/operation/appels/${id}`,
    { method: 'DELETE', headers: { authorization: 'Bearer ' + jeton(who) } })
    .then(async r => [r.status, await r.json()]);

  const [s0] = await del(a1, 'c@x.fr');
  t('un conseiller ne peut pas', () => eq(s0, 403));
  t('appel toujours la',         () => eq(db.prepare('SELECT COUNT(*) n FROM op_appels').get().n, 1));

  const [s1, d1] = await del(a1, 'a@x.fr');
  t('admin : efface',            () => { eq(s1, 200); eq(d1.ok, true); });
  t('appel retire',              () => eq(db.prepare('SELECT COUNT(*) n FROM op_appels WHERE id=?').get(a1).n, 0));
  const j = db.prepare("SELECT * FROM op_resultats_journal WHERE appel_id=?").get(a1);
  t('trace du retrait gardee',   () => eq(!!j, true));
  t('trace nomme qui a efface',  () => eq(j.auteur, 'A D'));
  t('trace garde le contenu',    () => eq(JSON.parse(j.champs).efface.notes, 'erreur'));

  const [s2] = await del(99999, 'a@x.fr');
  t('appel inexistant : 404',    () => eq(s2, 404));

  console.log(`\n${ok} ok, ${ko} ko`);
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ko ? 1 : 0);
});
