// NPAI : le courrier revenu doit se voir à l'écran d'appel.
//
// Quarante retours saisis le 29 octobre portaient un contexte faux — « le
// courrier du président lui a été envoyé la semaine dernière » — parce que
// contexteAppel ne regardait que courrier_etat. Ces tests fixent la priorité
// du NPAI et le rattrapage des fiches déjà saisies.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npai-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const S = require('../src/utils/opScripts.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

const mk = (email, role) => db.prepare(
  `INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES (?,'x','Marie','Manager',?,'LE QUAI',1)
   ON CONFLICT(email) DO UPDATE SET role = excluded.role, actif = 1`).run(email, role);
mk('manager@lequai-immobilier.com', 'manager');
mk('agent@lequai-immobilier.com', 'conseiller');

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const jeton = (email) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
};

const contact = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'Durand', prenom: 'Paul', conseiller: 'Marie Manager',
    agence: 'LE QUAI', script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
  return c;
};

console.log('\ncontexteAppel — priorité du NPAI');

t('fiche NPAI : annonce le courrier revenu, pas un courrier reçu', () => {
  const texte = S.contexteAppel({ npai: 1, courrier_etat: 'ENVOYE' });
  vrai(/revenu/.test(texte), `texte sans « revenu » : ${texte}`);
  vrai(!/la semaine dernière/.test(texte), `le texte promet encore un courrier reçu : ${texte}`);
});

t('sans NPAI : le message habituel ne change pas', () => {
  eq(S.contexteAppel({ courrier_etat: 'ENVOYE' }),
    'Le courrier du président lui a été envoyé la semaine dernière.');
});

t('identité incertaine passe avant le NPAI', () => {
  const texte = S.contexteAppel({ a_verifier: 1, npai: 1, courrier_etat: 'ENVOYE' });
  vrai(/Identité non confirmée/.test(texte), texte);
});

t('NPAI passe avant NON_IMPRIME', () => {
  const texte = S.contexteAppel({ npai: 1, courrier_etat: 'NON_IMPRIME' });
  vrai(/revenu/.test(texte), texte);
});

t('NON_IMPRIME seul garde son message', () => {
  vrai(/n'a pas été envoyé, mais l'adresse est bonne/.test(
    S.contexteAppel({ courrier_etat: 'NON_IMPRIME' })));
});

console.log('\nroute NPAI — ce qu\'elle écrit');

const req = async (methode, url, email, corps) => {
  const srv = app.listen(0);
  const port = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${port}${url}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton(email)}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};

(async () => {
  contact('T-1');
  const r = await req('POST', '/operation/contacts/T-1/npai', 'manager@lequai-immobilier.com', { npai: true });
  t('le manager peut saisir un NPAI', () => eq(r.statut, 200, JSON.stringify(r.corps)));

  t('op_contacts.npai passe à 1', () => {
    eq(db.prepare('SELECT npai FROM op_contacts WHERE id_modelo = ?').get('T-1').npai, 1);
  });
  t('adresse_fiable tombe à 0', () => {
    eq(db.prepare('SELECT adresse_fiable FROM op_contacts WHERE id_modelo = ?').get('T-1').adresse_fiable, 0);
  });
  t('la trace datée est dans op_resultats', () => {
    const r2 = db.prepare('SELECT npai, npai_le FROM op_resultats WHERE id_modelo = ?').get('T-1');
    eq(r2.npai, 1);
    vrai(/^\d{4}-\d{2}-\d{2}$/.test(r2.npai_le), `date mal formée : ${r2.npai_le}`);
  });

  t('le contexte renvoyé par la route annonce le retour', () => {
    vrai(/revenu/.test(r.corps.contact.entete.contexte), r.corps.contact.entete.contexte);
  });

  // Décochage : une saisie par erreur doit pouvoir se défaire.
  const r3 = await req('POST', '/operation/contacts/T-1/npai', 'manager@lequai-immobilier.com', { npai: false });
  t('décocher remet npai à 0', () => {
    eq(r3.statut, 200);
    eq(db.prepare('SELECT npai FROM op_contacts WHERE id_modelo = ?').get('T-1').npai, 0);
  });
  t('décocher ne rétablit pas adresse_fiable : le pli est revenu', () => {
    eq(db.prepare('SELECT adresse_fiable FROM op_contacts WHERE id_modelo = ?').get('T-1').adresse_fiable, 0);
  });

  // Un conseiller ne saisit pas les retours de courrier : c'est du pilotage.
  contact('T-2');
  const r4 = await req('POST', '/operation/contacts/T-2/npai', 'agent@lequai-immobilier.com', { npai: true });
  t('un conseiller ne peut pas saisir un NPAI', () => eq(r4.statut, 403, JSON.stringify(r4.corps)));

  console.log('\nrattrapage des retours déjà saisis');

  // Reproduit l'état d'avant la migration : la trace existe dans op_resultats,
  // la colonne de op_contacts n'a jamais été écrite. C'est le cas des quarante.
  contact('T-3');
  db.prepare(`INSERT INTO op_resultats (id_modelo, npai, npai_le) VALUES (?, 1, '2026-10-29')
    ON CONFLICT(id_modelo) DO UPDATE SET npai = 1`).run('T-3');
  db.prepare('UPDATE op_contacts SET npai = 0 WHERE id_modelo = ?').run('T-3');

  t('le rattrapage recopie les NPAI de op_resultats vers op_contacts', () => {
    db.exec(`UPDATE op_contacts SET npai = 1 WHERE id_modelo IN (
      SELECT id_modelo FROM op_resultats WHERE npai = 1)`);
    eq(db.prepare('SELECT npai FROM op_contacts WHERE id_modelo = ?').get('T-3').npai, 1);
  });

  t('la file renvoie le bon contexte pour une fiche NPAI', async () => {});
  const f = await req('GET', '/operation/file', 'manager@lequai-immobilier.com');
  t('/file : la fiche NPAI porte le contexte « revenu »', () => {
    const ligne = f.corps.file.find(l => l.id_modelo === 'T-3');
    vrai(ligne, 'fiche T-3 absente de la file');
    vrai(/revenu/.test(ligne.entete.contexte), ligne.entete.contexte);
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
