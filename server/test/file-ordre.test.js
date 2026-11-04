// L'ordre de la file : les fiches reçues aujourd'hui après celles qu'on avait.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ordre-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('a@t.fr','x','Alex','Agent','conseiller','LE QUAI',1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const file = async () => {
  const u = db.prepare("SELECT * FROM users WHERE email = 'a@t.fr'").get();
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/operation/file`, { headers: { Authorization: `Bearer ${jeton}` } });
  const j = await r.json(); srv.close(); return j.file.map(l => l.id_modelo);
};
const fiche = (id, nom) => db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, agence, script, courrier_etat, a_dispatcher, tel_portable)
  VALUES (?, ?, 'P', 'Alex Agent', 'LE QUAI', 1, 'ENVOYE', 0, '0639980001')`).run(id, nom);
fiche('ANCIENNE-Z', 'ZOLA'); fiche('ANCIENNE-M', 'MARTIN'); fiche('NOUVELLE-A', 'ABADIE'); fiche('NOUVELLE-B', 'BLANC');
// Deux fiches reçues aujourd'hui, une reprise d'hier (ne compte pas comme reçue aujourd'hui).
db.prepare("INSERT INTO op_attributions (id_modelo, de, vers, par, source) VALUES ('NOUVELLE-A', NULL, 'Alex Agent', 'Chef', 'REPARTITION')").run();
db.prepare("INSERT INTO op_attributions (id_modelo, de, vers, par, source) VALUES ('NOUVELLE-B', 'Autre', 'Alex Agent', 'Chef', 'CORRECTION')").run();
db.prepare("INSERT INTO op_attributions (id_modelo, de, vers, par, source, reprise, le) VALUES ('ANCIENNE-M', NULL, 'Alex Agent', 'Chef', 'REPRISE', 1, datetime('now', '-1 day'))").run();

// Appelées hier : un répondeur (pas encore 48 h), un joint, un faux numéro,
// un rappel convenu pour demain. Aucune ne doit revenir dans « À faire ».
fiche('HIER-REPONDEUR', 'HREP'); fiche('HIER-JOINT', 'HJOI'); fiche('HIER-FAUX', 'HFAU'); fiche('HIER-RAPPEL', 'HRAP');
const hier = new Date(Date.now() - 20 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const demain = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16);
for (const [id, issue, rappel] of [['HIER-REPONDEUR', 'REPONDEUR', null], ['HIER-JOINT', 'JOINT', null], ['HIER-FAUX', 'FAUX_NUMERO', null], ['HIER-RAPPEL', 'A_RAPPELER', demain]]) {
  db.prepare("INSERT INTO op_appels (id_modelo, conseiller, horodatage, issue, rappel_le) VALUES (?, 'Alex Agent', ?, ?, ?)").run(id, hier, issue, rappel);
}
// Un répondeur d'il y a trois jours, à l'autre moitié de journée : lui revient.
fiche('AVANT-HIER', 'AREL');
const il3j = new Date(Date.now() - 72 * 3600000); il3j.setHours(new Date().getHours() < 14 ? 16 : 10);
db.prepare("INSERT INTO op_appels (id_modelo, conseiller, horodatage, issue) VALUES ('AVANT-HIER', 'Alex Agent', ?, 'REPONDEUR')").run(il3j.toISOString().slice(0, 19).replace('T', ' '));

(async () => {
  const ordre = await file();
  t('celles qu\'il avait déjà d\'abord, alphabétique ; les reçues aujourd\'hui ensuite ; puis la relance à 48 h', () => {
    eq(JSON.stringify(ordre), JSON.stringify(['ANCIENNE-M', 'ANCIENNE-Z', 'NOUVELLE-A', 'NOUVELLE-B', 'AVANT-HIER']));
  });
  t('les appels d\'hier ne reviennent pas dans « À faire »', () => {
    for (const id of ['HIER-REPONDEUR', 'HIER-JOINT', 'HIER-FAUX', 'HIER-RAPPEL']) vrai(!ordre.includes(id), id);
  });
  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
