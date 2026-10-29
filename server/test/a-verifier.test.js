// Les fiches à identité incertaine : lister, confirmer, écarter.
//
// Ces routes existaient sans écran : 34 fiches exclues de toutes les files,
// que personne ne pouvait débloquer. Le test fige le contrat que l'écran
// « Répartir » utilise désormais.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('m@t.fr','x','Marie','Manager','manager',NULL,1), ('a@t.fr','x','Alex','Agent','conseiller','LE QUAI',1)`).run();
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
  const c = { id_modelo: id, nom: 'N' + id, prenom: 'P', conseiller: 'Alex Agent', agence: 'LE QUAI',
    script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, tel_portable: '0639980001', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
fiche('V-1', { a_verifier: 1, partie_au_registre: 'NV-1 Jean' });
fiche('V-2', { a_verifier: 1, partie_au_registre: 'AUTRE NOM' });
fiche('OK-1');

(async () => {
  console.log('\navant toute décision');
  let f = await req('a@t.fr', 'GET', '/operation/file');
  t('les deux fiches à vérifier sont hors de la file du conseiller', () => {
    eq(f.corps.file.length, 1); eq(f.corps.file[0].id_modelo, 'OK-1');
  });
  let l = await req('m@t.fr', 'GET', '/operation/a-verifier');
  t('le manager les liste', () => { eq(l.statut, 200); eq(l.corps.lignes.length, 2); eq(l.corps.restantes, 2); });
  t('avec de quoi trancher à l\'œil', () => vrai('partie_au_registre' in l.corps.lignes[0]));
  const c = await req('a@t.fr', 'GET', '/operation/a-verifier');
  t('un conseiller n\'y a pas accès', () => eq(c.statut, 403));

  console.log('\nconfirmer');
  let r = await req('m@t.fr', 'POST', '/operation/contacts/V-1/verifier', { verdict: 'CONFIRME' });
  t('confirmée', () => eq(r.statut, 200, JSON.stringify(r.corps)));
  f = await req('a@t.fr', 'GET', '/operation/file');
  t('elle entre dans la file du conseiller', () => vrai(f.corps.file.some(x => x.id_modelo === 'V-1')));
  t('qui a tranché est tracé', () => {
    eq(db.prepare("SELECT verifie, verifie_par FROM op_contacts WHERE id_modelo='V-1'").get().verifie_par, 'Marie Manager');
  });

  console.log('\nécarter');
  r = await req('m@t.fr', 'POST', '/operation/contacts/V-2/verifier', { verdict: 'ECARTE' });
  t('écartée', () => eq(r.statut, 200));
  f = await req('a@t.fr', 'GET', '/operation/file');
  t('elle n\'entre pas dans la file', () => vrai(!f.corps.file.some(x => x.id_modelo === 'V-2')));
  t('opposition posée et journalisée', () => {
    eq(db.prepare("SELECT stop_telephone FROM op_contacts WHERE id_modelo='V-2'").get().stop_telephone, 1);
    eq(db.prepare("SELECT COUNT(*) n FROM op_journal_opposition WHERE id_modelo='V-2'").get().n, 1);
  });
  l = await req('m@t.fr', 'GET', '/operation/a-verifier');
  t('plus rien à trancher, les deux restent listées avec leur verdict', () => {
    eq(l.corps.restantes, 0); eq(l.corps.lignes.length, 2);
  });
  r = await req('m@t.fr', 'POST', '/operation/contacts/V-2/verifier', { verdict: 'PEUT-ETRE' });
  t('un verdict inconnu est refusé', () => eq(r.statut, 400));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
