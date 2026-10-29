// Le cloisonnement entre agences.
//
// Les listes étaient filtrées, mais aucune route agissant sur une fiche par
// son identifiant ne l'était : un manager de Saint-Égrève qui connaissait un
// id_modelo de Meylan pouvait l'exclure, la réattribuer, y enregistrer un
// appel. Et l'agence se comparait à l'octet près : un espace final dans le
// formulaire admin rendait un manager aveugle.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perim-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

const SE = "LE QUAI DE L'IMMOBILIER - SAINT ÉGRÈVE";
const MEY = "LE QUAI DE L'IMMOBILIER";
const mk = (email, prenom, nom, role, agence) => db.prepare(
  `INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES (?,'x',?,?,?,?,1)
   ON CONFLICT(email) DO UPDATE SET role = excluded.role, agence = excluded.agence, actif = 1`)
  .run(email, prenom, nom, role, agence);
mk('gilles@t.fr', 'Gilles', 'Borghin', 'manager', SE);
mk('gilles.espace@t.fr', 'Gilles', 'Espace', 'manager', '  ' + SE.toLowerCase() + '  ');  // casse + espaces
mk('jeremy@t.fr', 'Jérémy', 'Bertrand', 'manager', null);                                   // les deux agences
mk('loick@t.fr', 'Loïck', 'Ferrucci', 'admin', SE);                                        // admin AVEC agence
mk('herve@t.fr', 'Hervé', 'Martin', 'conseiller', SE);
mk('tara@t.fr', 'Tara', 'Zoppas', 'conseiller', MEY);

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
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};
const fiche = (id, agence, conseiller, extra = {}) => {
  const c = { id_modelo: id, nom: 'N' + id, prenom: 'P', conseiller, agence, script: 1,
    courrier_etat: 'ENVOYE', a_dispatcher: conseiller ? 0 : 1, email: `${id}@orpi.com`, ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
fiche('SE-1', SE, 'Hervé Martin'); fiche('SE-2', SE, 'Hervé Martin'); fiche('SE-D', SE, null);
fiche('ME-1', MEY, 'Tara Zoppas'); fiche('ME-2', MEY, 'Tara Zoppas'); fiche('ME-D', MEY, null);

(async () => {
  console.log('\nles listes');
  let r = await req('gilles@t.fr', 'GET', '/operation/listing');
  t('Gilles ne voit que Saint-Égrève', () => {
    eq(r.statut, 200); eq(r.corps.lignes.length, 3);
    vrai(r.corps.lignes.every(l => l.agence === SE));
  });
  r = await req('gilles.espace@t.fr', 'GET', '/operation/listing');
  t('agence en minuscules avec espaces : même périmètre', () => eq(r.corps.lignes.length, 3, JSON.stringify(r.corps).slice(0, 120)));
  r = await req('jeremy@t.fr', 'GET', '/operation/listing');
  t('Jérémy sans agence voit les deux', () => eq(r.corps.lignes.length, 6));
  r = await req('loick@t.fr', 'GET', '/operation/listing');
  t('un admin voit tout, même avec une agence sur son compte', () => eq(r.corps.lignes.length, 6));

  r = await req('gilles@t.fr', 'GET', '/operation/pilotage');
  t('le compteur « à répartir » est dans le périmètre', () => eq(r.corps.a_dispatcher, 1));
  r = await req('gilles@t.fr', 'GET', '/operation/controle-mails');
  t('le contrôle des mails ne montre que son agence', () => {
    eq(r.statut, 200); eq(r.corps.total, 3);
    vrai(r.corps.suspectes.every(s => s.id_modelo.startsWith('SE-')), JSON.stringify(r.corps.suspectes.map(s => s.id_modelo)));
  });

  console.log('\nagir sur une fiche de l\'autre agence : refusé');
  for (const [m, u, corps] of [
    ['GET', '/operation/contacts/ME-1', null],
    ['POST', '/operation/contacts/ME-1/exclure', { motif: 'test' }],
    ['PUT', '/operation/contacts/ME-1/attribution', { conseiller: 'Hervé Martin' }],
    ['POST', '/operation/contacts/ME-1/agence', { agence: SE }],
    ['POST', '/operation/contacts/ME-1/npai', { npai: true }],
    ['POST', '/operation/contacts/ME-1/appel', { issue: 'JOINT' }],
    ['PUT', '/operation/contacts/ME-1/resultat', { soiree: 1 }],
  ]) {
    const rr = await req('gilles@t.fr', m, u, corps);
    t(`${m} ${u.replace('/operation/contacts/ME-1', '…')} → 403`, () => eq(rr.statut, 403, JSON.stringify(rr.corps)));
  }
  t('la fiche de Meylan est intacte', () => {
    const c = db.prepare("SELECT conseiller, agence, npai FROM op_contacts WHERE id_modelo='ME-1'").get();
    eq(c.conseiller, 'Tara Zoppas'); eq(c.agence, MEY); eq(c.npai, 0);
    eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='ME-1'").get().n, 0);
  });

  console.log('\nagir sur une fiche de sa propre agence : autorisé');
  r = await req('gilles@t.fr', 'POST', '/operation/contacts/SE-1/npai', { npai: true });
  t('NPAI sur Saint-Égrève passe', () => eq(r.statut, 200, JSON.stringify(r.corps)));
  r = await req('jeremy@t.fr', 'POST', '/operation/contacts/ME-1/npai', { npai: true });
  t('Jérémy agit sur Meylan', () => eq(r.statut, 200));
  r = await req('loick@t.fr', 'POST', '/operation/contacts/ME-2/npai', { npai: true });
  t('l\'admin agit partout', () => eq(r.statut, 200));

  console.log('\nle dispatch');
  r = await req('gilles@t.fr', 'POST', '/operation/dispatch', { ids: ['ME-D', 'SE-D'], conseiller: 'Hervé Martin' });
  t('seule la fiche de son périmètre est attribuée', () => {
    eq(r.statut, 200, JSON.stringify(r.corps)); eq(r.corps.attribuees, 1);
    eq(db.prepare("SELECT a_dispatcher FROM op_contacts WHERE id_modelo='ME-D'").get().a_dispatcher, 1, 'ME-D a été touchée');
    eq(db.prepare("SELECT conseiller FROM op_contacts WHERE id_modelo='SE-D'").get().conseiller, 'Hervé Martin');
  });

  console.log('\nun conseiller sur la fiche d\'un collègue');
  r = await req('herve@t.fr', 'GET', '/operation/contacts/SE-2');
  t('sa fiche : ok', () => eq(r.statut, 200));
  r = await req('herve@t.fr', 'POST', '/operation/contacts/ME-2/appel', { issue: 'JOINT' });
  t('celle d\'un autre : 403', () => eq(r.statut, 403));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
