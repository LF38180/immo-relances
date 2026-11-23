// Soirée : mails d'invitation revenus en erreur.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soiree-err-'));
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


fiche('A');                       // invitée par mail, adresse morte
fiche('B');                       // invitée par mail, boîte pleine
fiche('C');                       // pas encore invitée, adresse morte
fiche('D', { email_valide: 0 }); resultat('D', 0, { email_maj: 'neuve@ex.fr' });   // l'adresse du téléphone est morte, pas d'autre
fiche('E'); resultat('E', 0, { email_maj: 'morte-e@ex.fr' });                       // l'adresse du téléphone est morte, celle de la fiche reste
fiche('F');                       // témoin
fiche('G1', { email: 'couple@ex.fr' }); fiche('G2', { email: 'couple@ex.fr' });    // même adresse, morte

const par = (c) => Object.fromEntries(c.lignes.map(l => [l.id_modelo, l]));
(async () => {
  let r = await req('adm@t.fr', 'GET', '/operation/soiree');
  let L = par(r.corps);
  const envoi = ['A', 'B', 'G1'].map(id => ({ id_modelo: id, nom: L[id].nom, prenom: L[id].prenom, email: L[id].email, type: 'Générique' }));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: envoi, envoye_le: '2026-11-23', fichier: 'envoi.csv' });
  t('envoi enregistré', () => eq(r.corps.acceptees, 3));

  const erreurs = [
    { email: 'A@ex.fr ', motif: 'Adresse inexistante', code: '5.1.1', definitif: 'oui' },
    { email: 'b@ex.fr', motif: 'Boîte pleine', definitif: 'non' },
    { email: 'c@ex.fr', motif: 'Adresse inexistante', definitif: 'oui' },
    { email: 'neuve@ex.fr', motif: 'Adresse inexistante' },
    { email: 'morte-e@ex.fr', motif: 'Adresse inexistante' },
    { email: 'couple@ex.fr', motif: 'Adresse inexistante' },
    { email: 'inconnue@ex.fr', motif: 'Adresse inexistante' },
    { email: 'pas une adresse' },
    { email: 'a@ex.fr' },
  ];
  console.log('\nsimulation');
  r = await req('adm@t.fr', 'POST', '/operation/soiree/erreurs', { lignes: erreurs, fichier: 'err.csv', simulation: true });
  t('rien n’est écrit', () => eq(db.prepare('SELECT COUNT(*) n FROM op_emails_en_erreur').get().n, 0));
  t('6 reconnues, 1 inconnue, 1 illisible, doublon ignoré', () => { eq(r.corps.reconnues.length, 6); eq(r.corps.inconnues.length, 1); eq(r.corps.rejetees.length, 1); eq(r.corps.lues, 7); });
  t('5 définitives, 1 boîte pleine', () => { eq(r.corps.definitives, 5); eq(r.corps.boites_pleines, 1); });
  t('la fiche et son état sont rendus', () => { const a = r.corps.reconnues.find(e => e.email === 'a@ex.fr');
    eq(a.fiches[0].id_modelo, 'A'); eq(a.fiches[0].invitee_par_mail, true); });
  t('une adresse partagée rend ses deux fiches', () => eq(r.corps.reconnues.find(e => e.email === 'couple@ex.fr').fiches.length, 2));

  console.log('\nenregistrement');
  r = await req('a@t.fr', 'POST', '/operation/soiree/erreurs', { lignes: erreurs });
  t('réservé aux comptes de la soirée', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/erreurs', { lignes: erreurs, fichier: 'err.csv' });
  t('7 adresses gardées', () => eq(db.prepare('SELECT COUNT(*) n FROM op_emails_en_erreur').get().n, 7));
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps); const C = r.corps.compteurs;
  t('adresse morte après envoi : plus invitée, à joindre autrement', () => { eq(L.A.statut, 'MAIL_EN_ERREUR'); eq(L.A.email, '');
    eq(L.A.erreur_mail.envoi.vague, 1); eq(L.A.erreur_mail.motif, 'Adresse inexistante'); });
  t('l’envoi d’origine reste en base', () => eq(db.prepare("SELECT COUNT(*) n FROM op_invitations WHERE id_modelo = 'A' AND annulee_le IS NULL").get().n, 1));
  t('boîte pleine : reste invitée, avec une alerte', () => { eq(L.B.statut, 'INVITE'); eq(L.B.erreur_mail.definitif, false); });
  t('adresse morte avant envoi : sortie de l’export', () => { eq(L.C.statut, 'MAIL_EN_ERREUR'); eq(L.C.erreur_mail.envoi, null); });
  t('adresse du téléphone morte, sans autre', () => eq(L.D.statut, 'MAIL_EN_ERREUR'));
  t('adresse du téléphone morte : on reprend celle de la fiche', () => { eq(L.E.statut, 'A_INVITER'); eq(L.E.email, 'e@ex.fr'); eq(L.E.erreur_mail, null); });
  t('le témoin ne bouge pas', () => eq(L.F.statut, 'A_INVITER'));
  t('adresse partagée : les deux fiches repassent en erreur', () => { eq(L.G1.statut, 'MAIL_EN_ERREUR'); eq(L.G2.statut, 'MAIL_EN_ERREUR'); });
  t('compteurs', () => { eq(C.mail_en_erreur, 5); eq(C.boite_pleine, 1); eq(C.invites.total, 1); eq(C.adresses_en_erreur, 7); });

  console.log('\nsuite');
  r = await req('adm@t.fr', 'POST', '/operation/soiree/erreurs', { lignes: erreurs, simulation: true });
  t('un second import ne refait rien', () => { eq(r.corps.reconnues.length, 0); eq(r.corps.deja_connues, 7); });
  r = await req('adm@t.fr', 'POST', '/operation/soiree/contacts/A/invitation', { canal: 'sms', envoye_le: '2026-11-24' });
  t('on peut noter un SMS', () => eq(r.statut, 200));
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('la fiche est invitée par SMS', () => { eq(L.A.statut, 'INVITE'); eq(L.A.invitation.canal, 'SMS'); });
  r = await req('m@t.fr', 'POST', '/operation/soiree/erreurs/annuler', { email: 'c@ex.fr' });
  t('annuler une erreur : admin seulement', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/erreurs/annuler', { email: 'C@ex.fr' });
  t('erreur annulée, ligne gardée', () => { eq(r.statut, 200); eq(db.prepare('SELECT COUNT(*) n FROM op_emails_en_erreur').get().n, 7); });
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('la fiche revient à inviter par mail', () => { eq(L.C.statut, 'A_INVITER'); eq(L.C.email, 'c@ex.fr'); });
  // Un envoi réimporté après coup vers une adresse déjà connue comme morte.
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: [{ id_modelo: 'D', nom: L.D.nom, prenom: L.D.prenom, email: 'neuve@ex.fr' }], envoye_le: '2026-11-23' });
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('envoi réimporté après l’erreur : toujours en erreur', () => { eq(L.D.statut, 'MAIL_EN_ERREUR'); eq(L.D.erreur_mail.envoi.vague, 2); });

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
