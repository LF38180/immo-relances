// Mission Acquéreurs : les personnes déjà vues par Chrystelle (Mission Estimés).
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-estimes-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const I = require('../src/utils/acqImport');
const M = require('../src/utils/acqModelo');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif, acces_acquereurs) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',1,0), ('l@t.fr','x','Lila','Essai','conseiller',1,1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json({ limit: '5mb' }));
app.use('/acquereurs', require('../src/routes/acqRoutes.js'));
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

const ENTETE = 'id_fiche;id_contact;civilite;nom;prenom;tel_portable;stop_tel;stop_mail;type_contact;suivi_par_contact;type_recherche;type_bien;alertes_a_verifier';
const L = (idf, idc, extra = {}) => { const o = { id_fiche: idf, id_contact: idc, civilite: 'Mme', nom: 'NOM' + idc, prenom: 'Zoé',
  tel_portable: '06000000' + idc, stop_tel: 'NON', stop_mail: 'NON', type_contact: 'Acquéreur', type_recherche: 'Achat', type_bien: 'Maison', ...extra };
  return ENTETE.split(';').map(k => o[k] ?? '').join(';'); };

const E = require('../src/utils/acqEstimes');
// 21 jointe (plus de projet) · 22 jamais jointe · 23 jointe, mais déjà appelée côté acquéreurs
// 24 liée par Modelo seulement · 25 n'habite plus, sans adresse (tiers possible) · 26 même téléphone, autre nom
// 27 rien · 28 dernière note Modelo de Chrystelle, hors Mission Estimés · 29 jointe, déjà hors file (stop tél)
// 30 jointe dans une base personnelle d'agent (hors mission) · 31 ancienne relance sans issue, jointe
const IMPORT = [ENTETE, L('201', '21'), L('202', '21'), L('203', '22'), L('204', '23'), L('205', '24'), L('206', '25'), L('207', '26'),
  L('208', '27'), L('209', '28'), L('210', '29', { stop_tel: 'OUI' }), L('211', '30'), L('212', '31')].join('\n');
I.importer(IMPORT, { madameFichier: 'Lila Essai', simulation: false });
db.prepare("UPDATE acq_contacts SET derniere_note_auteur = 'Chrystelle BAJULAZ', derniere_note_date = '2026-09-14', derniere_note_extrait = 'Vu avec elle' WHERE id_contact = '28'").run();
db.prepare("INSERT INTO acq_appels (id_contact, madame_fichier, issue) VALUES ('23', 'Lila Essai', 'REPONDEUR')").run();

const chr = db.prepare("INSERT INTO users (email, password, prenom, nom, role, actif) VALUES ('c@t.fr','x','Chrystelle','BAJULAZ','agent',1)").run().lastInsertRowid;
const perso = db.prepare("INSERT INTO blocs (code, libelle, proprietaire_id) VALUES ('estimes', 'Base perso', ?)").run(chr).lastInsertRowid;
const est = (nom, tel, extra = {}) => { const c = { nom, prenom: 'Zoé', telephone: tel, bloc_id: 1, ...extra }; const k = Object.keys(c);
  return db.prepare(`INSERT INTO contacts (${k.join(',')}) VALUES (${k.map(x => '@' + x).join(',')})`).run(c).lastInsertRowid; };
const rel = (cid, issue, quand, notes = null, statut = null) => db.prepare(`INSERT INTO relances (contact_id, agent_id, statut, issue, notes, created_at, bloc_id)
  VALUES (?, ?, ?, ?, ?, ?, 1)`).run(cid, chr, statut || (issue === 'sans_reponse' ? 'tente_sans_reponse' : 'contacte'), issue, notes, quand);
const e21 = est('NOM21', '06 00 00 00 21'); rel(e21, 'sans_reponse', '2026-09-01 10:00:00'); rel(e21, 'sans_projet', '2026-09-12 10:00:00', 'Ne vend plus, pas d’achat prévu');
const e22 = est('NOM22', '0600000022'); rel(e22, 'sans_reponse', '2026-09-02 10:00:00'); rel(e22, 'sans_reponse', '2026-09-09 10:00:00');
const e23 = est('NOM23', '0600000023'); rel(e23, 'projet', '2026-10-01 10:00:00');
const e24 = est('NOM24', '0499999924'); rel(e24, 'rappel', '2026-10-02 10:00:00');
db.prepare("INSERT INTO est_modelo_liens (contact_id, id_contact, id_bien, rapprochement) VALUES (?, '24', 'EA1', 'SUR')").run(e24);
const e25 = est('NOM25', '0600000025', { statut: 'inactif', tags: '["prospecter_terrain"]' }); rel(e25, 'demenage', '2026-10-03 10:00:00');
const e26 = est('VOISIN', '0600000026'); rel(e26, 'autre', '2026-10-04 10:00:00', 'A répondu');
const e29 = est('NOM29', '0600000029'); rel(e29, 'projet', '2026-10-05 10:00:00');
const e30 = est('NOM30', '0600000030', { bloc_id: perso }); rel(e30, 'projet', '2026-10-06 10:00:00');
const e31 = est('NOM31', '0600000031'); rel(e31, null, '2026-06-20 10:00:00', 'Vieille saisie', 'contacte');

(async () => {
  console.log('\ncroisement');
  let r = await req('adm@t.fr', 'GET', '/acquereurs/admin/estimes');
  let P = Object.fromEntries(r.corps.lignes.map(l => [l.id_contact, l])), C = r.corps.compteurs;
  t('jointe par Chrystelle : à sortir, avec son dernier appel abouti', () => { eq(P['21'].etat, 'A_SORTIR'); eq(P['21'].a_verifier, false);
    eq(P['21'].estimes.dernier_appel.libelle, 'Plus de projet'); eq(P['21'].estimes.tentatives, 1); eq(P['21'].estimes.dernier_appel.par, 'Chrystelle BAJULAZ'); });
  t('toutes ses fiches suivent', () => eq(P['21'].fiches.length, 2));
  t('jamais jointe : hors de la liste, comptée', () => { eq(P['22'], undefined); eq(C.jamais_jointes, 1); });
  t('déjà appelée côté acquéreurs : on n’y touche pas', () => eq(P['23'].etat, 'DEJA_APPELEE'));
  t('liée par le numéro Modelo, sans téléphone commun', () => { eq(P['24'].etat, 'A_SORTIR'); eq(P['24'].estimes.lien, 'MODELO'); });
  t('n’habite plus, sans adresse : à vérifier', () => { eq(P['25'].etat, 'A_SORTIR'); eq(P['25'].a_verifier, true); eq(P['25'].estimes.tiers_possible, true); });
  t('même téléphone, autre nom : à vérifier', () => { eq(P['26'].a_verifier, true); eq(P['26'].estimes.nom_different, true); });
  t('sans lien : absente', () => eq(P['27'], undefined));
  t('dernière note Modelo de Chrystelle : à sortir aussi', () => { eq(P['28'].etat, 'A_SORTIR'); eq(P['28'].estimes, null); eq(P['28'].note_modelo.le, '2026-09-14'); });
  t('déjà hors de la file : rien à faire', () => eq(P['29'].etat, 'DEJA_HORS_FILE'));
  t('base personnelle d’un agent : hors Mission Estimés', () => eq(P['30'], undefined));
  t('ancienne relance sans issue, jointe', () => { eq(P['31'].etat, 'A_SORTIR'); eq(P['31'].estimes.dernier_appel.libelle, 'Jointe'); });
  t('compteurs', () => { eq(C.a_sortir, 6); eq(C.dont_a_verifier, 2); eq(C.dont_note_modelo_seule, 1); eq(C.deja_appelees, 1); eq(C.deja_hors_file, 1); eq(C.communes, 8); eq(C.liees_par_modelo, 1); });
  r = await req('l@t.fr', 'GET', '/acquereurs/admin/estimes');
  t('réservé à l’administration', () => eq(r.statut, 403));

  console.log('\nécran d’appel');
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/22');
  t('jamais jointe : l’écran le dit', () => { eq(r.corps.estimes.jointe, false); eq(r.corps.estimes.tentatives, 2); eq(r.corps.estimes.derniere_tentative_le, '2026-09-09 10:00:00'); });
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/27');
  t('sans lien : rien', () => eq(r.corps.estimes, null));
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/23');
  t('jointe : l’issue et la note de Chrystelle', () => { eq(r.corps.estimes.jointe, true); eq(r.corps.estimes.dernier_appel.libelle, 'Projet'); });

  console.log('\nsortie');
  const avant = db.prepare("SELECT COUNT(*) n FROM acq_contacts WHERE exclu IS NULL").get().n;
  r = await req('l@t.fr', 'POST', '/acquereurs/admin/estimes/sortir', { ids: ['21'] });
  t('réservée à l’administration', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/estimes/sortir', { ids: [] });
  t('rien de coché : refus', () => eq(r.statut, 400));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/estimes/sortir', { ids: ['21', '24', '22', '23', '27', '29'] });
  t('seules les personnes à sortir passent', () => { eq(r.statut, 200); eq(r.corps.sortis.length, 2); });
  t('la file diminue d’autant', () => eq(db.prepare("SELECT COUNT(*) n FROM acq_contacts WHERE exclu IS NULL").get().n, avant - 2));
  t('motif gardé, rien de supprimé', () => { eq(db.prepare("SELECT motif FROM acq_hors_mission WHERE id_contact = '21'").get().motif, E.MOTIF);
    eq(db.prepare("SELECT COUNT(*) n FROM acq_contacts").get().n, 11); eq(db.prepare("SELECT COUNT(*) n FROM acq_fiches WHERE id_contact = '21'").get().n, 2); });
  t('la jamais jointe et la déjà appelée restent dans la file', () => { eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '22'").get().exclu, null);
    eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '23'").get().exclu, null); });
  I.importer(IMPORT, { madameFichier: 'Lila Essai', simulation: false });
  t('un nouvel import ne les remet pas dans la file', () => eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '21'").get().exclu, 'HORS_MISSION'));
  t('aucune ligne de report pour elles', () => eq(M.aReporter ? M.aReporter().filter(x => ['21', '24'].includes(String(x.id_contact))).length : 0, 0));
  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/estimes'); P = Object.fromEntries(r.corps.lignes.map(l => [l.id_contact, l]));
  t('elles passent en « déjà hors file »', () => { eq(P['21'].etat, 'DEJA_HORS_FILE');
    eq(r.corps.compteurs.a_sortir, 3); });   // 25, 26, 31 : le réimport a remplacé la note Modelo de la 28
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/contacts/21/reintegrer', {});
  t('une sortie se lève', () => { eq(r.statut, 200); eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '21'").get().exclu, null); });

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
