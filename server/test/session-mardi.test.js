// Ce qui doit tenir une journée d'appels : la session, le mot de passe, les
// doublons en mobilité, la file.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mardi-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const bcrypt = require('bcryptjs');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif, must_change_password)
  VALUES ('alex@t.fr', ?, 'Alex', 'Agent', 'conseiller', 'LE QUAI', 1, 1)`).run(bcrypt.hashSync('LeQuai2026', 4));

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/auth', require('../src/routes/authRoutes.js'));
app.use('/operation', require('../src/routes/opRoutes.js'));
const brut = async (methode, url, corps, jeton) => {
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};
const fiche = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'N' + id, prenom: 'P', conseiller: 'Alex Agent', agence: 'LE QUAI',
    script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, tel_portable: '0639980001', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};

(async () => {
  console.log('\nla connexion');
  let r = await brut('POST', '/auth/login', { email: 'Alex@T.fr ', password: 'LeQuai2026 ' });
  t('email en majuscules et mot de passe avec espace final : accepté', () => eq(r.statut, 200, JSON.stringify(r.corps)));
  const jeton = r.corps?.token;
  t('le jeton dure seize heures', () => {
    const d = jwt.decode(jeton); eq(d.exp - d.iat, 16 * 3600);
  });
  t('le changement de mot de passe est demandé', () => eq(r.corps.user.must_change_password, 1));
  r = await brut('POST', '/auth/login', { email: 'alex@t.fr', password: 'faux' });
  t('mauvais mot de passe : 401 lisible', () => { eq(r.statut, 401); vrai(/incorrect/.test(r.corps.error)); });

  console.log('\nle changement de mot de passe');
  r = await brut('GET', '/auth/me', null, jeton);
  t('/me dit si le changement est fait', () => eq(r.corps.must_change_password, 1));
  r = await brut('PUT', '/auth/password', { ancien: 'LeQuai2026', nouveau: 'court' }, jeton);
  t('trop court : refusé par le serveur', () => eq(r.statut, 400));
  r = await brut('PUT', '/auth/password', { ancien: 'LeQuai2026', nouveau: 'LeQuai2026' }, jeton);
  t('identique à l\'ancien : refusé', () => eq(r.statut, 400));
  r = await brut('PUT', '/auth/password', { ancien: 'LeQuai2026', nouveau: 'MonNouveau1 ' }, jeton);
  t('un bon mot de passe : accepté', () => eq(r.statut, 200, JSON.stringify(r.corps)));
  t('le drapeau est levé dans la même écriture', () => {
    eq(db.prepare("SELECT must_change_password FROM users WHERE email='alex@t.fr'").get().must_change_password, 0);
  });
  r = await brut('GET', '/auth/me', null, jeton);
  t('/me le confirme (second appareil)', () => eq(r.corps.must_change_password, 0));
  r = await brut('POST', '/auth/login', { email: 'alex@t.fr', password: 'MonNouveau1' });
  t('le nouveau mot de passe, sans l\'espace, ouvre la session', () => eq(r.statut, 200));
  r = await brut('PUT', '/auth/password', { ancien: 'LeQuai2026', nouveau: 'AutreChose1' }, jeton);
  t('l\'ancien provisoire ne marche plus, et le message dit quoi faire', () => {
    eq(r.statut, 400); vrai(/autre appareil/.test(r.corps.error), r.corps.error);
  });

  console.log('\nle compte désactivé');
  db.prepare("UPDATE users SET actif = 0 WHERE email='alex@t.fr'").run();
  r = await brut('GET', '/operation/mon-acces', null, jeton);
  t('jeton encore valide, mais compte désactivé : 401 tout de suite', () => eq(r.statut, 401, JSON.stringify(r.corps)));
  db.prepare("UPDATE users SET actif = 1 WHERE email='alex@t.fr'").run();

  console.log('\nl\'idempotence en mobilité');
  fiche('I-1');
  const corps = { issue: 'JOINT', cle: 'abc-123', resultat: { adresse_maj: '1 rue Test' } };
  const r1 = await brut('POST', '/operation/contacts/I-1/appel', corps, jeton);
  const r2 = await brut('POST', '/operation/contacts/I-1/appel', corps, jeton);
  t('premier envoi : 201', () => eq(r1.statut, 201, JSON.stringify(r1.corps)));
  t('même clé renvoyée : 200 « déjà »', () => { eq(r2.statut, 200); eq(r2.corps.deja, true); });
  t('un seul appel en base', () => eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='I-1'").get().n, 1));
  t('la saisie du premier envoi est là', () => {
    eq(db.prepare("SELECT adresse_maj FROM op_resultats WHERE id_modelo='I-1'").get().adresse_maj, '1 rue Test');
  });
  fiche('I-2');
  await brut('POST', '/operation/contacts/I-2/appel', { issue: 'REPONDEUR' }, jeton);
  await brut('POST', '/operation/contacts/I-2/appel', { issue: 'REPONDEUR' }, jeton);
  t('sans clé (ancien client) : deux appels, comme avant', () => {
    eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='I-2'").get().n, 2);
  });

  console.log('\nla file');
  fiche('F-sans', { tel_portable: null, tel_fixe: '  ' });
  fiche('F-fixe', { tel_portable: null, tel_fixe: '0476000000' });
  fiche('F-r1', {}); fiche('F-r2', {});
  const uid = db.prepare("SELECT id FROM users WHERE email='alex@t.fr'").get().id;
  const ins = db.prepare(`INSERT INTO op_appels (id_modelo, user_id, conseiller, issue, rappel_le, horodatage)
    VALUES (?,?,?,'A_RAPPELER',?, datetime('now','-1 day'))`);
  ins.run('F-r2', uid, 'Alex Agent', '2026-01-01T11:30');
  ins.run('F-r1', uid, 'Alex Agent', '2026-01-01T10:00');
  r = await brut('GET', '/operation/file', null, jeton);
  t('/file répond', () => eq(r.statut, 200, JSON.stringify(r.corps)?.slice(0, 150)));
  t('la fiche sans aucun numéro n\'est pas dans la file', () => {
    vrai(!r.corps.file.some(f => f.id_modelo === 'F-sans'));
  });
  t('un fixe seul suffit', () => vrai(r.corps.file.some(f => f.id_modelo === 'F-fixe')));
  t('elle est comptée pour le pilotage', () => eq(r.corps.compteurs.sans_telephone, 1));
  t('les rappels dus sont triés par heure, pas par nom', () => {
    const ids = r.corps.file.filter(f => f.derniere_issue === 'A_RAPPELER').map(f => f.id_modelo);
    eq(ids[0], 'F-r1'); eq(ids[1], 'F-r2');
  });
  r = await brut('GET', '/operation/contacts/F-r1', null, jeton);
  t('la fiche ouverte seule porte l\'heure du rappel', () => eq(r.corps.contact.rappel_le, '2026-01-01T10:00'));
  r = await brut('GET', '/operation/listing', null, jeton);
  t('un conseiller n\'a pas le listing (403)', () => eq(r.statut, 403));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
