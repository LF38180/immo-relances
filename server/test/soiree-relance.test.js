// Soirée : la relance par mail de ceux qui n'ont pas répondu.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soiree-relance-'));
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


fiche('A'); fiche('B'); fiche('C'); fiche('D'); fiche('E'); fiche('F', { conseiller: 'Autre Agent' });
const par = (c) => Object.fromEntries(c.lignes.map(l => [l.id_modelo, l]));
(async () => {
  let L = par((await req('adm@t.fr', 'GET', '/operation/soiree')).corps);
  const ligne = (id, extra = {}) => ({ id_modelo: id, nom: L[id].nom, prenom: L[id].prenom, email: L[id].email, type: 'GENERIQUE', ...extra });
  await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: ['A', 'B', 'C', 'D'].map(id => ligne(id)), envoye_le: '2026-11-23', fichier: 'envoi.csv' });
  await req('adm@t.fr', 'POST', '/operation/soiree/erreurs', { lignes: [{ email: 'd@ex.fr', motif: 'Adresse inconnue', definitif: 'oui' }], fichier: 'err.csv' });

  // A et B relancées · C a répondu, pas relancée · D relancée alors que son mail était en erreur · E jamais invitée
  const fichiers = [ligne('A', { _fichier: 'relance-1.xlsx', _ligne: 2 }), ligne('B', { id_modelo: 'B.0', _fichier: 'relance-1.xlsx', _ligne: 3 }),
    ligne('D', { _fichier: 'relance-2.xlsx', _ligne: 3 }), ligne('E', { _fichier: 'relance-2.xlsx', _ligne: 4 }),
    { id_modelo: 'ZZ', nom: 'Inconnu', prenom: 'X' }, { ...ligne('A'), _ligne: 9 }, { ...ligne('C'), nom: 'Autre' }];
  let r = await req('adm@t.fr', 'POST', '/operation/soiree/relance', { lignes: fichiers, relance_le: '2026-11-26', simulation: true });
  t('simulation : 3 relances reconnues', () => { eq(r.statut, 200); eq(r.corps.acceptees, 3); eq(r.corps.simulation, true); });
  t('4 refusées, avec le motif', () => { eq(r.corps.rejetees.length, 4);
    eq(r.corps.rejetees.map(x => x.motif.split(' (')[0]).sort().join(' | '), 'identifiant inconnu dans l’opération | le nom ne correspond pas | ligne en double dans les fichiers | relancée sans avoir été invitée par mail dans l’appli'); });
  t('le mail en erreur est signalé', () => { eq(r.corps.alertes.length, 1); eq(r.corps.alertes[0].id_modelo, 'D'); });
  t('la simulation n’écrit rien', () => eq(db.prepare('SELECT COUNT(*) n FROM op_relances_soiree').get().n, 0));

  r = await req('adm@t.fr', 'POST', '/operation/soiree/relance', { lignes: fichiers, relance_le: '2026-11-26', fichier: 'relance-1.xlsx, relance-2.xlsx' });
  t('enregistrement : 3 lignes', () => { eq(r.corps.acceptees, 3); eq(db.prepare('SELECT COUNT(*) n FROM op_relances_soiree').get().n, 3); });
  t('l’identifiant « B.0 » d’Excel est reconnu', () => eq(db.prepare("SELECT COUNT(*) n FROM op_relances_soiree WHERE id_modelo = 'B'").get().n, 1));
  t('l’invitation d’origine n’a pas bougé', () => { eq(db.prepare('SELECT COUNT(*) n FROM op_invitations').get().n, 4); eq(db.prepare("SELECT envoye_le FROM op_invitations WHERE id_modelo = 'A'").get().envoye_le, '2026-11-23'); });

  r = await req('adm@t.fr', 'POST', '/operation/soiree/relance', { lignes: fichiers, relance_le: '2026-11-26' });
  t('rejouer le même fichier : pas de doublon', () => { eq(r.corps.acceptees, 0); eq(r.corps.deja_enregistrees, 3); eq(db.prepare('SELECT COUNT(*) n FROM op_relances_soiree').get().n, 3); });

  const s = (await req('adm@t.fr', 'GET', '/operation/soiree')).corps; L = par(s);
  t('l’onglet Soirée montre qui est relancé', () => { eq(L.A.relance.le, '2026-11-26'); eq(L.A.relance.n, 1); eq(L.C.relance, null); eq(L.A.statut, 'INVITE'); });
  t('compteurs : 3 relancés, 1 invité non relancé (a répondu)', () => { eq(s.compteurs.relances.total, 3); eq(s.compteurs.relances.invites_non_relances, 1); eq(s.compteurs.relances.jours[0].n, 3); });
  t('le nombre d’invités ne change pas', () => eq(s.compteurs.invites.total, 3));

  r = await req('a@t.fr', 'GET', '/operation/contacts/A/suivi');
  t('écran d’appel : invitation + relance', () => { eq(r.corps.invitation.etat, 'ENVOYEE'); eq(r.corps.invitation.envoye_le.slice(0, 10), '2026-11-23'); eq(r.corps.invitation.relance_le, '2026-11-26'); });
  r = await req('a@t.fr', 'GET', '/operation/contacts/C/suivi');
  t('pas relancée : rien de plus', () => eq(r.corps.invitation.relance_le, null));
  r = await req('a@t.fr', 'GET', '/operation/contacts/D/suivi');
  t('mail en erreur et relancée : les deux se lisent', () => { eq(r.corps.invitation.etat, 'ERREUR'); eq(r.corps.invitation.relance_le, '2026-11-26'); });

  r = await req('adm@t.fr', 'POST', '/operation/soiree/relance', { lignes: [ligne('A')], relance_le: '2026-11-30' });
  t('une deuxième relance, un autre jour, s’ajoute', () => { eq(r.corps.acceptees, 1); });
  L = par((await req('adm@t.fr', 'GET', '/operation/soiree')).corps);
  t('la fiche garde la dernière date et le nombre', () => { eq(L.A.relance.le, '2026-11-30'); eq(L.A.relance.n, 2); });

  r = await req('a@t.fr', 'POST', '/operation/soiree/relance', { lignes: [ligne('A')], relance_le: '2026-12-01' });
  t('un conseiller sans accès à la soirée ne peut pas importer', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/relance', { lignes: [{ nom: 'x' }] });
  t('fichier sans id_modelo : refusé', () => eq(r.statut, 400));

  console.log(`\n${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
})();
