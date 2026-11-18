// Fichier Acquéreurs — espace cloisonné de « Madame Fichier Acquéreurs »
// (cahier des charges du 18/11/2026). Rien ici ne lit ni n'écrit les tables
// des relances de Chrystelle ou du courtage de Marine, sauf en lecture pour
// signaler un appel récent du même numéro.
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const R = require('../utils/opRegles');
const A = require('../utils/acqRegles');
const I = require('../utils/acqImport');
const M = require('../utils/acqModelo');
const { journaliser } = require('../utils/journal');

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
  const det = db.prepare(`SELECT a.details FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE ${where} AND a.details IS NOT NULL AND a.statut_final IS NOT NULL`).all(...params).map(x => json(x.details) || {});
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
    ...(m.admin ? { a_reporter: M.aReporter().length, a_valider: M.archivagesEnAttente().length } : {}),
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
  const dernier = db.prepare("SELECT details FROM acq_appels WHERE id_contact = ? AND details IS NOT NULL ORDER BY horodatage DESC LIMIT 1").get(c.id_contact);
  const scripts = Object.fromEntries(db.prepare('SELECT partie, texte FROM acq_scripts').all().map(s => [s.partie, s.texte]));
  const prochainSansRep = c.sans_reponse_de_suite + 1;
  res.json({
    contact: c, fiches, appels, dernier_details: json(dernier?.details), scripts,
    blocages: A.blocages(c, c.appels_ce_mois),
    appel_recent: A.appelRecent(c, A.appelsRecentsAilleurs()),
    conseil_tentative: prochainSansRep >= 4 ? 'Quatrième tentative : envoyez un SMS ou un mail si pas de réponse.'
      : prochainSansRep === 3 ? 'Troisième tentative : laissez un message sur le répondeur.' : null,
  });
});

// Ce qui bloque l'appel, à cet instant : l'écran le redemande chaque minute,
// pour qu'une fiche ouverte à 9 h 58 se débloque à 10 h.
router.get('/contacts/:id/blocages', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  res.json({ blocages: A.blocages(c, c.appels_ce_mois) });
});

// --- Une tentative sans réponse (ou faux numéro), SMS, mail ----------------
router.post('/contacts/:id/tentative', acces, (req, res) => {
  const c = chargerContact(req, res); if (!c) return;
  const b = req.body || {};
  const canal = ['APPEL', 'SMS', 'MAIL'].includes(b.canal) ? b.canal : 'APPEL';
  const issue = canal === 'APPEL' ? b.issue : 'PAS_DE_REPONSE';
  if (!['PAS_DE_REPONSE', 'REPONDEUR', 'FAUX_NUMERO'].includes(issue)) return res.status(400).json({ error: 'Issue invalide' });
  if (b.cle) { const deja = db.prepare('SELECT id FROM acq_appels WHERE cle = ?').get(b.cle); if (deja) return res.json({ id: deja.id, deja: true }); }
  if (canal === 'MAIL') {
    // Un mail n'est pas un appel : ni plage, ni plafond. Mais pas de mail à
    // qui n'en veut pas, ni à qui a demandé à ne plus être contacté.
    if (c.stop_mail) return res.status(409).json({ error: 'Stop mail : envoi de mail impossible.' });
    if (c.statut === 'NE_PLUS_CONTACTER' || A.opposee(c)) return res.status(409).json({ error: 'Cette personne a demandé à ne plus être contactée.' });
  } else {
    const bl = A.blocages(c, c.appels_ce_mois, A.debutAppel(b.ouvert_le));
    if (bl.length) return res.status(409).json({ error: bl[0], blocages: bl });
  }
  const r = db.transaction(() => {
    // Le texte du SMS ou du mail, s'il a été noté : il part dans la note Modelo.
    const texte = canal !== 'APPEL' && String(b.texte || '').trim() ? String(b.texte).trim().slice(0, 2000) : null;
    const id = db.prepare(`INSERT INTO acq_appels (id_contact, madame_fichier, user_id, canal, issue, notes, details, cle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id_contact, req.moi.nom_complet, req.moi.id, canal, issue, b.notes || null,
      texte ? JSON.stringify({ texte }) : null, b.cle || null).lastInsertRowid;
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
  if (b.cle) { const deja = db.prepare('SELECT id FROM acq_appels WHERE cle = ?').get(b.cle); if (deja) return res.json({ id: deja.id, deja: true }); }
  const statut = b.statut_final;
  if (!A.STATUTS.includes(statut)) return res.status(400).json({ error: 'Choisissez l’issue de l’appel.' });
  // Une opposition, une erreur d'identité ou un décès s'enregistrent toujours :
  // on ne refuse pas de noter que quelqu'un ne veut plus être appelé parce
  // qu'il est 13 h 05.
  const toujours = ['NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut);
  const bl = toujours ? [] : A.blocages(c, c.appels_ce_mois, A.debutAppel(b.ouvert_le), { entrant: b.entrant === true });
  if (bl.length) return res.status(409).json({ error: bl[0], blocages: bl });
  if (statut === 'A_RAPPELER' && !b.date_prochaine_action) return res.status(400).json({ error: 'Indiquez quand rappeler.' });
  if (b.date_prochaine_action && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(b.date_prochaine_action)))
    return res.status(400).json({ error: 'Date de la prochaine action illisible.' });

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
    for (const id of gardees) {
      const m = A.manquesRequalif(dec[id].projet);
      if (m.length) return res.status(400).json({ error: `Requalifié impossible, il manque : ${m.join(', ')}.`, manques: m });
    }
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
  } : null;
  if (mandat?.etat === 'ACCEPTE') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mandat.date_acceptation || '')) return res.status(400).json({ error: 'Mandat de recherche accepté : indiquez la date d’acceptation.' });
    if (!b.date_prochaine_action) return res.status(400).json({ error: 'Mandat de recherche accepté : indiquez la date du rendez-vous de signature.' });
  }
  const details = { coordonnees: b.coordonnees || {}, vendre: b.vendre || {}, marine: b.marine || {}, consentement_rappel: !!b.consentement_rappel,
    ...(mandat ? { mandat } : {}), ...(b.entrant === true ? { entrant: true } : {}) };
  const ecrire = db.transaction(() => {
    const issue = ['NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut) ? statut : statut === 'A_RAPPELER' && !b.joint ? 'A_RAPPELER' : 'JOINT';
    const id = db.prepare(`INSERT INTO acq_appels (id_contact, madame_fichier, user_id, canal, issue, statut_final,
        prochaine_action, date_prochaine_action, duree_sec, notes, details, cle)
      VALUES (?, ?, ?, 'APPEL', ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id_contact, req.moi.nom_complet, req.moi.id, issue, statut,
      b.prochaine_action || null, b.date_prochaine_action || null, b.duree_sec || null, b.notes || null,
      JSON.stringify(details), b.cle || null).lastInsertRowid;
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
  const d = db.prepare(`SELECT a.details, a.statut_final FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact
    WHERE date(a.horodatage, 'localtime') >= ? AND ${where} AND a.details IS NOT NULL`).all(debut, ...params).map(x => ({ s: x.statut_final, d: json(x.details) || {} }));
  res.json({
    appels: q(`SELECT COUNT(*) n ${base}`),
    traites: q(`SELECT COUNT(DISTINCT a.id_contact) n ${base}`),
    joints: q(`SELECT COUNT(DISTINCT a.id_contact) n ${base} AND a.issue = 'JOINT'`),
    requalifies: d.filter(x => x.s === 'REQUALIFIE').length,
    archives: d.filter(x => ['ABANDONNE', 'DEJA_ACHETE', 'NE_PLUS_CONTACTER'].includes(x.s)).length,
    vendeurs: d.filter(x => x.d.vendre?.doit_vendre === 'OUI').length,
    estimations_proposees: d.filter(x => x.d.vendre?.estimation_proposee).length,
    estimations_acceptees: d.filter(x => x.d.vendre?.estimation_acceptee).length,
    marine: d.filter(x => x.d.marine?.proposee).length,
    mandats_proposes: d.filter(x => x.d.mandat).length,
    mandats_acceptes: d.filter(x => x.d.mandat?.etat === 'ACCEPTE').length,
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
      ${SQL_COMPTEURS} FROM acq_contacts c ORDER BY c.nom, c.prenom`).all(R.moisCourant());
  res.json({ contacts: lignes, libelles: I.LIBELLES_EXCLUSION });
});

// Remettre dans la file un contact écarté (un numéro retrouvé, par exemple).
router.post('/admin/contacts/:id/reintegrer', admin, (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM acq_contacts WHERE id_contact = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  const sets = ['exclu = NULL', 'exclu_leve = 1'], vals = [];
  if (b.tel_portable) { sets.push('tel_portable = ?'); vals.push(String(b.tel_portable).trim()); }
  if (c.statut === 'FAUX_NUMERO' && b.tel_portable) sets.push('statut = NULL');
  db.prepare(`UPDATE acq_contacts SET ${sets.join(', ')} WHERE id_contact = ?`).run(...vals, c.id_contact);
  res.json({ ok: true });
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
  const items = Array.isArray(req.body?.fiches) ? req.body.fiches : [];
  const st = db.prepare(`UPDATE acq_fiches SET archivage_valide = ?, archivage_valide_par = ?, archivage_valide_le = datetime('now') WHERE id_fiche = ?`);
  db.transaction(() => { for (const f of items) st.run(f.accepte ? 1 : 0, req.moi.nom_complet, String(f.id_fiche)); })();
  res.json({ ok: true, n: items.length });
});

router.get('/admin/report', admin, (req, res) => {
  const attente = M.archivagesEnAttente().length;
  if (attente) return res.status(409).json({ error: `${attente} archivage${attente > 1 ? 's' : ''} à valider avant le report.`, attente });
  const jusquA = db.prepare("SELECT datetime('now') d").get().d;
  const lignes = M.lignesReport(jusquA);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Report_Modelo_Acquereurs_${jusquA.slice(0, 10)}.csv"`);
    return res.send(M.enCsv(lignes));
  }
  res.json({ jusqu_a: jusquA, contacts: new Set(lignes.map(l => l.id_contact)).size, fiches: lignes.length, lignes });
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
  let reportes = 0, echecs = 0; const motifs = [], sansDate = [];
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
        db.prepare('UPDATE acq_contacts SET modelo_reporte_le = ? WHERE id_contact = ?').run(j, id);
        reportes++;
      } else { echecs++; const e = ls.find(l => l.statut === 'ECHEC'); motifs.push({ id_contact: id, motif: String(e.motif_echec || '').trim() || null }); }
    }
    db.prepare('INSERT INTO acq_reports (par, jusqu_a, contacts, fiches) VALUES (?, ?, ?, ?)').run(req.moi.nom_complet, maintenant, reportes, lignes.length);
  })();
  journaliser({ id: req.moi.id, nom_complet: req.moi.nom_complet }, 'MODELO_RETOUR', { details: { module: 'acquereurs', reportes, echecs, inconnus: inconnus.size } });
  res.json({ ok: true, reportes, echecs, inconnus: [...inconnus], motifs, sans_date: sansDate });
});

// Ce qui part chez Marine et les estimations à caler (aucune fiche créée chez elles).
router.get('/admin/transmettre', admin, (req, res) => {
  const lignes = db.prepare(`SELECT a.id_contact, a.horodatage, a.madame_fichier, a.details, c.nom, c.prenom, c.tel_portable, c.source,
      (SELECT GROUP_CONCAT(DISTINCT f.ancien_conseiller) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS conseiller
    FROM acq_appels a JOIN acq_contacts c ON c.id_contact = a.id_contact WHERE a.details IS NOT NULL ORDER BY a.horodatage DESC`).all()
    .map(l => ({ ...l, details: json(l.details) || {} }));
  res.json({
    marine: lignes.filter(l => l.details.marine?.proposee).map(l => ({ ...l, accord: !!l.details.marine.accord, details: undefined })),
    estimations: lignes.filter(l => l.details.vendre?.estimation_proposee).map(l => ({ ...l, acceptee: !!l.details.vendre.estimation_acceptee,
      date_rdv: l.details.vendre.date_rdv_estimation || null, adresse: l.details.vendre.adresse_bien_a_vendre || null, details: undefined })),
  });
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
