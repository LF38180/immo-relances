// Journal d'activité : écrit sans jamais bloquer, lu en un seul tableau.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'activite-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const bcrypt = require('bcryptjs');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('adm@t.fr', ?, 'Ada', 'Admin', 'admin', NULL, 1), ('a@t.fr', ?, 'Alex', 'Agent', 'conseiller', 'LE QUAI', 1)`)
  .run(bcrypt.hashSync('secret123', 4), bcrypt.hashSync('secret123', 4));
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/auth', require('../src/routes/authRoutes.js'));
app.use('/admin', require('../src/routes/adminRoutes.js'));
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (email, methode, url, corps) => {
  const headers = { 'Content-Type': 'application/json' };
  if (email) {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    headers.Authorization = `Bearer ${jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET)}`;
  }
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};
db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, agence, script, courrier_etat, a_dispatcher, tel_portable, a_verifier, partie_au_registre)
  VALUES ('J-1', 'DURAND', 'Paul', 'Alex Agent', 'LE QUAI', 1, 'ENVOYE', 0, '0639980001', 1, 'DURAND Marc')`).run();

(async () => {
  let r = await req(null, 'POST', '/auth/login', { email: 'a@t.fr', password: 'secret123' });
  t('connexion journalisée', () => {
    eq(r.statut, 200);
    const j = db.prepare("SELECT * FROM op_journal WHERE action = 'CONNEXION'").get();
    eq(j.auteur, 'Alex Agent'); eq(JSON.parse(j.details).role, 'conseiller');
  });
  r = await req('adm@t.fr', 'POST', '/operation/contacts/J-1/npai', { npai: true });
  t('NPAI journalisé avec l\'auteur', () => {
    eq(r.statut, 200);
    const j = db.prepare("SELECT * FROM op_journal WHERE action = 'NPAI'").get();
    eq(j.auteur, 'Ada Admin'); eq(j.id_modelo, 'J-1');
  });
  r = await req('adm@t.fr', 'POST', '/operation/contacts/J-1/verifier', { verdict: 'GARDEE' });
  t('vérification journalisée', () => eq(db.prepare("SELECT COUNT(*) n FROM op_journal WHERE action = 'VERIFICATION'").get().n, 1));
  r = await req('adm@t.fr', 'POST', '/admin/users', { prenom: 'Nou', nom: 'VEAU', email: 'n@t.fr', password: 'LeQuai2026', role: 'conseiller', agence: 'LE QUAI' });
  r = await req('adm@t.fr', 'PUT', `/admin/users/${r.corps.id}`, { role: 'manager', password: 'autre1234' });
  t('comptes créé et modifié journalisés, sans le mot de passe', () => {
    const c = db.prepare("SELECT details FROM op_journal WHERE action = 'COMPTE_CREE'").get();
    const m = db.prepare("SELECT details FROM op_journal WHERE action = 'COMPTE_MODIFIE'").get();
    eq(JSON.parse(c.details).email, 'n@t.fr'); eq(JSON.parse(m.details).role, 'manager');
    vrai(!c.details.includes('LeQuai2026') && !m.details.includes('autre1234'));
  });
  r = await req('a@t.fr', 'POST', '/operation/contacts/J-1/appel', { issue: 'REPONDEUR' });
  t('appel enregistré (table existante)', () => eq(r.statut, 201));

  const a = await req('adm@t.fr', 'GET', '/admin/activite');
  t('l\'activité réunit journal et appels', () => {
    eq(a.statut, 200);
    const types = a.corps.lignes.map(l => l.type);
    for (const x of ['CONNEXION', 'NPAI', 'VERIFICATION', 'COMPTE_CREE', 'COMPTE_MODIFIE', 'APPEL']) vrai(types.includes(x), x);
    vrai(a.corps.lignes.find(l => l.type === 'APPEL').nom === 'DURAND');
    vrai(a.corps.personnes.includes('Alex Agent'));
  });
  const f = await req('adm@t.fr', 'GET', '/admin/activite?personne=alex%20agent&type=APPEL');
  t('filtre personne (sans casse) et type', () => { eq(f.corps.total, 1); eq(f.corps.lignes[0].type, 'APPEL'); });
  const hier = new Date(Date.now() - 86400000).toLocaleDateString('fr-CA');
  const v = await req('adm@t.fr', 'GET', `/admin/activite?jusqua=${hier}`);
  t('filtre période', () => eq(v.corps.total, 0));
  const m = await req('a@t.fr', 'GET', '/admin/activite');
  t('un conseiller n\'y a pas accès', () => eq(m.statut, 403));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
