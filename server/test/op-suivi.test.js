// Opération : le suivi complet d'une fiche sur l'écran d'appel.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'op-suivi-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',1), ('m@t.fr','x','Marie','Manager','manager',1),
  ('t@t.fr','x','Tom','Suivi','manager',1), ('a@t.fr','x','Alex','Agent','conseiller',1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (email, methode, url, corps) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};
const fiche = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'Nom' + id, prenom: 'Pré', conseiller: 'Alex Agent', agence: 'LE QUAI',
    script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, email: id.toLowerCase() + '@ex.fr', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
const appel = (id, issue, par = 'Alex Agent') =>
  db.prepare('INSERT INTO op_appels (id_modelo, conseiller, issue) VALUES (?,?,?)').run(id, par, issue);
const resultat = (id, soiree, extra = {}) => {
  const c = { id_modelo: id, soiree, ...extra }; const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_resultats (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};


fiche('A'); fiche('B'); fiche('C', { conseiller: 'Autre Agent' });
const ins = db.prepare('INSERT INTO op_appels (id_modelo, conseiller, issue, horodatage, notes, canal, sms_texte, rappel_le) VALUES (?,?,?,?,?,?,?,?)');
ins.run('A', 'Alex Agent', 'REPONDEUR', '2026-11-10 09:00:00', 'Message laissé', null, null, null);
ins.run('A', 'Marie Manager', 'PAS_DE_REPONSE', '2026-11-12 10:00:00', null, 'SMS', 'Bonjour, c’est Le Quai', null);
ins.run('A', 'Alex Agent', 'JOINT', '2026-11-15 11:00:00', 'Projet de vente en 2027', null, null, null);
ins.run('A', 'Alex Agent', 'A_RAPPELER', '2026-11-20 12:00:00', 'Rappeler après les fêtes', null, null, '2026-12-28T15:00');

(async () => {
  let r = await req('a@t.fr', 'GET', '/operation/contacts/A/suivi');
  t('suivi lisible par le conseiller de la fiche', () => eq(r.statut, 200));
  t('tous les appels, pas seulement le dernier', () => eq(r.corps.appels.length, 4));
  t('du plus récent au plus ancien', () => eq(r.corps.appels.map(a => a.issue).join(','), 'A_RAPPELER,JOINT,PAS_DE_REPONSE,REPONDEUR'));
  t('chaque note est là, avec sa date', () => { eq(r.corps.appels[3].notes, 'Message laissé'); eq(r.corps.appels[3].horodatage, '2026-11-10 09:00:00'); });
  t('la note d’un collègue aussi', () => eq(r.corps.appels[2].conseiller, 'Marie Manager'));
  t('le texte du SMS remonte', () => { eq(r.corps.appels[2].canal, 'SMS'); eq(r.corps.appels[2].sms_texte, 'Bonjour, c’est Le Quai'); });
  t('l’heure du rappel convenu', () => eq(r.corps.appels[0].rappel_le, '2026-12-28T15:00'));
  t('pas d’invitation tant que rien n’est parti', () => eq(r.corps.invitation, null));

  let L = (await req('adm@t.fr', 'GET', '/operation/soiree')).corps.lignes.find(l => l.id_modelo === 'B');
  await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: [{ id_modelo: 'B', nom: L.nom, prenom: L.prenom, email: L.email, type: 'Générique' }], envoye_le: '2026-11-23', fichier: 'envoi.csv' });
  r = await req('a@t.fr', 'GET', '/operation/contacts/B/suivi');
  t('jamais appelée mais invitée : l’invitation remonte', () => { eq(r.corps.appels.length, 0); eq(r.corps.invitation.etat, 'ENVOYEE'); eq(r.corps.invitation.canal, 'MAIL'); eq(r.corps.invitation.envoye_le.slice(0, 10), '2026-11-23'); });
  r = await req('a@t.fr', 'GET', '/operation/contacts/B/invitation-soiree');
  t('l’ancienne route répond toujours', () => eq(r.corps.invitation.etat, 'ENVOYEE'));

  r = await req('a@t.fr', 'GET', '/operation/contacts/C/suivi');
  t('fiche d’un autre conseiller : refusé', () => eq(r.statut, 403));
  const avant = db.prepare('SELECT COUNT(*) n FROM op_appels').get().n;
  await req('a@t.fr', 'GET', '/operation/contacts/A/suivi');
  t('lecture seule : rien n’est écrit', () => eq(db.prepare('SELECT COUNT(*) n FROM op_appels').get().n, avant));

  console.log(`\n${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
})();
