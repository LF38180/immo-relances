// Créer un compte depuis l'administration.
//
// Le mot de passe tapé par l'admin doit être provisoire : la personne en
// choisit un autre à sa première connexion. Il restait définitif.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpt-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';
const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif) VALUES ('adm@t.fr','x','A','Dmin','admin',1)
  ON CONFLICT(email) DO UPDATE SET role='admin', actif=1`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/admin', require('../src/routes/adminRoutes.js'));
app.use('/auth', require('../src/routes/authRoutes.js'));
const u = db.prepare("SELECT * FROM users WHERE email='adm@t.fr'").get();
const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
const req = async (m, url, corps, j = jeton) => {
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method: m,
    headers: { 'Content-Type': 'application/json', ...(j ? { Authorization: `Bearer ${j}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined });
  const body = await r.json().catch(() => null); srv.close(); return { statut: r.status, corps: body };
};

(async () => {
  const r = await req('POST', '/admin/users', { prenom: ' Thomas ', nom: 'Girard', role: 'manager',
    email: 'Thomas.Girard@lequai-immobilier.com ', password: 'LeQuai2026 ' });
  t('le compte est créé', () => eq(r.statut, 201, JSON.stringify(r.corps)));
  const c = db.prepare("SELECT * FROM users WHERE email='thomas.girard@lequai-immobilier.com'").get();
  t('email en minuscules, sans espace', () => eq(!!c, true));
  t('prénom sans espaces de bord', () => eq(c.prenom, 'Thomas'));
  t('changement de mot de passe exigé à la première connexion', () => eq(c.must_change_password, 1));
  t('agence vide : les deux agences', () => eq(c.agence, null));
  const l = await req('POST', '/auth/login', { email: 'thomas.girard@lequai-immobilier.com', password: 'LeQuai2026' }, null);
  t('il se connecte avec le provisoire (espace final ignoré)', () => eq(l.statut, 200, JSON.stringify(l.corps)));
  t('et on lui demande d\'en choisir un autre', () => eq(l.corps.user.must_change_password, 1));
  console.log(`\n${ok} ok, ${ko} ko`); process.exit(ko ? 1 : 0);
})();
