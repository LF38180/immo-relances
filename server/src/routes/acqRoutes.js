// Fichier Acquéreurs — espace cloisonné de « Madame Fichier Acquéreurs »
// (cahier des charges du 18/11/2026). Rien ici ne lit ni n'écrit les tables
// des relances de Chrystelle ou du courtage de Marine, sauf en lecture pour
// signaler un appel récent du même numéro.
const express = require('express');
const crypto = require('crypto');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const R = require('../utils/opRegles');
const { dateValide } = require('../utils/paris');
const A = require('../utils/acqRegles');
const I = require('../utils/acqImport');
const M = require('../utils/acqModelo');
const { journaliser } = require('../utils/journal');
const { cleTel } = require('../blocs');

const router = express.Router();
router.use(requireAuth);

function moi(req) {
  const u = db.prepare('SELECT id, prenom, nom, role, acces_acquereurs FROM users WHERE id = ?').get(req.user.id);
  if (!u) return null;
  return { id: u.id, nom_complet: `${u.prenom} ${u.nom}`.trim(), role: u.role, admin: u.role === 'admin', acces: !!u.acces_acquereurs || u.role === 'admin' };
}
const acces = (req, res, next) => { const m = moi(req); if (!m || !m.acces) return res.status(403).json({ error: 'Accès refusé' }); req.moi = m; next(); };
const admin = (req, res, next) => { const m = moi(req); if (!m || !m.admin) return res.status(403).json({ error: 'Réservé à l’administration' }); req.moi = m; next(); };
const json = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// Ce que voit la personne : ses contacts. L'admin voit tout.
// Une ligne par personne : ses détails d'appels fusionnés (le dernier gagne).
function personnes(lignes) {
  const m = new Map();
  for (const l of lignes) {
    const d = json(l.details) || {};
    const p = m.get(l.id_contact) || {};
    m.set(l.id_contact, { ...p, ...d, vendre: { ...(p.vendre || {}), ...(d.vendre || {}) }, marine: { ...(p.marine || {}), ...(d.marine || {}) },
      mandat: d.mandat || p.mandat });
  }
  return [...m.values()];
}
const perimetre = (m) => m.admin ? { where: '1=1', params: [] } : { where: 'sans_casse(c.madame_fichier) = sans_casse(?)', params: [m.nom_complet] };

router.get('/mon-acces', (req, res) => {
  const m = moi(req);
  if (!m || !m.acces) return res.json({ acces: false });
  const { where, params } = perimetre(m);
  const n = db.prepare(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.exclu IS NULL`).get(...params).n;
  res.json({ acces: true, admin: m.admin, contacts: n });
});

// Les compteurs d'un contact, pour la file et l'écran.
const SQL_COMPTEURS = `
  -- Le plafond mensuel compte les appels et les SMS, pas les mails.
  (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.canal <> 'MAIL' AND strftime('%Y-%m', a.horodatage) = ?) AS appels_ce_mois,
  (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels_total,
  (SELECT MAX(a.horodatage) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS dernier_appel_le,
  (SELECT a.issue FROM acq_appels a WHERE a.id_contact = c.id_contact ORDER BY a.horodatage DESC, a.id DESC LIMIT 1) AS derniere_issue,
  (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.issue IN ('PAS_DE_REPONSE','REPONDEUR')
     AND a.horodatage > COALESCE((SELECT MAX(b.horodatage) FROM acq_appels b WHERE b.id_contact = c.id_contact
       AND b.issue NOT IN ('PAS_DE_REPONSE','REPONDEUR')), '')) AS sans_reponse_de_suite,
  (SELECT COUNT(*) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS nb_fiches,
  (SELECT GROUP_CONCAT(DISTINCT f.ancien_conseiller) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS anciens_conseillers`;

// --- La file (cahier, section 3 : l'ordre de la file) ----------------------
router.get('/file', acces, (req, res) => res.json(calculerFile(req.moi)));

function calculerFile(m) {
  const { where, params } = perimetre(m);
  const maintenant = new Date();
  const tous = db.prepare(`SELECT c.*, ${SQL_COMPTEURS} FROM acq_contacts c
    WHERE ${where} AND c.exclu IS NULL`).all(R.moisCourant(), ...params);
  const recents = A.appelsRecentsAilleurs();

  const journal = A.oppositions();
  const ouverts = tous.filter(c => !A.STATUTS_FINAUX.includes(c.statut) && !c.stop_tel && !A.opposee(c, journal));
  const plafonnes = ouverts.filter(c => c.appels_ce_mois >= R.PLAFOND_MENSUEL);
  const possibles = ouverts.filter(c => c.appels_ce_mois < R.PLAFOND_MENSUEL);
  const neuf = (c) => !c.appels_total;
  const ancien = (c) => `${c.derniere_note_date || ''}`;

  // 1. Rappels convenus arrivés à échéance, par heure.
  const rappels = possibles.filter(c => c.statut === 'A_RAPPELER' && R.rappelDu(c.rappel_le, maintenant))
    .sort((a, b) => String(a.rappel_le).localeCompare(String(b.rappel_le)));
  const reste = possibles.filter(c => !rappels.includes(c) && c.statut !== 'A_RAPPELER');
  // 2. Délégués jamais appelés. 3. Acheteurs-vendeurs jamais appelés.
  const delegues = reste.filter(c => neuf(c) && c.source === 'DELEGUE');
  const vendeurs = reste.filter(c => neuf(c) && c.source !== 'DELEGUE' && c.acheteur_vendeur);
  // 4. Les autres jamais appelés, du plus récent au plus ancien : la dernière
  // note d'abord (elle dit quand on a parlé au client), sinon la période de
  // modification de la fiche.
  const periodes = new Map(db.prepare('SELECT id_contact, MAX(modifiee_periode) p FROM acq_fiches GROUP BY id_contact').all().map(x => [x.id_contact, x.p || '']));
  const cleRecence = (c) => [ancien(c), periodes.get(c.id_contact) || ''].sort().pop();
  // Avec eux : les fiches déjà appelées, sans statut, dont le dernier appel
  // n'est pas un sans-réponse — un faux numéro corrigé puis remis dans la
  // file, par exemple. Sans cela, elles n'entraient dans aucun groupe.
  const aReprendre = (c) => !neuf(c) && !['PAS_DE_REPONSE', 'REPONDEUR'].includes(c.derniere_issue);
  const autres = reste.filter(c => (neuf(c) && !delegues.includes(c) && !vendeurs.includes(c)) || aReprendre(c))
    .map(c => ({ c, k: cleRecence(c) })).sort((a, b) => b.k.localeCompare(a.k)).map(x => x.c);
  // 5. Sans-réponse dont le délai est passé (48 h, puis 7 jours), l'autre
  // tranche horaire d'abord.
  const sansRep = reste.filter(c => !neuf(c) && ['PAS_DE_REPONSE', 'REPONDEUR'].includes(c.derniere_issue));
  const retourLe = (c) => { const d = R.depuisSqlite(c.dernier_appel_le); return d ? d.getTime() + R.delaiRelanceMs(c.sans_reponse_de_suite) : null; };
  const relancables = sansRep.filter(c => retourLe(c) <= maintenant.getTime());
  const autreTranche = (c) => !R.memeTranche(R.depuisSqlite(c.dernier_appel_le), maintenant);
  const aRelancer = [...relancables.filter(autreTranche), ...relancables.filter(c => !autreTranche(c))];
  const enAttente = sansRep.filter(c => !relancables.includes(c));
  const prochain = enAttente.map(retourLe).filter(Boolean).sort((a, b) => a - b)[0];

  const file = [...rappels, ...delegues, ...vendeurs, ...autres, ...aRelancer].map(c => ({
    id_contact: c.id_contact, civilite: c.civilite, nom: c.nom, prenom: c.prenom, tel_portable: c.tel_portable,
    commune: c.commune, nb_fiches: c.nb_fiches, appels_ce_mois: c.appels_ce_mois, appels_total: c.appels_total,
    derniere_issue: c.derniere_issue, statut: c.statut, rappel_le: c.rappel_le, source: c.source,
    acheteur_vendeur: c.acheteur_vendeur, derniere_note_date: c.derniere_note_date,
    appel_recent: A.appelRecent(c, recents),
    groupe: rappels.includes(c) ? 'RAPPEL' : delegues.includes(c) ? 'DELEGUE' : vendeurs.includes(c) ? 'VENDEUR' : aRelancer.includes(c) ? 'RELANCE' : 'NOUVEAU',
  }));
  return ({
    plage: R.plageAppelOk(maintenant), file,
    groupes: { rappels: rappels.length, delegues: delegues.length, vendeurs: vendeurs.length, nouveaux: autres.length,
      relances: aRelancer.length, en_attente: enAttente.length, plafonnes: plafonnes.length,
      rappels_a_venir: possibles.filter(c => c.statut === 'A_RAPPELER' && !rappels.includes(c)).length },
    prochain_retour: prochain ? new Date(prochain).toISOString() : null,
  });
}

// --- Page d'accueil : où j'en suis, en un coup d'œil ----------------------
router.get('/accueil', acces, (req, res) => {
  const m = req.moi;
  const { where, params } = perimetre(m);
  const f = calculerFile(m);
  const n = (sql) => db.prepare(sql).get(...params).n;
  // Par PERSONNE : ce qu'on sait d'elle après tous ses appels. Depuis que
  // « vendre pour acheter » et le mandat sont repris d'un appel à l'autre,
  // compter les appels aurait compté deux fois la même vendeuse.
  const det = personnes(db.prepare(`SELECT a.id_contact, a.details FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE ${where} AND a.details IS NOT NULL AND a.statut_final IS NOT NULL ORDER BY a.horodatage`).all(...params));
  res.json({
    // Le texte d'accueil, écrit par Loïck dans Administration › Scripts.
    texte: db.prepare("SELECT texte FROM acq_scripts WHERE partie = 'accueil'").get()?.texte || '',
    a_appeler: f.file.length, rappels_dus: f.groupes.rappels, en_attente: f.groupes.en_attente, prochain_retour: f.prochain_retour,
    contacts: n(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.exclu IS NULL`),
    projets: n(`SELECT COUNT(*) n FROM acq_fiches x JOIN acq_contacts c ON c.id_contact = x.id_contact WHERE ${where} AND c.exclu IS NULL AND COALESCE(x.type_recherche,'') <> 'Location'`),
    jamais_appeles: n(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.exclu IS NULL AND NOT EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact)`),
    joints: n(`SELECT COUNT(DISTINCT a.id_contact) n FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact WHERE ${where} AND a.issue = 'JOINT'`),
    requalifies: n(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.statut = 'REQUALIFIE'`),
    projets_gardes: n(`SELECT COUNT(*) n FROM acq_fiches x JOIN acq_contacts c ON c.id_contact = x.id_contact WHERE ${where} AND x.decision = 'GARDER'`),
    fiches_nettoyees: n(`SELECT COUNT(*) n FROM acq_fiches x JOIN acq_contacts c ON c.id_contact = x.id_contact WHERE ${where} AND x.decision IN ('ARCHIVER','FUSIONNER')`),
    vendeurs: det.filter(d => d.vendre?.doit_vendre === 'OUI').length,
    estimations_proposees: det.filter(d => d.vendre?.estimation_proposee).length,
    estimations_acceptees: det.filter(d => d.vendre?.estimation_acceptee).length,
    courtage_proposes: det.filter(d => d.marine?.proposee).length,
    courtage_accords: det.filter(d => d.marine?.accord).length,
    mandats_proposes: det.filter(d => d.mandat).length,
    mandats_acceptes: det.filter(d => d.mandat?.etat === 'ACCEPTE').length,
    // Ce qui est déjà dans Modelo : contacts dont tout le travail est reporté,
    // et ceux qui ont du nouveau depuis.
    reportes_modelo: n(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.modelo_reporte_le IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.horodatage > c.modelo_reporte_le)`),
    en_attente_modelo: n(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where}
      AND EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.horodatage > COALESCE(c.modelo_reporte_le, ''))`),
    ...(m.admin ? { a_reporter: M.aReporter().length, a_valider: M.archivagesEnAttente().length,
      a_transmettre: aTransmettre().filter(x => !x.transmis_le && x.pret).length,
      oppositions_ailleurs: oppositionsAilleurs().length } : {}),
  });
});

// --- Un contact, avec toutes ses fiches ------------------------------------
function chargerContact(req, res) {
  const m = req.moi;
  const { where, params } = perimetre(m);
  const c = db.prepare(`SELECT c.*, ${SQL_COMPTEURS} FROM acq_contacts c WHERE c.id_contact = ? AND ${where}`)
    .get(R.moisCourant(), req.params.id, ...params);
  if (!c) { res.status(404).json({ error: 'Contact introuvable' }); return null; }
  return c;
}

router.get('/contacts/:id', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  const fiches = db.prepare('SELECT * FROM acq_fiches WHERE id_contact = ? ORDER BY modifiee_periode DESC, id_fiche DESC').all(c.id_contact)
    .map(f => ({ ...f, donnees: undefined, requalif: json(f.requalif) }));
  const appels = db.prepare('SELECT id, horodatage, canal, issue, statut_final, prochaine_action, date_prochaine_action, notes, madame_fichier, details FROM acq_appels WHERE id_contact = ? ORDER BY horodatage DESC').all(c.id_contact)
    .map(a => ({ ...a, texte: json(a.details)?.texte || null, details: undefined }));
  // Ce que les appels précédents ont appris et qui reste vrai : la situation
  // de logement et le mandat. L'écran repart de là au lieu de repartir à vide.
  const memoire = personnes(db.prepare("SELECT id_contact, details FROM acq_appels WHERE id_contact = ? AND statut_final IS NOT NULL AND details IS NOT NULL ORDER BY horodatage").all(c.id_contact))[0] || {};
  const scripts = Object.fromEntries(db.prepare('SELECT partie, texte FROM acq_scripts').all().map(s => [s.partie, s.texte]));
  const prochainSansRep = c.sans_reponse_de_suite + 1;
  res.json({
    contact: c, fiches, appels, memoire: { vendre: memoire.vendre || {}, mandat: memoire.mandat || null }, scripts,
    blocages: A.blocages(c, c.appels_ce_mois), alertes: A.alertes(),
    appel_recent: A.appelRecent(c, A.appelsRecentsAilleurs()),
    conseil_tentative: prochainSansRep >= 4 ? 'Quatrième tentative : envoyez un SMS ou un mail si pas de réponse.'
      : prochainSansRep === 3 ? 'Troisième tentative : laissez un message sur le répondeur.' : null,
  });
});

// Ce qui bloque l'appel, et ce qui n'est qu'un avertissement (l'heure) :
// l'écran le redemande chaque minute.
router.get('/contacts/:id/blocages', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  res.json({ blocages: A.blocages(c, c.appels_ce_mois), alertes: A.alertes() });
});

// --- Une tentative sans réponse (ou faux numéro), SMS, mail ----------------
router.post('/contacts/:id/tentative', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  const b = req.body || {};
  const canal = ['APPEL', 'SMS', 'MAIL'].includes(b.canal) ? b.canal : 'APPEL';
  const issue = canal === 'APPEL' ? b.issue : 'PAS_DE_REPONSE';
  if (!['PAS_DE_REPONSE', 'REPONDEUR', 'FAUX_NUMERO'].includes(issue)) return res.status(400).json({ error: 'Issue invalide' });
  if (typeof b.cle === 'string' && b.cle) { const deja = db.prepare('SELECT id FROM acq_appels WHERE cle = ?').get(b.cle); if (deja) return res.json({ id: deja.id, deja: true }); }
  if (canal === 'MAIL') {
    // Un mail n'est pas un appel : ni plage, ni plafond. Mais pas de mail à
    // qui n'en veut pas, ni à qui a demandé à ne plus être contacté.
    if (c.stop_mail) return res.status(409).json({ error: 'Stop mail : envoi de mail impossible.' });
    if (c.statut === 'NE_PLUS_CONTACTER' || A.opposee(c)) return res.status(409).json({ error: 'Cette personne a demandé à ne plus être contactée.' });
  } else {
    const bl = A.blocages(c, c.appels_ce_mois);
    if (bl.length) return res.status(409).json({ error: bl[0], blocages: bl });
  }
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 4000) : null;
  const cleAppel = typeof b.cle === 'string' ? b.cle.slice(0, 200) : null;
  const r = db.transaction(() => {
    // Le texte du SMS ou du mail, s'il a été noté : il part dans la note Modelo.
    // « SMS dans la foulée » : un répondeur suivi d'un SMS, c'est UNE tentative
    // (un seul appel compté au plafond), avec le texte du SMS gardé.
    const foulee = canal === 'APPEL' && b.sms === true && issue !== 'FAUX_NUMERO';
    const texte = (canal !== 'APPEL' || foulee) && typeof b.texte === 'string' && b.texte.trim() ? b.texte.trim().slice(0, 2000) : null;
    const details = foulee ? { sms: true, ...(texte ? { texte } : {}) } : texte ? { texte } : null;
    const id = db.prepare(`INSERT INTO acq_appels (id_contact, madame_fichier, user_id, canal, issue, notes, details, cle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id_contact, req.moi.nom_complet, req.moi.id, canal, issue, notes,
      details ? JSON.stringify(details) : null, cleAppel).lastInsertRowid;
    // Le statut ne bouge que s'il n'est pas déjà acquis : un sans-réponse sur
    // un contact requalifié qu'on rappelle ne défait pas sa requalification.
    let statut = c.statut;
    if (!A.STATUTS_FINAUX.includes(c.statut)) {
      // Faux numéro : la fiche sort de la file, à corriger côté admin.
      if (issue === 'FAUX_NUMERO') statut = 'FAUX_NUMERO';
      // Quatrième tentative sans réponse : SANS_REPONSE, elle sort aussi.
      else if (c.sans_reponse_de_suite + 1 >= A.TENTATIVES_MAX) statut = 'SANS_REPONSE';
      // Un rappel convenu resté sans réponse redevient un sans-réponse
      // ordinaire (48 h, puis 7 jours) : sinon il restait en tête de file.
      else if (c.statut === 'A_RAPPELER') statut = null;
    }
    if (statut !== c.statut) db.prepare("UPDATE acq_contacts SET statut = ?, statut_le = datetime('now'), rappel_le = NULL WHERE id_contact = ?").run(statut, c.id_contact);
    return { id, statut };
  })();
  res.status(201).json(r);
});

// --- L'appel abouti : tout ce que l'écran a recueilli ----------------------
router.post('/contacts/:id/cloture', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  const b = req.body || {};
  if (typeof b.cle === 'string' && b.cle) { const deja = db.prepare('SELECT id FROM acq_appels WHERE cle = ?').get(b.cle); if (deja) return res.json({ id: deja.id, deja: true }); }
  const statut = b.statut_final;
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 4000) : null;
  const cleAppel = typeof b.cle === 'string' ? b.cle.slice(0, 200) : null;
  const texteCourt = (v, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  if (!A.STATUTS.includes(statut)) return res.status(400).json({ error: 'Choisissez l’issue de l’appel.' });
  // Une opposition, une erreur d'identité ou un décès s'enregistrent toujours :
  // on ne refuse pas de noter que quelqu'un ne veut plus être appelé parce
  // qu'il est 13 h 05.
  const toujours = ['NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut);
  const bl = toujours ? [] : A.blocages(c, c.appels_ce_mois, new Date(), { entrant: b.entrant === true });
  if (bl.length) return res.status(409).json({ error: bl[0], blocages: bl });
  if (statut === 'A_RAPPELER' && !b.date_prochaine_action) return res.status(400).json({ error: 'Indiquez quand rappeler.' });
  if (b.date_prochaine_action) {
    const t = String(b.date_prochaine_action);
    const h = /T(\d{2}):(\d{2})$/.exec(t);
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t) || !dateValide(t.slice(0, 10)) || (h && (+h[1] > 23 || +h[2] > 59)))
      return res.status(400).json({ error: 'Date de la prochaine action illisible.' });
  }

  const fiches = db.prepare('SELECT id_fiche FROM acq_fiches WHERE id_contact = ?').all(c.id_contact).map(f => f.id_fiche);
  const dec = b.fiches || {};
  // Un appel qui a eu lieu traite TOUTES les fiches de la personne : on ne
  // laisse pas une recherche sans décision (sauf rappel convenu, opposition,
  // erreur d'identité ou décès, où la conversation n'a pas porté sur le projet).
  const sansProjet = ['A_RAPPELER', 'NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut);
  if (!sansProjet) {
    const oublies = fiches.filter(id => !dec[id]?.decision);
    if (oublies.length) return res.status(400).json({ error: `Décision manquante sur ${oublies.length} recherche${oublies.length > 1 ? 's' : ''} (garder, fusionner ou archiver).` });
  }
  // Une décision fournie est vérifiée quelle que soit l'issue.
  for (const id of fiches) {
    const d = dec[id];
    if (!d?.decision) continue;
    if (!['GARDER', 'FUSIONNER', 'ARCHIVER'].includes(d.decision)) return res.status(400).json({ error: 'Décision inconnue sur une recherche.' });
    if (d.decision === 'FUSIONNER' && (!d.fusion_dans || !fiches.includes(String(d.fusion_dans)) || dec[d.fusion_dans]?.decision !== 'GARDER'))
      return res.status(400).json({ error: 'Une fiche fusionnée doit l’être dans une fiche gardée.' });
    if (d.decision === 'ARCHIVER' && !String(d.motif || '').trim()) return res.status(400).json({ error: 'Le motif d’archivage est obligatoire.' });
  }
  if (statut === 'REQUALIFIE') {
    const gardees = fiches.filter(id => dec[id]?.decision === 'GARDER');
    if (!gardees.length) return res.status(400).json({ error: 'Requalifié : gardez au moins une recherche.' });
    // Décision de Loïck du 20/11 : « requalifié » = le projet est toujours d'actualité
    // et la fiche a été revue, qu'elle ait été modifiée, complétée ou simplement
    // confirmée telle quelle. Il n'est plus exigé que tout soit renseigné : ce qui
    // manque (budget, secteur, délai, financement) reste un rappel à l'écran.
    if (!gardees.some(id => dec[id].projet?.etat_projet === 'ACTIF'))
      return res.status(400).json({ error: 'Requalifié : le projet doit être « Actif » sur au moins une recherche gardée.' });
  }

  // Le mandat de recherche (complément au cahier, 18/11) : proposé pendant
  // l'appel à un contact requalifié ou en passe de l'être. Un mandat accepté
  // porte sa date d'acceptation, et la suite est le rendez-vous de signature
  // (la signature elle-même se fait hors du module).
  const ETATS_MANDAT = ['NON_PROPOSE', 'PROPOSE', 'ACCEPTE', 'REFUSE', 'A_REPROPOSER'];
  const m0 = b.mandat || {};
  const mandat = ETATS_MANDAT.includes(m0.etat) && m0.etat !== 'NON_PROPOSE' ? {
    etat: m0.etat,
    type: ['SIMPLE', 'EXCLUSIF'].includes(m0.type) ? m0.type : 'NON_PRECISE',
    date_acceptation: m0.etat === 'ACCEPTE' ? (m0.date_acceptation || null) : null,
    motif_refus: m0.etat === 'REFUSE' ? (String(m0.motif_refus || '').trim().slice(0, 300) || null) : null,
    // La date du rendez-vous de signature, si elle est calée ; sinon « à fixer ».
    rdv_signature: m0.etat === 'ACCEPTE' && b.prochaine_action === 'Rendez-vous de signature' && b.date_prochaine_action ? String(b.date_prochaine_action) : null,
  } : null;
  if (mandat?.etat === 'ACCEPTE') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mandat.date_acceptation || '')) return res.status(400).json({ error: 'Mandat de recherche accepté : indiquez la date d’acceptation.' });
    // Le rendez-vous de signature peut rester « à fixer » (décision du 18/11) :
    // le client dit oui sans que le créneau soit calé.
  }
  const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // Une coordonnée « modifiée » sans nouvelle valeur ne dit rien : refusée,
  // sinon le report sortait un « avant » rempli et un « après » vide.
  const coordonnees = objet(b.coordonnees);
  for (const k of ['tel_portable', 'tel_fixe', 'email']) {
    const x = coordonnees[k]; if (!x) continue;
    if (['MODIFIE', 'AJOUTE'].includes(x.etat) && !(typeof x.apres === 'string' && x.apres.trim()))
      return res.status(400).json({ error: `Coordonnées : indiquez la nouvelle valeur (${k === 'email' ? 'e-mail' : k === 'tel_fixe' ? 'fixe' : 'portable'}), ou choisissez « Confirmé ».` });
    if (x.apres != null && typeof x.apres !== 'string') return res.status(400).json({ error: 'Coordonnées illisibles.' });
  }
  if (coordonnees.adresse && ['MODIFIE', 'AJOUTE'].includes(coordonnees.adresse.etat)) {
    const a = objet(coordonnees.adresse.apres);
    if (!texteCourt(a.adresse)) return res.status(400).json({ error: 'Coordonnées : indiquez la nouvelle adresse, ou choisissez « Confirmée ».' });
    coordonnees.adresse = { ...coordonnees.adresse, apres: { adresse: texteCourt(a.adresse), code_postal: texteCourt(a.code_postal, 10), commune: texteCourt(a.commune, 100) } };
  }
  const stopMail = b.stop_mail === true;
  const achat = texteCourt(b.achat);
  const details = { coordonnees, vendre: objet(b.vendre), marine: objet(b.marine), consentement_rappel: !!b.consentement_rappel,
    ...(mandat ? { mandat } : {}), ...(b.entrant === true ? { entrant: true } : {}),
    ...(stopMail ? { stop_mail: true } : {}), ...(achat ? { achat } : {}) };
  const ecrire = db.transaction(() => {
    const issue = ['NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut) ? statut : statut === 'A_RAPPELER' && !b.joint ? 'A_RAPPELER' : 'JOINT';
    const id = db.prepare(`INSERT INTO acq_appels (id_contact, madame_fichier, user_id, canal, issue, statut_final,
        prochaine_action, date_prochaine_action, duree_sec, notes, details, cle)
      VALUES (?, ?, ?, 'APPEL', ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id_contact, req.moi.nom_complet, req.moi.id, issue, statut,
      texteCourt(b.prochaine_action, 100), b.date_prochaine_action || null, null, notes,
      JSON.stringify(details), cleAppel).lastInsertRowid;
    // Les coordonnées modifiées remplacent celles de l'appli (l'ancienne
    // valeur reste dans le détail de l'appel, et part en note dans Modelo).
    const co = details.coordonnees;
    const sets = [], vals = [];
    for (const k of ['tel_portable', 'tel_fixe', 'email']) {
      const x = co[k]; if (!x) continue;
      if (['MODIFIE', 'AJOUTE'].includes(x.etat) && x.apres) { sets.push(`${k} = ?`); vals.push(String(x.apres).trim()); }
      if (x.etat === 'A_SUPPRIMER') { sets.push(`${k} = NULL`); }
    }
    if (co.adresse && ['MODIFIE', 'AJOUTE'].includes(co.adresse.etat) && co.adresse.apres) {
      sets.push('adresse = ?', 'code_postal = ?', 'commune = ?');
      vals.push(co.adresse.apres.adresse || null, co.adresse.apres.code_postal || null, co.adresse.apres.commune || null);
    }
    sets.push("statut = ?", "statut_le = datetime('now')", 'rappel_le = ?');
    vals.push(statut, statut === 'A_RAPPELER' ? b.date_prochaine_action : null);
    if (b.consentement_rappel) sets.push("consentement_rappel = 1", "consentement_le = datetime('now')");
    if (stopMail) sets.push('stop_mail = 1');
    db.prepare(`UPDATE acq_contacts SET ${sets.join(', ')} WHERE id_contact = ?`).run(...vals, c.id_contact);
    for (const idf of fiches) {
      // Sans décision dans cet envoi, la fiche n'est pas touchée : un appel
      // « joint, à rappeler » ne doit pas effacer ce qui avait été saisi.
      const d = dec[idf]; if (!d?.decision) continue;
      const avant = db.prepare('SELECT decision, fusion_dans, motif_archivage, requalif, archivage_valide FROM acq_fiches WHERE id_fiche = ?').get(idf);
      const fusion = d.decision === 'FUSIONNER' ? String(d.fusion_dans) : null;
      const motif = d.decision === 'ARCHIVER' ? String(d.motif).trim() : null;
      // La validation de l'admin ne retombe que si la décision a changé.
      const inchangee = avant.decision === d.decision && (avant.fusion_dans || null) === fusion && (avant.motif_archivage || null) === motif;
      db.prepare(`UPDATE acq_fiches SET decision = ?, fusion_dans = ?, motif_archivage = ?, requalif = ?,
          decision_le = datetime('now'), decision_par = ?, archivage_valide = ? WHERE id_fiche = ?`)
        .run(d.decision, fusion, motif, d.decision === 'GARDER' && d.projet ? JSON.stringify(d.projet) : avant.requalif,
          req.moi.nom_complet, inchangee ? avant.archivage_valide : null, idf);
    }
    // « Ne plus contacter » : écrit tout de suite dans le journal commun des
    // oppositions. La personne sort de toutes les files de tous les modules.
    if (statut === 'NE_PLUS_CONTACTER') {
      db.prepare(`INSERT INTO op_journal_opposition (id_modelo, canal, origine, agent, nom, prenom, telephone)
        VALUES (?, 'TELEPHONE', 'FICHIER_ACQUEREURS', ?, ?, ?, ?)`).run(c.id_contact, req.moi.nom_complet, c.nom, c.prenom, c.tel_portable || c.tel_fixe);
      db.prepare('UPDATE acq_contacts SET stop_tel = 1 WHERE id_contact = ?').run(c.id_contact);
      // Dans l'opération anciens clients, la même personne (même identifiant
      // Modelo ou même numéro) reçoit son stop téléphone tout de suite. Les
      // fiches de Chrystelle et de Marine ne sont PAS touchées en silence :
      // elles sont signalées à l'administration (oppositionsAilleurs).
      const tels = [cleTel(c.tel_portable), cleTel(c.tel_fixe)].filter(Boolean);
      const stop = db.prepare('UPDATE op_contacts SET stop_telephone = 1 WHERE id_modelo = ?');
      stop.run(c.id_contact);
      if (tels.length) for (const o of db.prepare('SELECT id_modelo, tel_portable, tel_fixe FROM op_contacts WHERE stop_telephone = 0').all())
        if ([cleTel(o.tel_portable), cleTel(o.tel_fixe)].some(t => t && tels.includes(t))) stop.run(o.id_modelo);
    }
    return id;
  });
  const id = ecrire();
  res.status(201).json({ id, statut });
});

// --- Retrouver quelqu'un : un client rappelle, ou on veut rouvrir sa fiche ---
// Tout le portefeuille, appelé ou non, y compris les fiches hors file (avec
// leur motif). Comme « Mes contacts » de l'opération anciens clients.
router.get('/mes-contacts', acces, (req, res) => {
  const { where, params } = perimetre(req.moi);
  const lignes = db.prepare(`SELECT c.id_contact, c.civilite, c.nom, c.prenom, c.tel_portable, c.tel_fixe, c.email, c.commune,
      c.statut, c.exclu, c.stop_tel, c.rappel_le,
      (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels,
      (SELECT MAX(a.horodatage) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS dernier_le,
      (SELECT a.issue FROM acq_appels a WHERE a.id_contact = c.id_contact ORDER BY a.horodatage DESC, a.id DESC LIMIT 1) AS derniere_issue,
      (SELECT a.canal FROM acq_appels a WHERE a.id_contact = c.id_contact ORDER BY a.horodatage DESC, a.id DESC LIMIT 1) AS dernier_canal,
      (SELECT COUNT(*) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS nb_fiches
    FROM acq_contacts c WHERE ${where} ORDER BY c.nom, c.prenom`).all(...params);
  res.json(lignes.map(l => ({ ...l, exclu_libelle: l.exclu ? (I.LIBELLES_EXCLUSION[l.exclu] || l.exclu) : null })));
});

// Ce que j'ai fait aujourd'hui (bouton « Effectués »), pour rouvrir une fiche.
router.get('/effectues', acces, (req, res) => {
  const { where, params } = perimetre(req.moi);
  res.json(db.prepare(`SELECT a.id, a.id_contact, a.horodatage, a.canal, a.issue, a.statut_final, a.details,
      c.civilite, c.nom, c.prenom
    FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE date(a.horodatage, 'localtime') = date('now', 'localtime') AND ${where}
      AND (sans_casse(a.madame_fichier) = sans_casse(?) OR ?)
    ORDER BY a.horodatage DESC`).all(...params, req.moi.nom_complet, req.moi.admin ? 1 : 0)
    .map(l => ({ ...l, texte: json(l.details)?.texte || null, details: undefined })));
});

// --- Démonstration : trois acquéreurs fictifs, rien d'enregistré ----------
router.get('/demo', admin, (req, res) => {
  const scripts = Object.fromEntries(db.prepare('SELECT partie, texte FROM acq_scripts').all().map(x => [x.partie, x.texte]));
  res.json({ cas: require('../utils/acqDemo').cas(scripts) });
});

// --- Suivi (cahier, section 6) ---------------------------------------------
router.get('/suivi', acces, (req, res) => {
  const { where, params } = perimetre(req.moi);
  const debut = /^\d{4}-\d{2}-\d{2}$/.test(req.query.debut || '') ? req.query.debut : '2000-01-01';
  const q = (sql) => db.prepare(sql).get(debut, ...params).n;
  const base = `FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact WHERE date(a.horodatage, 'localtime') >= ? AND ${where}`;
  const lignes = db.prepare(`SELECT a.id_contact, a.details, a.statut_final FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE date(a.horodatage, 'localtime') >= ? AND ${where} AND a.statut_final IS NOT NULL ORDER BY a.horodatage`).all(debut, ...params);
  const d = personnes(lignes.filter(x => x.details));
  // Le dernier statut de chaque personne sur la période.
  const dernier = new Map(lignes.map(x => [x.id_contact, x.statut_final]));
  const statuts = [...dernier.values()];
  const issues = Object.fromEntries(db.prepare(`SELECT CASE WHEN a.canal = 'APPEL' THEN a.issue ELSE a.canal END k, COUNT(*) n ${base} GROUP BY k`).all(debut, ...params).map(x => [x.k, x.n]));
  const traites = q(`SELECT COUNT(DISTINCT a.id_contact) n ${base}`);
  const joints = q(`SELECT COUNT(DISTINCT a.id_contact) n ${base} AND a.issue = 'JOINT'`);
  res.json({
    appels: q(`SELECT COUNT(*) n ${base}`),
    traites, joints, taux_joints: traites ? Math.round((joints / traites) * 100) : null,
    issues,
    par_jour: db.prepare(`SELECT date(a.horodatage, 'localtime') j, COUNT(*) appels, COUNT(DISTINCT CASE WHEN a.issue = 'JOINT' THEN a.id_contact END) joints
      ${base} GROUP BY j ORDER BY j DESC LIMIT 14`).all(debut, ...params),
    par_personne: db.prepare(`SELECT a.madame_fichier qui, COUNT(*) appels, COUNT(DISTINCT a.id_contact) traites,
        COUNT(DISTINCT CASE WHEN a.issue = 'JOINT' THEN a.id_contact END) joints,
        COUNT(DISTINCT CASE WHEN a.statut_final = 'REQUALIFIE' THEN a.id_contact END) requalifies
      ${base} GROUP BY a.madame_fichier ORDER BY appels DESC`).all(debut, ...params),
    requalifies: statuts.filter(x => x === 'REQUALIFIE').length,
    archives: statuts.filter(x => ['ABANDONNE', 'DEJA_ACHETE', 'NE_PLUS_CONTACTER'].includes(x)).length,
    vendeurs: d.filter(x => x.vendre?.doit_vendre === 'OUI').length,
    estimations_proposees: d.filter(x => x.vendre?.estimation_proposee).length,
    estimations_acceptees: d.filter(x => x.vendre?.estimation_acceptee).length,
    marine: d.filter(x => x.marine?.proposee).length,
    mandats_proposes: d.filter(x => x.mandat).length,
    mandats_acceptes: d.filter(x => x.mandat?.etat === 'ACCEPTE').length,
    restants: db.prepare(`SELECT COUNT(*) n FROM acq_contacts c WHERE ${where} AND c.exclu IS NULL
      AND NOT EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact)`).get(...params).n,
  });
});

// --- Administration --------------------------------------------------------
router.post('/admin/import', admin, (req, res) => {
  const b = req.body || {};
  if (typeof b.csv !== 'string' || !b.csv.trim()) return res.status(400).json({ error: 'Aucun contenu à importer' });
  const r = I.importer(b.csv, { doublonsCsv: b.doublons_csv || null, madameFichier: b.madame_fichier, simulation: b.ecrire !== true });
  if (!r.ok) return res.status(400).json(r);
  if (b.ecrire === true) journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'IMPORT', { details: { module: 'acquereurs', contacts: r.contacts, fiches: r.fiches } });
  res.json(r);
});

router.get('/admin/contacts', admin, (req, res) => {
  const lignes = db.prepare(`SELECT c.id_contact, c.civilite, c.nom, c.prenom, c.tel_portable, c.tel_fixe, c.email, c.commune,
      c.suivi_par, c.madame_fichier, c.exclu, c.statut, c.statut_le, c.stop_tel, c.stop_mail, c.modelo_reporte_le,
      (SELECT h.motif FROM acq_hors_mission h WHERE h.id_contact = c.id_contact AND h.leve_le IS NULL) AS sorti_motif,
      ${SQL_COMPTEURS} FROM acq_contacts c ORDER BY c.nom, c.prenom`).all(R.moisCourant());
  res.json({ contacts: lignes, libelles: I.LIBELLES_EXCLUSION });
});

// Remettre dans la file un contact écarté (un numéro retrouvé, par exemple).
router.post('/admin/contacts/:id/reintegrer', admin, (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM acq_contacts WHERE id_contact = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  const sets = ['exclu = NULL', 'exclu_leve = 1'], vals = [];
  const tel = typeof b.tel_portable === 'string' ? b.tel_portable.trim() : '';
  if (tel && !cleTel(tel)) return res.status(400).json({ error: 'Numéro illisible.' });
  if (tel) { sets.push('tel_portable = ?'); vals.push(tel); }
  if (c.statut === 'FAUX_NUMERO' && tel) sets.push('statut = NULL');
  db.prepare(`UPDATE acq_contacts SET ${sets.join(', ')} WHERE id_contact = ?`).run(...vals, c.id_contact);
  // Une sortie hors mission est levée, pas effacée : sinon le prochain import la reposerait.
  const leve = db.prepare(`UPDATE acq_hors_mission SET leve_le = datetime('now'), leve_par = ?
    WHERE id_contact = ? AND leve_le IS NULL`).run(req.moi.nom_complet, c.id_contact);
  if (leve.changes) journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'ACQ_SORTIE_LEVEE', { details: { id_contact: c.id_contact } });
  res.json({ ok: true });
});

// Sortir des personnes de la mission, à partir d'un fichier (id_contact ; nom ;
// prenom ; motif). On vérifie d'abord, on enregistre ensuite.
router.post('/admin/sortir', admin, (req, res) => {
  const b = req.body || {};
  if (typeof b.csv !== 'string' || !b.csv.trim()) return res.status(400).json({ error: 'Aucun contenu à lire' });
  const r = require('../utils/acqSortie').sortir(b.csv, { simulation: b.ecrire !== true, par: req.moi.nom_complet, fichier: String(b.fichier || '').slice(0, 200) });
  if (!r.ok) return res.status(400).json(r);
  if (!r.simulation) journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'ACQ_SORTIE_HORS_MISSION', { details: { contacts: r.sortis.length, inconnus: r.inconnus.length } });
  res.json(r);
});

// Le Listing : chaque contact avec ce qu'on en sait, pour filtrer et exporter
// (comme le Listing de l'opération anciens clients).
router.get('/admin/listing', admin, (req, res) => {
  const lignes = db.prepare(`SELECT c.*, ${SQL_COMPTEURS},
      (SELECT a.details FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.statut_final IS NOT NULL ORDER BY a.horodatage DESC LIMIT 1) AS details_fin,
      (SELECT COUNT(*) FROM acq_fiches f WHERE f.id_contact = c.id_contact AND f.decision = 'GARDER') AS fiches_gardees,
      (SELECT COUNT(*) FROM acq_fiches f WHERE f.id_contact = c.id_contact AND f.decision IN ('ARCHIVER','FUSIONNER')) AS fiches_archivees,
      (SELECT MAX(f.budget_max) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS budget_max,
      (SELECT GROUP_CONCAT(DISTINCT f.type_bien) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS types_bien,
      EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact AND a.horodatage > COALESCE(c.modelo_reporte_le, '')) AS a_reporter
    FROM acq_contacts c ORDER BY c.nom, c.prenom`).all(R.moisCourant());
  res.json({ libelles: I.LIBELLES_EXCLUSION, contacts: lignes.map(l => {
    const d = json(l.details_fin) || {};
    return { id_contact: l.id_contact, civilite: l.civilite, nom: l.nom, prenom: l.prenom, tel_portable: l.tel_portable,
      tel_fixe: l.tel_fixe, email: l.email, commune: l.commune, madame_fichier: l.madame_fichier, source: l.source,
      statut: l.statut, statut_le: l.statut_le, rappel_le: l.rappel_le, exclu: l.exclu, stop_tel: l.stop_tel, stop_mail: l.stop_mail,
      anciens_conseillers: l.anciens_conseillers, nb_fiches: l.nb_fiches, fiches_gardees: l.fiches_gardees, fiches_archivees: l.fiches_archivees,
      budget_max: l.budget_max, types_bien: l.types_bien,
      appels: l.appels_total, appels_ce_mois: l.appels_ce_mois, dernier_appel_le: l.dernier_appel_le, derniere_issue: l.derniere_issue,
      vendeur: d.vendre?.doit_vendre === 'OUI' ? 1 : 0, estimation_proposee: d.vendre?.estimation_proposee ? 1 : 0,
      estimation_acceptee: d.vendre?.estimation_acceptee ? 1 : 0, date_rdv_estimation: d.vendre?.date_rdv_estimation || null,
      marine_proposee: d.marine?.proposee ? 1 : 0, marine_accord: d.marine?.accord ? 1 : 0,
      mandat: d.mandat?.etat || null, mandat_type: d.mandat?.type || null,
      consentement_rappel: l.consentement_rappel, modelo_reporte_le: l.modelo_reporte_le, a_reporter: l.a_reporter ? 1 : 0 };
  }) });
});

router.get('/admin/a-valider', admin, (req, res) => res.json({ fiches: M.archivagesEnAttente() }));
router.post('/admin/valider', admin, (req, res) => {
  const items = (Array.isArray(req.body?.fiches) ? req.body.fiches : []).filter(f => f && f.id_fiche != null);
  const st = db.prepare(`UPDATE acq_fiches SET archivage_valide = ?, archivage_valide_par = ?, archivage_valide_le = datetime('now') WHERE id_fiche = ?`);
  db.transaction(() => { for (const f of items) st.run(f.accepte ? 1 : 0, req.moi.nom_complet, String(f.id_fiche)); })();
  res.json({ ok: true, n: items.length });
});

router.get('/admin/report', admin, (req, res) => {
  const attente = M.archivagesEnAttente().length;
  if (attente) return res.status(409).json({ error: `${attente} archivage${attente > 1 ? 's' : ''} à valider avant le report.`, attente });
  const jusquA = db.prepare("SELECT datetime('now') d").get().d;
  const lignes = M.lignesReport(jusquA);
  const contacts = new Set(lignes.map(l => l.id_contact)).size;
  if (req.query.format === 'csv') {
    // Chaque fichier téléchargé laisse une trace : deux fichiers du même jour
    // envoyés à Exploration Modelo, ce sont des notes en double dans Modelo.
    db.prepare('INSERT INTO acq_telechargements (par, jusqu_a, contacts, lignes) VALUES (?, ?, ?, ?)').run(req.moi.nom_complet, jusquA, contacts, lignes.length);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Report_Modelo_Acquereurs_${jusquA.slice(0, 16).replace(' ', '_').replace(':', 'h')}.csv"`);
    return res.send(M.enCsv(lignes));
  }
  res.json({ jusqu_a: jusquA, contacts, fiches: lignes.length, lignes,
    // Ce que ce report change dans Modelo, à relire avant de télécharger.
    reattributions: lignes.filter(l => l.nego_contact_cible).map(l => ({ id_contact: l.id_contact, nom: l.nom, prenom: l.prenom, vers: l.nego_contact_cible })),
    archivages: lignes.filter(l => l.archiver_fiche).length });
});

// Où en est le report : le dernier fichier téléchargé, s'il attend son retour,
// et les échecs du dernier retour (ils restaient affichés un instant, puis
// plus rien ne disait qui avait échoué ni pourquoi).
router.get('/admin/report/etat', admin, (req, res) => {
  const tel = db.prepare('SELECT le, par, jusqu_a, contacts, lignes FROM acq_telechargements ORDER BY id DESC LIMIT 1').get() || null;
  const retour = db.prepare('SELECT le, par, contacts, fiches FROM acq_reports ORDER BY id DESC LIMIT 1').get() || null;
  const echecs = db.prepare(`SELECT r.id_contact, c.nom, c.prenom, r.motif, r.importe_le FROM acq_modelo_reports r
    JOIN acq_contacts c ON c.id_contact = r.id_contact
    WHERE r.statut = 'ECHEC' AND r.id = (SELECT MAX(x.id) FROM acq_modelo_reports x WHERE x.id_contact = r.id_contact AND x.statut = 'ECHEC')
      AND r.importe_le >= COALESCE(c.modelo_reporte_le, '')
      AND NOT EXISTS (SELECT 1 FROM acq_modelo_reports y WHERE y.id_contact = r.id_contact AND y.statut = 'REPORTE' AND y.id > r.id)
    ORDER BY c.nom, c.prenom`).all();
  // Un fichier téléchargé n'attend son retour que s'il reste quelque chose à reporter :
  // une fois les contacts d'essai effacés, plus rien n'est en attente.
  res.json({ telechargement: tel, retour, en_attente_de_retour: !!tel && (!retour || retour.le < tel.le) && M.aReporter().length > 0, echecs });
});

// Le fichier de retour d'Exploration Modelo, comme pour l'opération anciens
// clients : le fichier de report, avec pour chaque ligne une colonne
// « statut » (reporté ou échec) et, si échec, « motif_echec ». Un contact est
// marqué reporté quand toutes ses lignes le sont ; une seule ligne en échec et
// il reste « à reporter », avec son motif.
router.post('/admin/report/retour', admin, (req, res) => {
  const csv = req.body?.csv;
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'Aucun fichier de retour' });
  const { lignes, colonnes } = I.lire(csv);
  const manque = ['id_contact', 'statut'].filter(c => !colonnes.includes(c));
  if (manque.length) return res.status(400).json({ error: `Colonnes attendues : id_contact ; id_fiche ; statut ; motif_echec ; jusqu_a (absentes : ${manque.join(', ')})` });
  // Le même fichier chargé deux fois : refusé. Un ancien fichier rechargé par
  // erreur faisait reculer la date de report, et les appels déjà reportés
  // repartaient dans le fichier suivant (notes en double dans Modelo).
  const empreinte = crypto.createHash('sha1').update(csv.replace(/\r\n/g, '\n').trim()).digest('hex');
  const dejaCharge = db.prepare('SELECT le, par FROM acq_reports WHERE empreinte = ?').get(empreinte);
  if (dejaCharge) return res.status(409).json({ error: `Ce fichier de retour a déjà été chargé le ${M.jour(dejaCharge.le)}${dejaCharge.par ? ` par ${dejaCharge.par}` : ''}. Rien n’a été modifié.` });
  const existe = db.prepare('SELECT 1 FROM acq_contacts WHERE id_contact = ?');
  const inserer = db.prepare('INSERT INTO acq_modelo_reports (id_contact, id_fiche, le, statut, motif, par) VALUES (?, ?, ?, ?, ?, ?)');
  const parContact = new Map(); const inconnus = new Set();
  for (const l of lignes) {
    const id = String(l.id_contact || '').trim();
    if (!id) continue;
    if (!existe.get(id)) { inconnus.add(id); continue; }
    const statut = /^report/i.test(String(l.statut || '').trim()) ? 'REPORTE' : 'ECHEC';
    if (!parContact.has(id)) parContact.set(id, []);
    parContact.get(id).push({ ...l, statut });
  }
  const maintenant = db.prepare("SELECT datetime('now') d").get().d;
  let reportes = 0, echecs = 0; const motifs = [], sansDate = [], dateFuture = [];
  // « 2026-11-18 10:00:00 », « 2026-11-18T10:00 » ou « 18/11/2026 10:00 » (tableur).
  const dateRetour = (v) => {
    const t = String(v || '').trim(); let m;
    if ((m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/))) return `${m[1]} ${m[2]}${m[3] || ':00'}`;
    if ((m = t.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})(:\d{2})?$/))) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}${m[5] || ':00'}`;
    return null;
  };
  db.transaction(() => {
    for (const [id, ls] of parContact) {
      for (const l of ls) inserer.run(id, String(l.id_fiche || '').trim() || null, String(l.horodatage || '').trim() || maintenant,
        l.statut, String(l.motif_echec || '').trim() || null, req.moi.nom_complet);
      if (ls.every(l => l.statut === 'REPORTE')) {
        // La date « jusqu_a » dit jusqu'où le fichier allait. Sans elle (colonne
        // perdue, ou reformatée par un tableur), on ne devine pas : marquer
        // « reporté à maintenant » ferait disparaître les appels passés depuis
        // l'export. Le contact reste à reporter, et on le dit.
        const j = ls.map(l => dateRetour(l.jusqu_a)).find(Boolean);
        if (!j) { sansDate.push(id); continue; }
        // Une date dans le futur rendrait invisibles tous les appels à venir.
        if (j > maintenant) { dateFuture.push(id); continue; }
        // La date de report ne recule jamais.
        db.prepare(`UPDATE acq_contacts SET modelo_reporte_le = CASE WHEN COALESCE(modelo_reporte_le, '') > ? THEN modelo_reporte_le ELSE ? END
          WHERE id_contact = ?`).run(j, j, id);
        reportes++;
      } else { echecs++; const e = ls.find(l => l.statut === 'ECHEC'); motifs.push({ id_contact: id, motif: String(e.motif_echec || '').trim() || null }); }
    }
    db.prepare('INSERT INTO acq_reports (par, jusqu_a, contacts, fiches, empreinte) VALUES (?, ?, ?, ?, ?)').run(req.moi.nom_complet, maintenant, reportes, lignes.length, empreinte);
  })();
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'MODELO_RETOUR', { details: { module: 'acquereurs', reportes, echecs, inconnus: inconnus.size } });
  res.json({ ok: true, reportes, echecs, inconnus: [...inconnus], motifs, sans_date: sansDate, date_future: dateFuture });
});

// Ce qui part chez Marine et les estimations à caler (aucune fiche créée chez
// elles). Une ligne par personne et par type : le dernier appel qui en parle.
// `pret` : il y a quelque chose à transmettre (le client est d'accord, ou
// l'estimation est acceptée). `transmis_le` : c'est fait, la ligne sort de la
// liste « à transmettre ».
function aTransmettre() {
  const appels = db.prepare(`SELECT a.id_contact, a.horodatage, a.madame_fichier, a.details, c.nom, c.prenom, c.tel_portable, c.tel_fixe, c.source,
      (SELECT GROUP_CONCAT(DISTINCT f.ancien_conseiller) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS conseiller
    FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE a.details IS NOT NULL AND a.statut_final IS NOT NULL ORDER BY a.horodatage DESC`).all();
  const faites = db.prepare('SELECT id_contact, type, MAX(le) le, par FROM acq_transmissions GROUP BY id_contact, type').all();
  const transmis = (id, type) => faites.find(t => t.id_contact === id && t.type === type) || null;
  const vus = new Set(); const lignes = [];
  for (const l of appels) {
    const d = json(l.details) || {};
    const base = { id_contact: l.id_contact, horodatage: l.horodatage, madame_fichier: l.madame_fichier, nom: l.nom, prenom: l.prenom,
      tel: l.tel_portable || l.tel_fixe, conseiller: l.conseiller };
    if (d.marine?.proposee && !vus.has('M' + l.id_contact)) {
      vus.add('M' + l.id_contact); const t = transmis(l.id_contact, 'MARINE');
      lignes.push({ ...base, type: 'MARINE', pret: !!d.marine.accord, transmis_le: t && t.le >= l.horodatage ? t.le : null, transmis_par: t?.par || null });
    }
    if (d.vendre?.estimation_proposee && !vus.has('E' + l.id_contact)) {
      vus.add('E' + l.id_contact); const t = transmis(l.id_contact, 'ESTIMATION');
      lignes.push({ ...base, type: 'ESTIMATION', pret: !!d.vendre.estimation_acceptee, date_rdv: d.vendre.date_rdv_estimation || null,
        adresse: d.vendre.adresse_bien_a_vendre || null, transmis_le: t && t.le >= l.horodatage ? t.le : null, transmis_par: t?.par || null });
    }
  }
  return lignes;
}
router.get('/admin/transmettre', admin, (req, res) => {
  const l = aTransmettre();
  res.json({ marine: l.filter(x => x.type === 'MARINE'), estimations: l.filter(x => x.type === 'ESTIMATION'), oppositions: oppositionsAilleurs() });
});
router.post('/admin/transmettre', admin, (req, res) => {
  const b = req.body || {};
  if (!['MARINE', 'ESTIMATION'].includes(b.type)) return res.status(400).json({ error: 'Type inconnu' });
  const id = String(b.id_contact || '');
  if (!db.prepare('SELECT 1 FROM acq_contacts WHERE id_contact = ?').get(id)) return res.status(404).json({ error: 'Contact introuvable' });
  db.prepare('INSERT INTO acq_transmissions (id_contact, type, par) VALUES (?, ?, ?)').run(id, b.type, req.moi.nom_complet);
  res.json({ ok: true });
});

// Une personne qui a dit « ne plus me contacter » à l'appelante acquéreurs et
// qui a aussi une fiche chez Chrystelle (Estimés) ou chez Marine (courtage),
// encore ouverte. On ne touche pas à leurs fiches en silence (décision du
// 18/11) : on le signale ici, l'administration tranche avec elles.
function oppositionsAilleurs() {
  const vues = new Set(db.prepare('SELECT id_contact FROM acq_oppositions_vues').all().map(x => x.id_contact));
  const opposes = db.prepare("SELECT id_contact, nom, prenom, tel_portable, tel_fixe, statut_le FROM acq_contacts WHERE statut = 'NE_PLUS_CONTACTER'").all()
    .filter(c => !vues.has(c.id_contact));
  if (!opposes.length) return [];
  const estimes = db.prepare("SELECT nom, prenom, telephone, telephone2 FROM contacts WHERE statut NOT IN ('pas_interesse','inactif')").all();
  const courtage = db.prepare("SELECT nom, prenom, telephone FROM courtage_fiches WHERE statut NOT IN ('gagne','perdu','ne_plus_contacter','faux_numero')").all();
  const res = [];
  for (const c of opposes) {
    const tels = [cleTel(c.tel_portable), cleTel(c.tel_fixe)].filter(Boolean);
    if (!tels.length) continue;
    const ou = [];
    if (estimes.some(e => [cleTel(e.telephone), cleTel(e.telephone2)].some(t => t && tels.includes(t)))) ou.push('Mission Estimés');
    if (courtage.some(e => tels.includes(cleTel(e.telephone)))) ou.push('Mission Courtage');
    if (ou.length) res.push({ id_contact: c.id_contact, nom: c.nom, prenom: c.prenom, tel: c.tel_portable || c.tel_fixe, le: c.statut_le, ou });
  }
  return res;
}
router.post('/admin/oppositions/:id/vue', admin, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO acq_oppositions_vues (id_contact, par) VALUES (?, ?)').run(String(req.params.id), req.moi.nom_complet);
  res.json({ ok: true });
});

// --- Contacts d'essai -----------------------------------------------------------
//
// Pour éprouver le report Modelo sans toucher à un vrai client, on importe des
// contacts fictifs dont le NOM commence par « ZZTEST ». Ce sont les SEULS que
// l'application accepte d'effacer, et seule l'administration le peut : toute
// autre fiche se sort de la file, elle ne se supprime pas.
const ESSAI = "UPPER(TRIM(nom)) LIKE 'ZZTEST%'";
const contactsEssai = () => db.prepare(`SELECT c.id_contact, c.nom, c.prenom,
    (SELECT COUNT(*) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS fiches,
    (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels
  FROM acq_contacts c WHERE ${ESSAI} ORDER BY c.prenom`).all();
router.get('/admin/essais', admin, (req, res) => res.json({ contacts: contactsEssai() }));
const effacerEssais = (req, res) => {
  // Un mot à retaper : on n'efface pas d'un clic distrait.
  if (String(req.body?.confirmer || '').trim().toUpperCase() !== 'ZZTEST') return res.status(400).json({ error: 'Tapez ZZTEST pour confirmer.' });
  const liste = contactsEssai();
  if (!liste.length) return res.json({ ok: true, retires: 0 });
  const ids = liste.map(c => c.id_contact);
  const ou = ids.map(() => '?').join(',');
  db.transaction(() => {
    // Les enfants d'abord (clés étrangères), le contact en dernier.
    for (const table of ['acq_appels', 'acq_modelo_reports', 'acq_transmissions', 'acq_oppositions_vues', 'acq_fiches']) {
      db.prepare(`DELETE FROM ${table} WHERE id_contact IN (${ou})`).run(...ids);
    }
    // Garde-fou final : la condition sur le nom est répétée dans l'effacement lui-même.
    db.prepare(`DELETE FROM acq_contacts WHERE id_contact IN (${ou}) AND ${ESSAI}`).run(...ids);
  })();
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'ESSAIS_RETIRES', { details: { module: 'acquereurs', contacts: liste.map(c => `${c.prenom} ${c.nom} (n° ${c.id_contact})`) } });
  // Leurs appels partis, ils ne sont plus « à reporter » : le fichier de report est vide d'eux.
  res.json({ ok: true, retires: liste.length, a_reporter: M.aReporter().length });
};
router.delete('/admin/essais', admin, effacerEssais);
// Même geste en POST : certains réseaux retirent le contenu d'une requête DELETE.
router.post('/admin/essais/effacer', admin, effacerEssais);

// --- Vider les données de la mission ------------------------------------------
//
// Même geste que pour la Mission Estimés : le mot EFFACER, exigé par le serveur,
// une sauvegarde complète écrite juste avant, et rien de détruit : contacts,
// recherches, appels et reports partent dans une corbeille, par lot, d'où l'on
// peut tout remettre. Les scripts et les accès ne sont pas concernés.
// L'ordre compte : les enfants d'abord à l'aller, les parents d'abord au retour.
const TABLES_DONNEES = ['acq_appels', 'acq_modelo_reports', 'acq_transmissions', 'acq_oppositions_vues', 'acq_fiches', 'acq_contacts', 'acq_reports', 'acq_telechargements'];
const lotsCorbeille = () => db.prepare(`SELECT lot, MAX(par) AS par, COUNT(*) AS lignes,
    SUM(table_nom = 'acq_contacts') AS contacts, SUM(table_nom = 'acq_fiches') AS fiches, SUM(table_nom = 'acq_appels') AS appels
  FROM acq_corbeille GROUP BY lot ORDER BY lot DESC`).all();
router.get('/admin/corbeille', admin, (req, res) => res.json({ lots: lotsCorbeille(),
  en_base: { contacts: db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n, appels: db.prepare('SELECT COUNT(*) n FROM acq_appels').get().n } }));

router.post('/admin/vider', admin, async (req, res) => {
  if (req.body?.confirmation !== 'EFFACER') return res.status(400).json({ error: 'Confirmation requise : EFFACER' });
  let sauvegarde = null;
  try { sauvegarde = require('path').basename(await require('../sauvegarde').sauvegarder()); }
  catch (e) { return res.status(500).json({ error: 'Sauvegarde impossible, rien n’a été effacé : ' + e.message }); }
  const lot = new Date().toISOString().slice(0, 23).replace('T', ' ');
  const compte = {};
  try {
    db.transaction(() => {
      const ranger = db.prepare('INSERT INTO acq_corbeille (lot, par, table_nom, ligne) VALUES (?, ?, ?, ?)');
      for (const table of TABLES_DONNEES) {
        const lignes = db.prepare(`SELECT * FROM ${table}`).all();
        for (const l of lignes) ranger.run(lot, req.moi.nom_complet, table, JSON.stringify(l));
        db.prepare(`DELETE FROM ${table}`).run();
        compte[table] = lignes.length;
      }
    })();
  } catch (e) {
    console.error('[acquereurs] vidage —', e);
    return res.status(500).json({ error: 'Vidage impossible. Rien n’a été modifié.' });
  }
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'DONNEES_VIDEES', { details: { module: 'acquereurs', lot, sauvegarde, contacts: compte.acq_contacts, fiches: compte.acq_fiches, appels: compte.acq_appels } });
  res.json({ ok: true, lot, sauvegarde, contacts: compte.acq_contacts, fiches: compte.acq_fiches, appels: compte.acq_appels });
});

// Remettre un lot. Refusé s'il reste des contacts en base : on ne mélange pas un
// ancien fichier avec un nouvel import.
router.post('/admin/corbeille/restaurer', admin, (req, res) => {
  const lot = String(req.body?.lot || '');
  const lignes = db.prepare('SELECT table_nom, ligne FROM acq_corbeille WHERE lot = ? ORDER BY id').all(lot);
  if (!lignes.length) return res.status(404).json({ error: 'Lot introuvable dans la corbeille' });
  if (db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n) return res.status(409).json({ error: 'La mission contient déjà des contacts. Videz-la d’abord, ou gardez ce lot en corbeille.' });
  const compte = {};
  db.transaction(() => {
    for (const table of [...TABLES_DONNEES].reverse().sort((a, b) => (a === 'acq_contacts' ? -1 : b === 'acq_contacts' ? 1 : a === 'acq_fiches' ? -1 : b === 'acq_fiches' ? 1 : 0))) {
      const connues = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
      for (const l of lignes.filter(x => x.table_nom === table)) {
        const o = JSON.parse(l.ligne);
        const cols = Object.keys(o).filter(k => connues.has(k));
        db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(k => o[k]));
        compte[table] = (compte[table] || 0) + 1;
      }
    }
    db.prepare('DELETE FROM acq_corbeille WHERE lot = ?').run(lot);
  })();
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'DONNEES_RESTAUREES', { details: { module: 'acquereurs', lot, contacts: compte.acq_contacts || 0 } });
  res.json({ ok: true, lot, contacts: compte.acq_contacts || 0, fiches: compte.acq_fiches || 0, appels: compte.acq_appels || 0 });
});

const PARTIES = ['accueil', '0', '1', '2.1', '2.2', '2.3', '3', 'mandat', '4', 'repondeur', 'sms'];
router.get('/admin/scripts', admin, (req, res) => {
  const s = Object.fromEntries(db.prepare('SELECT partie, texte FROM acq_scripts').all().map(x => [x.partie, x.texte]));
  res.json({ parties: PARTIES.map(p => ({ partie: p, texte: s[p] || '' })) });
});
router.put('/admin/scripts/:partie', admin, (req, res) => {
  if (!PARTIES.includes(req.params.partie)) return res.status(400).json({ error: 'Partie inconnue' });
  db.prepare(`INSERT INTO acq_scripts (partie, texte, modifie_le, modifie_par) VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(partie) DO UPDATE SET texte = excluded.texte, modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
    .run(req.params.partie, String(req.body?.texte || ''), req.moi.nom_complet);
  res.json({ ok: true });
});

router.get('/admin/acces', admin, (req, res) => {
  res.json({ users: db.prepare("SELECT id, prenom, nom, role, acces_acquereurs FROM users WHERE actif = 1 ORDER BY prenom, nom").all() });
});
router.put('/admin/acces/:id', admin, (req, res) => {
  db.prepare('UPDATE users SET acces_acquereurs = ? WHERE id = ?').run(req.body?.acces ? 1 : 0, req.params.id);
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'COMPTE_MODIFIE', { details: { acces_acquereurs: !!req.body?.acces, user_id: Number(req.params.id) } });
  res.json({ ok: true });
});

// Pour la page d'accueil des missions (adminRoutes).
router.calculerFile = calculerFile;

module.exports = router;
