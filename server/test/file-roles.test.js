// La file d'appel : ses propres fiches, quel que soit le rôle.
//
// Premier après-midi d'appels : un manager d'agence voyait toute l'agence dans
// sa session au lieu de ses fiches, et un compte au rôle historique « agent »
// (Chrystelle) recevait 403 sur l'écran d'appel. Le test fige les deux.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'file-roles-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('g@t.fr','x','Gilles','Manager','manager','SAINT EGREVE',1),
  ('c@t.fr','x','Chrystelle','Agent','agent',NULL,1),
  ('a@t.fr','x','Alex','Conseiller','conseiller','SAINT EGREVE',1),
  ('adm@t.fr','x','Ada','Admin','admin',NULL,1)`).run();
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
const fiche = (id, conseiller, agence = 'SAINT EGREVE') => {
  db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, agence, script, courrier_etat, a_dispatcher, tel_portable)
    VALUES (?, ?, 'P', ?, ?, 1, 'ENVOYE', 0, '0639980001')`).run(id, 'N' + id, conseiller, agence);
};
fiche('G-1', 'Gilles MANAGER'); fiche('G-2', 'Gilles MANAGER');
fiche('A-1', 'Alex Conseiller'); fiche('A-2', 'Alex Conseiller'); fiche('A-3', 'Alex Conseiller');
fiche('C-1', 'Chrystelle AGENT', 'LE QUAI');

(async () => {
  console.log('\nmanager d\'agence');
  let f = await req('g@t.fr', 'GET', '/operation/file');
  t('sa file ne contient que ses fiches, pas celles de l\'agence', () => {
    eq(f.statut, 200); eq(f.corps.file.length, 2);
    vrai(f.corps.file.every(x => x.conseiller === 'Gilles MANAGER'));
  });
  let l = await req('g@t.fr', 'GET', '/operation/listing');
  t('son listing garde tout le périmètre de l\'agence', () => eq(l.corps.total, 5));

  console.log('\nrôle historique « agent »');
  f = await req('c@t.fr', 'GET', '/operation/file');
  t('la file répond, avec ses fiches', () => { eq(f.statut, 200); eq(f.corps.file.length, 1); });
  const c = await req('c@t.fr', 'GET', '/operation/contacts/C-1');
  t('sa fiche s\'ouvre', () => eq(c.statut, 200));
  t('les managers peuvent lui attribuer des fiches', () => {
    vrai(l.corps.conseillers.some(x => x.nom === 'Chrystelle Agent'), JSON.stringify(l.corps.conseillers));
  });

  console.log('\nadmin sans fiche');
  f = await req('adm@t.fr', 'GET', '/operation/file');
  t('file vide, pas les 779', () => { eq(f.statut, 200); eq(f.corps.file.length, 0); });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
