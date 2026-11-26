// Mission Acquéreurs : un nouveau projet d'achat saisi à l'appel, absent de Modelo.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-nouveau-projet-'));
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
  ('adm@t.fr','x','Ada','Admin','admin',1,0), ('l@t.fr','x','Lila','Essai','conseiller',1,1), ('ma@t.fr','x','Marine','Test','courtage',1,0)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json({ limit: '5mb' }));
app.use('/acquereurs', require('../src/routes/acqRoutes.js'));
app.use('/courtage', require('../src/routes/courtageRoutes.js'));
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

// 51 une recherche pro existante + un nouveau projet résidentiel · 52 témoin sans nouveau projet
I.importer([ENTETE, L('501', '51', { type_bien: 'Immobilier Pro' }), L('502', '52')].join('\n'), { madameFichier: 'Lila Essai', simulation: false });
const pro = { etat_projet: 'ACTIF', type_bien: 'Immobilier Pro', budget_max: 500000, secteurs: 'Meylan' };
const resid = { etat_projet: 'ACTIF', type_bien: 'Appartement/Maison', budget_max: 380000, surface_min: 90, pieces: 4, secteurs: ['Crolles', 'Bernin'] };
const clore = (idc, corps) => req('l@t.fr', 'POST', `/acquereurs/contacts/${idc}/cloture`, { joint: true, ...corps });

(async () => {
  let r = await clore('51', { cle: 'a', statut_final: 'REQUALIFIE', fiches: { 501: { decision: 'GARDER', projet: pro } }, nouvelles: [{ cle: 'NOUVEAU-1', projet: { type_bien: '' } }] });
  t('sans type de bien : refusé, rien n’est écrit', () => { eq(r.statut, 400); eq(db.prepare("SELECT COUNT(*) n FROM acq_fiches WHERE id_contact = '51'").get().n, 1); eq(db.prepare("SELECT COUNT(*) n FROM acq_appels").get().n, 0); });

  r = await clore('51', { cle: 'b', statut_final: 'REQUALIFIE', fiches: { 501: { decision: 'GARDER', projet: pro } }, nouvelles: [{ cle: 'NOUVEAU-1', projet: resid }] });
  t('l’appel est enregistré avec le nouveau projet', () => { eq(r.statut, 201); eq(r.corps.nouveaux_projets.length, 1); eq(r.corps.nouveaux_projets[0], 'N-51-1'); });
  const n = db.prepare("SELECT * FROM acq_fiches WHERE id_fiche = 'N-51-1'").get();
  t('une recherche de plus, rattachée au contact, gardée', () => { eq(n.id_contact, '51'); eq(n.decision, 'GARDER'); eq(n.creee_appli, 1); eq(n.creee_par, 'Lila Essai'); eq(n.id_modelo_cree, null); });
  t('avec ses critères', () => { eq(n.type_recherche, 'Achat'); eq(n.type_bien, 'Appartement/Maison'); eq(n.budget_max, 380000); eq(n.surface_min, 90); eq(n.communes, 'Crolles, Bernin'); eq(JSON.parse(n.requalif).pieces, 4); });
  t('la recherche existante est mise à jour, pas remplacée', () => { const f = db.prepare("SELECT * FROM acq_fiches WHERE id_fiche = '501'").get(); eq(f.creee_appli, 0); eq(JSON.parse(f.requalif).budget_max, 500000); });

  r = await clore('51', { cle: 'b', statut_final: 'REQUALIFIE', fiches: { 501: { decision: 'GARDER', projet: pro } }, nouvelles: [{ cle: 'NOUVEAU-1', projet: resid }] });
  t('même envoi rejoué : pas de doublon', () => { eq(r.corps.deja, true); eq(db.prepare("SELECT COUNT(*) n FROM acq_fiches WHERE id_contact = '51'").get().n, 2); });

  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/51');
  t('la fiche d’appel la retrouve, marquée nouvelle', () => { eq(r.corps.fiches.length, 2); const f = r.corps.fiches.find(x => x.id_fiche === 'N-51-1'); eq(f.creee_appli, 1); eq(f.requalif.budget_max, 380000); });

  console.log('\nle report vers Modelo');
  const quand = () => db.prepare("SELECT datetime('now') d").get().d;
  let lignes = M.lignesReport(quand());
  t('l’envoi des créations est ouvert', () => eq(M.ENVOI_CREATIONS, true));
  t('deux lignes : la recherche existante, puis la création', () => { const l = lignes.filter(l => l.id_contact === '51'); eq(l.length, 2); eq(l[0].id_fiche, '501'); eq(l[1].id_fiche, ''); });
  t('la recherche existante part comme avant', () => { const l = lignes.find(l => l.id_fiche === '501'); eq(l.type_bien_apres, 'Immobilier Pro'); eq(l.nego_fiche_cible, 'Lila Essai'); eq(l.creer_fiche, ''); eq(l.ref_creation, ''); });
  t('la note du contact décrit le nouveau projet', () => { const l = lignes.find(l => l.id_fiche === '501');
    eq(/Nouveau projet d’achat, en plus : maison ou appartement, budget 380 000 €, 90 m² minimum, secteur Crolles, Bernin\./.test(l.commentaire), true, l.commentaire); });
  const cr = () => lignes.find(l => l.creer_fiche === 'oui');
  t('la ligne de création : pas de numéro, notre référence', () => { eq(cr().id_contact, '51'); eq(cr().id_fiche, ''); eq(cr().ref_creation, 'N-51-1'); });
  t('elle porte le projet', () => { eq(cr().type_bien_apres, 'Appartement/Maison'); eq(cr().surface_min_apres, '90'); eq(cr().pieces_min_apres, '4'); eq(/Crolles/.test(cr().secteurs_apres), true); eq(Number(cr().budget_max_apres) >= 380000, true); });
  t('le conseiller de la recherche est toujours rempli', () => eq(cr().nego_fiche_cible, 'Lila Essai'));
  t('alerte mail d’office sur un projet actif', () => eq(cr().alerte_mail, 'oui'));
  t('ni note ni coordonnées en double sur cette ligne', () => { eq(cr().commentaire, ''); eq(cr().nego_contact_cible, ''); eq(cr().tel_portable_apres, ''); eq(cr().archiver_fiche, ''); });
  t('le fichier a les deux colonnes, à la fin', () => { const tete = M.enCsv(lignes).split('\r\n')[0]; eq(tete.endsWith(';creer_fiche;ref_creation'), true, tete.slice(-60)); });
  t('il attend sa création', () => { const c = M.creationsEnAttente(); eq(c.length, 1); eq(c[0].id_fiche, 'N-51-1'); eq(c[0].nom, 'NOM51'); });
  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/creations');
  t('l’admin le voit dans le report', () => { eq(r.statut, 200); eq(r.corps.envoi_ouvert, true); eq(r.corps.creations.length, 1); });
  r = await req('l@t.fr', 'GET', '/acquereurs/admin/creations');
  t('pas l’appelante', () => eq(r.statut, 403));

  console.log('\nle retour d’Exploration Modelo');
  const retour = (ls) => 'id_contact;id_fiche;statut;motif_echec;jusqu_a;ref_creation\n' + ls.map(l => l.join(';')).join('\n');
  const j = lignes[0].jusqu_a;
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/report/retour', { csv: retour([['51', '501', 'reporté', '', j, ''], ['51', '', 'reporté', '', j, 'N-51-1']]) });
  t('création « reportée » sans numéro : refusée, le projet reste à créer', () => { eq(r.corps.creations.length, 0); eq(r.corps.echecs, 1); eq(M.creationsEnAttente().length, 1); });
  lignes = M.lignesReport(quand());
  t('la même référence repart au report suivant', () => eq(cr().ref_creation, 'N-51-1'));

  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/report/retour', { csv: retour([['51', '501', 'reporté', '', j, ''], ['51', '16049', 'reporté', '', j, 'N-51-1']]) });
  t('retour avec le numéro : rangé sur le projet', () => { eq(r.corps.creations.length, 1); eq(r.corps.creations[0].numero, '16049'); eq(r.corps.reportes, 1); });
  t('le projet n’est plus à créer', () => { const f = db.prepare("SELECT * FROM acq_fiches WHERE id_fiche = 'N-51-1'").get(); eq(f.id_modelo_cree, '16049'); eq(!!f.creation_reportee_le, true); eq(M.creationsEnAttente().length, 0); });
  t('plus rien à reporter pour ce contact', () => eq(M.lignesReport(quand()).filter(l => l.id_contact === '51').length, 0));

  console.log('\nun réimport Modelo, la recherche créée revient sous son numéro');
  let bi = I.importer([ENTETE, L('501', '51', { type_bien: 'Immobilier Pro' }), L('16049', '51', { type_bien: 'Maison' }), L('502', '52')].join('\n'), { madameFichier: 'Lila Essai', simulation: false });
  t('pas de doublon : toujours deux recherches', () => { eq(db.prepare("SELECT COUNT(*) n FROM acq_fiches WHERE id_contact = '51'").get().n, 2); eq(bi.fiches_creees_reconnues, 1); });
  t('notre projet garde ce que l’appelante a saisi', () => { const f = db.prepare("SELECT * FROM acq_fiches WHERE id_fiche = 'N-51-1'").get(); eq(f.budget_max, 380000); eq(JSON.parse(f.requalif).type_bien, 'Appartement/Maison'); });

  console.log('\nappel suivant : la mise à jour part sous le numéro Modelo');
  // Le test va plus vite que l'horloge : le report précédent est daté d'une minute plus tôt.
  db.prepare("UPDATE acq_contacts SET modelo_reporte_le = datetime('now', '-1 minute') WHERE id_contact = '51'").run();
  r = await clore('51', { cle: 'c', statut_final: 'REQUALIFIE', fiches: { 501: { decision: 'ARCHIVER', motif: 'projet abandonné' }, 'N-51-1': { decision: 'GARDER', projet: { ...resid, budget_max: 400000 } } } });
  t('appel enregistré', () => eq(r.statut, 201));
  t('l’archivage de l’ancienne attend la validation, pas le projet créé', () => eq(M.archivagesEnAttente().map(f => f.id_fiche).join(','), '501'));
  db.prepare("UPDATE acq_fiches SET archivage_valide = 1 WHERE id_fiche = '501'").run();
  lignes = M.lignesReport(quand());
  t('la ligne du projet porte son numéro Modelo, sans demande de création', () => { const l = lignes.find(l => l.id_fiche === '16049'); eq(!!l, true); eq(l.creer_fiche, ''); eq(l.ref_creation, ''); eq(l.type_bien_apres, 'Appartement/Maison'); });
  t('aucune référence provisoire ne part comme numéro', () => eq(lignes.some(l => /^N-/.test(l.id_fiche)), false));

  console.log('\nabandon avant création');
  r = await clore('52', { cle: 'g', statut_final: 'REQUALIFIE', fiches: { 502: { decision: 'GARDER', projet: pro } }, nouvelles: [{ cle: 'NOUVEAU-1', projet: resid }] });
  r = await clore('52', { cle: 'h', statut_final: 'REQUALIFIE', fiches: { 502: { decision: 'GARDER', projet: pro }, 'N-52-1': { decision: 'ARCHIVER', motif: 'projet abandonné' } } });
  t('archiver un projet jamais créé : accepté', () => eq(r.statut, 201));
  t('rien à valider, rien à créer', () => { eq(M.archivagesEnAttente().some(f => f.id_fiche === 'N-52-1'), false); eq(M.creationsEnAttente().length, 0); });
  t('et aucune ligne pour lui', () => eq(M.lignesReport(quand()).some(l => l.ref_creation === 'N-52-1' || /^N-/.test(l.id_fiche)), false));

  console.log('\ngarde-fous');
  r = await clore('52', { cle: 'd', statut_final: 'A_RAPPELER', date_prochaine_action: '2027-01-12T10:00', prochaine_action: 'Rappel', nouvelles: [{ cle: 'NOUVEAU-1', projet: resid }] });
  t('pas de nouveau projet sur un simple rappel convenu', () => eq(r.statut, 400));
  r = await clore('52', { cle: 'e', statut_final: 'REQUALIFIE', fiches: { 502: { decision: 'GARDER', projet: pro } }, nouvelles: Array.from({ length: 6 }, (_, i) => ({ cle: 'NOUVEAU-' + i, projet: resid })) });
  t('six d’un coup : refusé', () => eq(r.statut, 400));
  r = await clore('52', { cle: 'f', statut_final: 'REQUALIFIE', fiches: { 502: { decision: 'ARCHIVER', motif: 'projet ancien' }, 'N-52-1': { decision: 'ARCHIVER', motif: 'projet abandonné' } }, nouvelles: [{ cle: 'NOUVEAU-1', projet: resid }, { cle: 'NOUVEAU-2', projet: { ...resid, type_bien: 'Terrain' } }] });
  t('ancienne recherche archivée, deux nouveaux projets : requalifié accepté', () => { eq(r.statut, 201); eq(r.corps.nouveaux_projets.join(','), 'N-52-2,N-52-3'); });

  console.log(`\n${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
})();
