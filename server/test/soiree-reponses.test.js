// Soirée : les réponses reçues par mail (oui, non, désinscrits).
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soiree-reponses-'));
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


const M = require('../src/utils/opModelo');
// A oui à 2 · B non · C non + désinscrit · D désinscrit sans réponse · E avait dit oui au téléphone, répond non · F témoin · G autre conseiller
fiche('A'); fiche('B'); fiche('C', { tel_portable: '0600000003' }); fiche('D'); fiche('E'); fiche('F'); fiche('G', { conseiller: 'Autre Agent' });
appel('E', 'JOINT'); resultat('E', 1);
const par = (c) => Object.fromEntries(c.lignes.map(l => [l.id_modelo, l]));
(async () => {
  let L = par((await req('adm@t.fr', 'GET', '/operation/soiree')).corps);
  const ligne = (id, extra = {}) => ({ 'liste d\'origine': 'Liste_dinvitations_de_soir_e_2', id_modelo: id, nom: L[id].nom, prenom: L[id].prenom, email: L[id].email, ...extra });
  await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: ['A', 'B', 'C', 'D', 'E', 'F'].map(id => ({ id_modelo: id, nom: L[id].nom, prenom: L[id].prenom, email: L[id].email, type: 'GENERIQUE' })), envoye_le: '2026-11-23', fichier: 'envoi.csv' });
  // Tout est reporté dans Modelo avant : seules les réponses doivent rouvrir une note.
  db.prepare("UPDATE op_contacts SET modelo_reporte_le = datetime('now', '-1 minute')").run();
  db.prepare("UPDATE op_resultats SET updated_at = datetime('now', '-1 hour')").run();
  db.prepare("UPDATE op_appels SET horodatage = datetime('now', '-1 hour')").run();
  t('avant : rien à reporter dans Modelo', () => eq(M.fichesAReporter().fiches.length, 0));

  const OUI = { _fichier: 'Soiree_3_12_OUI_V1.xlsx', _feuille: 'Ont dit oui' }, NON = { _fichier: 'Soiree_3_12_NON_V1.xlsx', _feuille: 'Ont dit non' }, DES = { _fichier: 'Desinscrits_listes_diffusion_V1.xlsx', _feuille: 'Désinscrits' };
  const fichiers = [
    ligne('A', { ...OUI, 'réponse': 'Oui (vert)', 'soirée du 3/12': 'X2 PERSONNES' }),
    ligne('B', { ...NON, 'réponse': 'Non (rouge)', 'soirée du 3/12': 'ABSENT' }),
    ligne('C', { ...NON, 'réponse': 'Non (rouge)' }), ligne('C', { ...DES, 'réponse': 'Non (rouge)' }),
    ligne('D', { ...DES, 'réponse': 'Pas de réponse' }),
    ligne('E', { ...NON, 'réponse': 'Non (rouge)' }),
    { ...OUI, id_modelo: 'ZZ', nom: 'Inconnu', prenom: 'X', 'réponse': 'Oui (vert)' },
    { ...ligne('F', OUI), nom: 'Autre', 'réponse': 'Oui (vert)' },
    ligne('G', { _fichier: 'divers.xlsx', _feuille: 'Feuille 1', 'réponse': 'peut-être' }),
  ];
  let r = await req('adm@t.fr', 'POST', '/operation/soiree/reponses', { lignes: fichiers, recue_le: '2026-11-26', simulation: true });
  t('simulation : 1 oui, 3 non, 2 désinscrits', () => { eq(r.statut, 200); eq(r.corps.oui, 1); eq(r.corps.non, 3); eq(r.corps.desinscrits.length, 2); eq(r.corps.acceptees, 6); });
  t('2 personnes attendues', () => eq(r.corps.personnes_attendues, 2));
  t('les désinscrits sont nommés avant d’enregistrer', () => eq(r.corps.desinscrits.map(x => x.id_modelo).sort().join(','), 'C,D'));
  t('l’écart oui au téléphone / non par mail est signalé', () => { eq(r.corps.ecarts.length, 1); eq(r.corps.ecarts[0].id_modelo, 'E'); });
  t('3 refusées : inconnue, nom différent, réponse illisible', () => eq(r.corps.rejetees.length, 3));
  t('la simulation n’écrit rien', () => { eq(db.prepare('SELECT COUNT(*) n FROM op_reponses_soiree').get().n, 0); eq(db.prepare("SELECT stop_telephone s FROM op_contacts WHERE id_modelo = 'C'").get().s, 0); });

  r = await req('adm@t.fr', 'POST', '/operation/soiree/reponses', { lignes: fichiers, recue_le: '2026-11-26', fichier: 'trois fichiers' });
  t('enregistrement : 6 réponses', () => { eq(r.corps.acceptees, 6); eq(db.prepare('SELECT COUNT(*) n FROM op_reponses_soiree').get().n, 6); });
  const c = (id) => db.prepare('SELECT stop_telephone, stop_mail FROM op_contacts WHERE id_modelo = ?').get(id);
  t('désinscrits : stop mail et stop téléphone', () => { eq(c('C').stop_telephone, 1); eq(c('C').stop_mail, 1); eq(c('D').stop_telephone, 1); eq(c('D').stop_mail, 1); });
  t('un simple non ne pose aucun stop', () => { eq(c('B').stop_telephone, 0); eq(c('B').stop_mail, 0); eq(c('E').stop_telephone, 0); });
  t('inscrits au journal des oppositions', () => { const j = db.prepare("SELECT id_modelo, canal, origine, telephone FROM op_journal_opposition ORDER BY id_modelo").all();
    eq(j.length, 2); eq(j[0].id_modelo, 'C'); eq(j[0].origine, 'DESINSCRIPTION_MAIL'); eq(j[0].canal, 'TELEPHONE'); eq(j[0].telephone, '0600000003'); });
  t('ce que le conseiller avait noté au téléphone n’est pas écrasé', () => eq(db.prepare("SELECT soiree FROM op_resultats WHERE id_modelo = 'E'").get().soiree, 1));

  r = await req('adm@t.fr', 'POST', '/operation/soiree/reponses', { lignes: fichiers, recue_le: '2026-11-27' });
  t('rejouer les fichiers : pas de doublon', () => { eq(r.corps.acceptees, 0); eq(r.corps.deja_enregistrees, 6); eq(db.prepare('SELECT COUNT(*) n FROM op_reponses_soiree').get().n, 6); eq(db.prepare('SELECT COUNT(*) n FROM op_journal_opposition').get().n, 2); });

  const s = (await req('adm@t.fr', 'GET', '/operation/soiree')).corps; L = par(s);
  t('compteurs de l’onglet Soirée', () => { const x = s.compteurs.reponses; eq(x.oui, 1); eq(x.non, 3); eq(x.desinscrits, 2); eq(x.personnes_attendues, 2); eq(x.contradictoires, 1); });
  t('tout s’affiche : C a ses deux réponses', () => eq(L.C.reponses.map(x => x.reponse).join(','), 'NON,DESINSCRIT'));
  t('E est signalée contradictoire, pas les autres', () => { eq(L.E.reponses_contradictoires, true); eq(L.B.reponses_contradictoires, false); eq(L.A.reponses_contradictoires, false); });

  r = await req('a@t.fr', 'GET', '/operation/contacts/A/suivi');
  t('écran d’appel : la confirmation, avec le nombre', () => { eq(r.corps.reponses.length, 1); eq(r.corps.reponses[0].reponse, 'OUI'); eq(r.corps.reponses[0].participants, 2); eq(r.corps.invitation.etat, 'ENVOYEE'); });
  r = await req('a@t.fr', 'GET', '/operation/contacts/F/suivi');
  t('sans réponse : liste vide', () => eq(r.corps.reponses.length, 0));

  console.log('\nreport Modelo');
  const f = Object.fromEntries(M.fichesAReporter().fiches.map(x => [x.id_modelo, x]));
  t('5 fiches rouvertes par leur réponse, pas le témoin', () => eq(Object.keys(f).sort().join(','), 'A,B,C,D,E'));
  t('oui : la confirmation dans la note', () => eq(/Soirée du 3 décembre : a confirmé sa présence par mail le 26\/11\/2026 \(2 personnes\)\./.test(f.A.commentaire), true, f.A.commentaire));
  t('non : dans la note, sans stop', () => { eq(/a répondu non par mail le 26\/11\/2026/.test(f.B.commentaire), true); eq(f.B.stop_tel, 0); eq(f.B.stop_mail, 0); });
  t('désinscrit : les deux stops remontent', () => { eq(f.C.stop_tel, 1); eq(f.C.stop_mail, 1); eq(f.D.stop_tel, 1); eq(f.D.stop_mail, 1); eq(/S’est désinscrit de nos listes de diffusion/.test(f.D.commentaire), true); });
  t('pas de faux « Sans appel. Infos saisies par l’agent »', () => eq(/Sans appel|Non joint/.test(f.D.commentaire), false, f.D.commentaire));
  t('la note porte le conseiller de la fiche', () => eq(f.A.agent, 'Alex Agent'));

  r = await req('a@t.fr', 'POST', '/operation/soiree/reponses', { lignes: fichiers });
  t('un conseiller sans accès à la soirée ne peut pas importer', () => eq(r.statut, 403));

  console.log(`\n${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
})();
