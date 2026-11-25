// Mission Acquéreurs : les personnes déjà vues par Chrystelle (Mission Estimés).
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-estimes-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';
process.env.ACQ_SORTIES_AUTO = '1';

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
const SA = require('../src/utils/acqSortiesAuto');
// 21 jointe (plus de projet) · 22 jamais jointe · 23 jointe, mais déjà appelée côté acquéreurs
// 24 liée par Modelo seulement · 25 n'habite plus, sans adresse (tiers possible) · 26 même téléphone, autre nom
// 27 rien · 28 dernière note Modelo de Chrystelle, hors Mission Estimés · 29 jointe, déjà hors file (stop tél)
// 30 jointe dans une base personnelle d'agent (hors mission) · 31 ancienne relance sans issue, jointe
const IMPORT = [ENTETE, L('201', '21'), L('202', '21'), L('203', '22'), L('204', '23'), L('205', '24'), L('206', '25'), L('207', '26'),
  L('208', '27'), L('209', '28'), L('213', '32'), L('214', '33'), L('215', '34'), L('216', '35'), L('210', '29', { stop_tel: 'OUI' }), L('211', '30'), L('212', '31')].join('\n');
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

// Opération anciens clients : 32 même numéro de contact Modelo · 33 même téléphone et même nom
// 34 même téléphone, autre nom (à vérifier) · 35 dans l'opération, et déjà appelée et requalifiée ici
const op = (id, nom, tel, cons = 'Alex Agent') => db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, agence, script, courrier_etat, a_dispatcher, tel_portable)
  VALUES (?, ?, 'Zoé', ?, 'LE QUAI', 1, 'ENVOYE', 0, ?)`).run(id, nom, cons, tel);
op('32', 'NOM32', null); op('9033', 'Nom33', '06 00 00 00 33'); op('9034', 'CONJOINT', '0600000034'); op('35', 'NOM35', '0600000035');
db.prepare("INSERT INTO acq_appels (id_contact, madame_fichier, issue, statut_final, notes) VALUES ('35', 'Lila Essai', 'JOINT', 'REQUALIFIE', 'Dans la mission de Chrystelle')").run();
db.prepare("UPDATE acq_contacts SET statut = 'REQUALIFIE' WHERE id_contact = '35'").run();
db.prepare("UPDATE acq_fiches SET decision = 'GARDER', requalif = ? WHERE id_fiche = '216'").run(JSON.stringify({ etat_projet: 'ACTIF', type_bien: 'Maison ou appartement', budget_max: 300000 }));

(async () => {
  console.log('\ncroisement Mission Estimés');
  const P0 = Object.fromEntries(E.croisement().map(l => [l.id_contact, l]));
  t('jointe par Chrystelle, avec son dernier appel abouti', () => { eq(P0['21'].estimes.jointe, true);
    eq(P0['21'].estimes.dernier_appel.libelle, 'Plus de projet'); eq(P0['21'].estimes.tentatives, 1); eq(P0['21'].estimes.dernier_appel.par, 'Chrystelle BAJULAZ'); });
  t('jamais jointe', () => { eq(P0['22'].estimes.jointe, false); eq(P0['22'].estimes.tentatives, 2); });
  t('liée par le numéro Modelo, sans téléphone commun', () => eq(P0['24'].estimes.lien, 'MODELO'));
  t('même téléphone, autre nom', () => eq(P0['26'].estimes.nom_different, true));
  t('base personnelle d’un agent : hors Mission Estimés', () => eq(P0['30'], undefined));
  t('ancienne relance sans issue, jointe', () => eq(P0['31'].estimes.dernier_appel.libelle, 'Jointe'));

  console.log('\nce qui va sortir');
  let C = Object.fromEntries(SA.candidats().map(p => [p.id_contact, p]));
  t('Mission Estimés : jointe', () => { eq(C['21'].origine, 'ESTIMES'); eq(C['21'].sur, true); eq(C['21'].fiches.length, 2); });
  t('Mission Estimés : jamais jointe, sort aussi', () => { eq(SA.ESTIMES_JAMAIS_JOINTES, true); eq(C['22'].sur, true); });
  t('Mission Estimés : déjà appelée ici, sort aussi', () => eq(C['23'].sur, true));
  t('Mission Estimés : n’habite plus, sort aussi', () => eq(C['25'].sur, true));
  t('même téléphone, autre nom : à vérifier', () => { eq(C['26'].sur, false); eq(/VOISIN/.test(C['26'].doute), true); });
  t('sans lien : absente', () => eq(C['27'], undefined));
  t('dernière note Modelo de Chrystelle, hors mission : à vérifier', () => eq(C['28'].sur, false));
  t('déjà hors de la file : rien à faire', () => eq(C['29'], undefined));
  t('opération : même numéro de contact', () => { eq(C['32'].origine, 'OPERATION'); eq(C['32'].sur, true); });
  t('opération : même téléphone et même nom', () => eq(C['33'].sur, true));
  t('opération : même téléphone, autre nom : à vérifier', () => { eq(C['34'].origine, 'OPERATION'); eq(C['34'].sur, false); });
  t('opération : déjà requalifiée ici, sort aussi', () => eq(C['35'].sur, true));

  console.log('\nécran d’appel');
  let r = await req('l@t.fr', 'GET', '/acquereurs/contacts/22');
  t('le bandeau Mission Estimés reste lisible', () => { eq(r.corps.estimes.jointe, false); eq(r.corps.estimes.tentatives, 2); });

  console.log('\nreport avant la sortie');
  const avantSortie = M.lignesReport('9999').find(l => l.id_contact === '35');
  t('requalifiée : réattribuée à l’appelante', () => eq(avantSortie.nego_contact_cible, 'Lila Essai'));
  t('projet actif : alerte mail d’office', () => eq(avantSortie.alerte_mail, 'oui'));
  t('« Maison ou appartement » part sous le libellé Modelo', () => eq(avantSortie.type_bien_apres, 'Appartement/Maison'));
  t('plus de phrase sur l’accord de rappel', () => eq(/Accepte d/.test(avantSortie.commentaire), false));

  console.log('\nsortie d’office');
  const avant = db.prepare("SELECT COUNT(*) n FROM acq_contacts WHERE exclu IS NULL").get().n;
  r = await req('l@t.fr', 'GET', '/acquereurs/admin/sorties-auto');
  t('réservé à l’administration', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/sorties-auto');
  t('tout ce qui est sûr est sorti', () => { eq(r.statut, 200); eq(r.corps.vient_de_sortir, 9); eq(r.corps.etat.sorties.ESTIMES, 6); eq(r.corps.etat.sorties.OPERATION, 3); });
  t('la file diminue d’autant', () => eq(db.prepare("SELECT COUNT(*) n FROM acq_contacts WHERE exclu IS NULL").get().n, avant - 9));
  t('les cas douteux restent, proposés', () => { eq(r.corps.a_verifier.length, 3); eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '26'").get().exclu, null); });
  t('motif et origine gardés, rien de supprimé', () => { const h = db.prepare("SELECT motif, origine, reporter_appels FROM acq_hors_mission WHERE id_contact = '32'").get();
    eq(h.motif, SA.MOTIFS.OPERATION); eq(h.origine, 'OPERATION'); eq(h.reporter_appels, 1); eq(db.prepare("SELECT COUNT(*) n FROM acq_contacts").get().n, 15); });
  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/sorties-auto');
  t('un second passage ne fait rien', () => eq(r.corps.vient_de_sortir, 0));

  console.log('\nreport après la sortie');
  const apres = M.lignesReport('9999').find(l => l.id_contact === '35');
  t('ses appels partent quand même dans Modelo', () => eq(!!apres, true));
  t('sans réattribution : elle reste à son conseiller', () => { eq(apres.nego_contact_cible, ''); eq(apres.nego_fiche_cible, ''); });
  t('sa recherche est mise à jour', () => { eq(apres.type_bien_apres, 'Appartement/Maison'); eq(apres.alerte_mail, 'oui'); });

  console.log('\nà vérifier, imports, levée');
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sorties-auto/sortir', { ids: [] });
  t('rien de coché : refus', () => eq(r.statut, 400));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sorties-auto/sortir', { ids: ['26', '27', '21'] });
  t('seule la personne à vérifier cochée sort', () => { eq(r.statut, 200); eq(r.corps.sortis.length, 1); });
  I.importer(IMPORT, { madameFichier: 'Lila Essai', simulation: false });
  t('un nouvel import ne les remet pas dans la file', () => eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '21'").get().exclu, 'HORS_MISSION'));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/contacts/21/reintegrer', {});
  t('une sortie se lève', () => { eq(r.statut, 200); eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '21'").get().exclu, null); });
  SA.appliquer();
  t('et n’est jamais reposée d’office', () => eq(db.prepare("SELECT exclu FROM acq_contacts WHERE id_contact = '21'").get().exclu, null));

  console.log('\naccord pour être recontacté');
  r = await req('l@t.fr', 'POST', '/acquereurs/contacts/27/cloture', { cle: 'k27', statut_final: 'EN_PAUSE', joint: true, fiches: { '208': { decision: 'ARCHIVER', motif: 'projet ancien' } } });
  t('jointe : accord acquis sans case à cocher', () => { eq(r.statut, 201); eq(db.prepare("SELECT consentement_rappel c FROM acq_contacts WHERE id_contact = '27'").get().c, 1); });

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
