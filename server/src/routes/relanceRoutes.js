const express = require('express');
const { db, recalculerScore } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const B = require('../blocs');

const router = express.Router();
// Même garde que les contacts : agents, managers, admin. Les rôles « courtage »
// et « conseiller » lisaient ici les statistiques de toute l'équipe.
router.use(requireAuth, requireRole('agent', 'manager', 'admin'));

// Parametre numerique avec defaut
function param(cle, defaut) {
  const r = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  const n = parseInt(r?.valeur, 10);
  return Number.isFinite(n) ? n : defaut;
}

function dansNJours(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

// Issue fine -> statut relance compatible avec le CHECK existant
const ISSUE_STATUT = {
  sans_reponse: 'tente_sans_reponse',
  projet: 'rdv_obtenu',
  rappel: 'rappel_planifie',
  demenage: 'contacte',
  sans_projet: 'contacte',
  autre: 'contacte',
};

router.post('/', (req, res) => {
  const { contact_id, issue, statut, notes, duree_appel, prochain_contact, date_rappel, nouvelle_adresse, adresse_inconnue } = req.body;
  if (!contact_id) return res.status(400).json({ error: 'contact_id requis' });

  let statutRelance;
  const issueFinale = issue || null;
  if (issue) {
    statutRelance = ISSUE_STATUT[issue];
    if (!statutRelance) return res.status(400).json({ error: 'issue invalide' });
    if (issue === 'rappel' && !date_rappel) return res.status(400).json({ error: 'date_rappel requise' });
    if (issue === 'autre' && !(notes && String(notes).trim())) return res.status(400).json({ error: 'note requise pour issue autre' });
  } else if (statut) {
    statutRelance = statut; // contrat legacy
  } else {
    return res.status(400).json({ error: 'issue ou statut requis' });
  }

  // La fiche doit exister, ne pas être à la corbeille, et être dans un fichier
  // ouvert à la personne.
  const fiche = B.contactVisible(req.user, contact_id);
  if (!fiche) return res.status(404).json({ error: 'Contact non trouvé' });

  // Réseau faible : l'écran coupe à 15 s et invite à réessayer, alors que le
  // premier envoi a pu aboutir. Le même résultat, par la même personne, sur la
  // même fiche, en moins d'une minute, est le même geste : on rend l'appel déjà
  // enregistré au lieu d'en compter un second (deux relances, deux tentatives).
  const jumeau = db.prepare(`
    SELECT id FROM relances
    WHERE contact_id = ? AND agent_id = ? AND type = 'appel' AND statut = ? AND COALESCE(issue, '') = COALESCE(?, '')
      AND COALESCE(prochain_contact, '') = COALESCE(?, '') AND COALESCE(notes, '') = COALESCE(?, '')
      AND created_at >= datetime('now', '-60 seconds')
    ORDER BY id DESC LIMIT 1
  `).get(contact_id, req.user.id, statutRelance, issueFinale,
    (issue === 'rappel' ? date_rappel : prochain_contact) || null, notes || null);
  if (jumeau) return res.status(200).json({ id: jumeau.id, deja: true });

  // L'appel et son effet sur la fiche sont écrits ensemble, ou pas du tout.
  const enregistrer = db.transaction(() => {
  const result = db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, notes, duree_appel, prochain_contact, issue, bloc_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(contact_id, req.user.id, statutRelance, notes || null, duree_appel || null,
    (issue === 'rappel' ? date_rappel : prochain_contact) || null, issueFinale, fiche.bloc_id);

  // Effet sur le contact selon l'issue
  let contactStatut;
  let prochainContact = null;
  const sets = [];
  const setParams = [];
  if (issue === 'sans_reponse') {
    contactStatut = 'tente_sans_reponse';
    prochainContact = dansNJours(B.delaiDuBloc(fiche.bloc_id, 'delai_sans_reponse_jours', param('delai_sans_reponse_jours', 3)));
  } else if (issue === 'projet') {
    contactStatut = 'rdv_obtenu';
  } else if (issue === 'rappel') {
    contactStatut = 'rappel_planifie';
    prochainContact = date_rappel;
  } else if (issue === 'demenage') {
    const contact = db.prepare('SELECT adresse, code_postal, ville, tags FROM contacts WHERE id = ?').get(contact_id);
    const ancienne = [contact?.adresse, contact?.code_postal, contact?.ville].filter(Boolean).join(', ');
    if (adresse_inconnue || !(nouvelle_adresse && (nouvelle_adresse.adresse || nouvelle_adresse.ville))) {
      contactStatut = 'inactif';
      let tags = [];
      try { tags = JSON.parse(contact?.tags || '[]'); } catch { tags = []; }
      if (!tags.includes('prospecter_terrain')) tags.push('prospecter_terrain');
      sets.push('tags = ?'); setParams.push(JSON.stringify(tags));
      if (ancienne) { sets.push("notes = COALESCE(notes,'') || ?"); setParams.push('\n[Demenage] Ancienne adresse a prospecter : ' + ancienne); }
    } else {
      contactStatut = 'a_recontacter';
      sets.push('adresse = ?'); setParams.push(nouvelle_adresse.adresse || '');
      sets.push('code_postal = ?'); setParams.push(nouvelle_adresse.code_postal || '');
      sets.push('ville = ?'); setParams.push(nouvelle_adresse.ville || '');
    }
  } else if (issue === 'sans_projet') {
    contactStatut = 'a_recontacter';
    prochainContact = dansNJours(B.delaiDuBloc(fiche.bloc_id, 'relance_sans_projet_jours', param('relance_sans_projet_jours', 180)));
  } else if (issue === 'autre') {
    contactStatut = 'a_recontacter';
  } else {
    contactStatut = mapRelanceToContactStatut(statutRelance); // legacy
    prochainContact = prochain_contact || null;
  }

  db.prepare(`
    UPDATE contacts SET
      statut = ?,
      ${sets.length ? sets.join(', ') + ',' : ''}
      date_dernier_contact = datetime('now'),
      nombre_tentatives = nombre_tentatives + 1,
      prochain_contact = ?,
      updated_at = datetime('now'),
      version = version + 1
    WHERE id = ?
  `).run(contactStatut, ...setParams, prochainContact, contact_id);
  return result.lastInsertRowid;
  });

  const id = enregistrer();
  recalculerScore(contact_id);
  res.status(201).json({ id });
});

function mapRelanceToContactStatut(statut) {
  const map = {
    'tente_sans_reponse': 'tente_sans_reponse',
    'contacte': 'a_recontacter',
    'rdv_obtenu': 'rdv_obtenu',
    'pas_interesse': 'pas_interesse',
    'rappel_planifie': 'rappel_planifie',
    'message_laisse': 'tente_sans_reponse',
  };
  return map[statut] || 'a_contacter';
}

// Ajouter une note manuelle a l'historique (ne change pas le statut du contact)
router.post('/note', (req, res) => {
  const { contact_id, notes } = req.body;
  if (!contact_id || !notes || !String(notes).trim()) return res.status(400).json({ error: 'contact_id et notes requis' });
  const fiche = B.contactVisible(req.user, contact_id);
  if (!fiche) return res.status(404).json({ error: 'Contact non trouvé' });
  const result = db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, notes, type, bloc_id)
    VALUES (?, ?, 'contacte', ?, 'note', ?)
  `).run(contact_id, req.user.id, String(notes).trim(), fiche.bloc_id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Historique relances d'un contact
router.get('/contact/:id', (req, res) => {
  if (!B.contactVisible(req.user, req.params.id)) return res.status(404).json({ error: 'Contact non trouvé' });
  const relances = db.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM relances r JOIN users u ON r.agent_id = u.id
    WHERE r.contact_id = ? ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json(relances);
});

// Suivi d'activité, sur N'IMPORTE QUELLE période.
//
//   ?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ   bornes incluses, en heure de Paris
//   ?depuis_debut=1                    depuis le tout premier appel
//   ?agent_id=…  ?bloc_id=…            une personne, un fichier
//   ?format=csv                        la série par période et par personne
//
// Qui voit quoi : un agent ne voit QUE sa propre activité (le paramètre agent_id
// est ignoré pour lui) ; manager et admin voient toute l'équipe ou une personne.
// Avant, tout compte connecté lisait les chiffres de n'importe qui.
//
// Les champs d'origine (totalRelances, parStatut, parJour, parIssue, rdvObtenus,
// contactsPar…, parAgent, totalContacts) sont conservés pour le tableau de bord.
const P = require('../utils/paris');

// Résultat d'un appel où quelqu'un a répondu (tout sauf « pas de réponse » et « message laissé »).
const ABOUTI = "r.statut NOT IN ('tente_sans_reponse','message_laisse')";

router.get('/stats', (req, res) => {
  const estAgent = req.user.role === 'agent';
  const blocs = B.blocsDeLaDemande(req.user, req.query.bloc_id);
  if (blocs === null) return res.status(403).json({ error: 'Ce fichier ne vous est pas ouvert' });
  const agentId = estAgent ? req.user.id : (parseInt(req.query.agent_id, 10) || null);

  // --- Période, en jours de Paris ---
  const aujourdhui = P.aujourdhuiParis();
  const depuisDebut = req.query.depuis_debut === '1';
  let fin = P.dateValide(req.query.fin) ? req.query.fin : aujourdhui;
  let debut;
  if (depuisDebut) {
    const premier = db.prepare("SELECT MIN(created_at) AS d FROM relances").get().d;
    debut = premier ? new Date(premier.replace(' ', 'T') + 'Z').toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }) : aujourdhui;
  } else {
    debut = P.dateValide(req.query.debut) ? req.query.debut : P.plusJours(fin, -30);
  }
  if (debut > fin) [debut, fin] = [fin, debut];
  const jours = P.nbJours(debut, fin);
  // Un point par jour jusqu'à deux mois, par semaine jusqu'à un an, par mois au-delà :
  // 365 barres d'un pixel ne se lisent pas.
  const granularite = jours <= 62 ? 'jour' : jours <= 370 ? 'semaine' : 'mois';
  const PERIODE = {
    jour: "date(r.created_at, 'localtime')",
    semaine: "date(r.created_at, 'localtime', 'weekday 0', '-6 days')",   // le lundi de la semaine
    mois: "strftime('%Y-%m-01', r.created_at, 'localtime')",
  }[granularite];

  // Bornes en UTC, intervalle [début 00:00 Paris, lendemain de fin 00:00 Paris[ :
  // la base peut utiliser son index, et un appel de 23 h reste sur son jour.
  const conditions = (du, au) => {
    const sql = ["r.type = 'appel'", 'r.created_at >= ?', 'r.created_at < ?', B.clauseBlocs(blocs, 'r.bloc_id')];
    const params = [P.debutJourUtc(du), P.debutJourUtc(P.plusJours(au, 1)), ...blocs];
    if (agentId) { sql.push('r.agent_id = ?'); params.push(agentId); }
    return { where: sql.join(' AND '), params };
  };
  const { where, params } = conditions(debut, fin);

  const TOTAUX = `
    COUNT(*) AS appels,
    COALESCE(SUM(${ABOUTI}), 0) AS appels_aboutis,
    COUNT(DISTINCT r.contact_id) AS personnes_appelees,
    COUNT(DISTINCT CASE WHEN ${ABOUTI} THEN r.contact_id END) AS personnes_jointes,
    COUNT(DISTINCT CASE WHEN r.statut = 'rdv_obtenu' THEN r.contact_id END) AS projets`;
  const totaux = db.prepare(`SELECT ${TOTAUX} FROM relances r WHERE ${where}`).get(...params);

  const parStatut = db.prepare(`SELECT r.statut, COUNT(*) AS cnt FROM relances r WHERE ${where} GROUP BY r.statut`).all(...params);
  const parIssue = db.prepare(`SELECT r.issue, COUNT(*) AS cnt FROM relances r WHERE ${where} AND r.issue IS NOT NULL GROUP BY r.issue`).all(...params);
  const parJour = db.prepare(`SELECT ${PERIODE} AS jour, COUNT(*) AS cnt,
      COALESCE(SUM(${ABOUTI}), 0) AS aboutis,
      COUNT(DISTINCT CASE WHEN r.statut = 'rdv_obtenu' THEN r.contact_id END) AS projets
    FROM relances r WHERE ${where} GROUP BY jour ORDER BY jour`).all(...params);

  // Même période juste avant, de même longueur : dit si on fait mieux ou moins bien.
  let precedente = null;
  if (!depuisDebut) {
    const finAvant = P.plusJours(debut, -1), debutAvant = P.plusJours(debut, -jours);
    const c = conditions(debutAvant, finAvant);
    precedente = { debut: debutAvant, fin: finAvant, ...db.prepare(`SELECT ${TOTAUX} FROM relances r WHERE ${c.where}`).get(...c.params) };
  }

  // Par personne, sur la période (manager et admin seulement). Par ordre
  // alphabétique : ce n'est pas un classement.
  let parPersonne = [];
  if (!estAgent) {
    parPersonne = db.prepare(`SELECT u.id, u.prenom, u.nom, ${TOTAUX}
      FROM relances r JOIN users u ON u.id = r.agent_id WHERE ${where}
      GROUP BY u.id ORDER BY u.nom, u.prenom`).all(...params);
  }

  // --- L'état du fichier aujourd'hui (hors période) ---
  const dansFichier = `supprime_le IS NULL AND ${B.clauseBlocs(blocs, 'bloc_id')}`;
  const rdvObtenus = db.prepare(`SELECT COUNT(*) AS cnt FROM contacts WHERE statut = 'rdv_obtenu' AND ${dansFichier}`).get(...blocs).cnt;
  const contactsParCategorie = db.prepare(`SELECT categorie, COUNT(*) AS cnt FROM contacts WHERE ${dansFichier} GROUP BY categorie`).all(...blocs);
  const contactsParStatut = db.prepare(`SELECT statut, COUNT(*) AS cnt FROM contacts WHERE ${dansFichier} GROUP BY statut`).all(...blocs);
  const totalContacts = db.prepare(`SELECT COUNT(*) AS cnt FROM contacts WHERE ${dansFichier}`).get(...blocs).cnt;
  const jamaisAppelees = db.prepare(`SELECT COUNT(*) AS cnt FROM contacts WHERE ${dansFichier} AND nombre_tentatives = 0 AND statut = 'a_contacter'`).get(...blocs).cnt;
  // Rappels promis et pas encore faits : la parole donnée. Ceux de la personne
  // regardée, ou de toute l'équipe.
  const rappelsEnRetard = db.prepare(`
    SELECT COUNT(*) AS cnt FROM contacts c
    JOIN relances r ON r.id = (SELECT id FROM relances WHERE contact_id = c.id AND statut = 'rappel_planifie' ORDER BY created_at DESC, id DESC LIMIT 1)
    WHERE c.statut = 'rappel_planifie' AND c.prochain_contact IS NOT NULL AND substr(c.prochain_contact, 1, 10) < ?
      AND c.supprime_le IS NULL AND ${B.clauseBlocs(blocs, 'c.bloc_id')} ${agentId ? 'AND r.agent_id = ?' : ''}
  `).get(aujourdhui, ...blocs, ...(agentId ? [agentId] : [])).cnt;

  // Appels du jour par personne. Un agent n'y voit que lui.
  const parAgent = db.prepare(`
    SELECT u.nom, u.prenom, u.id, COUNT(r.id) AS relances_jour
    FROM users u LEFT JOIN relances r ON r.agent_id = u.id AND r.type = 'appel'
      AND r.created_at >= ? AND r.created_at < ?
    WHERE u.role = 'agent' AND u.actif = 1 ${estAgent ? 'AND u.id = ?' : ''} GROUP BY u.id
  `).all(P.debutJourUtc(aujourdhui), P.debutJourUtc(P.plusJours(aujourdhui, 1)), ...(estAgent ? [req.user.id] : []));

  if (req.query.format === 'csv') {
    if (estAgent) return res.status(403).json({ error: 'Accès refusé' });
    const serie = db.prepare(`SELECT ${PERIODE} AS periode, u.prenom || ' ' || u.nom AS personne, ${TOTAUX}
      FROM relances r JOIN users u ON u.id = r.agent_id WHERE ${where}
      GROUP BY periode, u.id ORDER BY periode, u.nom, u.prenom`).all(...params);
    const entete = ['Période (' + granularite + ')', 'Personne', 'Appels', 'Appels aboutis', 'Personnes appelées', 'Personnes jointes', 'Projets'];
    const lignes = serie.map(l => [l.periode, l.personne, l.appels, l.appels_aboutis, l.personnes_appelees, l.personnes_jointes, l.projets]);
    const csv = [entete, ...lignes].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="suivi-${debut}-${fin}.csv"`);
    return res.send('﻿' + csv);
  }

  res.json({
    // Champs d'origine
    totalRelances: totaux.appels, parStatut, parJour, parIssue, rdvObtenus,
    contactsParCategorie, contactsParStatut, parAgent, totalContacts,
    // Suivi sur période libre
    periode: { debut, fin, jours, granularite, depuis_debut: depuisDebut },
    totaux, precedente, parPersonne, rappelsEnRetard, jamaisAppelees,
    portee: { agent_id: agentId, blocs },
  });
});

// --- Reprise de session ---

// Début de journée locale Europe/Paris, exprimé en UTC (borne basse si aucune clôture).
function debutJourneeParisUtc() {
  const dateParis = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const midi = new Date(`${dateParis}T12:00:00Z`);
  const hParis = parseInt(midi.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' }), 10);
  const offsetMin = (hParis - 12) * 60;
  const [Y, M, D] = dateParis.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, 0, 0, 0) - offsetMin * 60000).toISOString().slice(0, 19).replace('T', ' ');
}

// Clôture la session courante de l'agent (marqueur = maintenant, UTC).
router.post('/cloturer-session', (req, res) => {
  const cle = 'session_cloturee_' + req.user.id;
  const iso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)').run(cle, iso);
  res.json({ ok: true, cloture: iso });
});

// Récap de la session courante : relances de l'agent depuis la dernière clôture
// (ou depuis le début de journée Paris si aucune clôture).
router.get('/session-courante', (req, res) => {
  const cle = 'session_cloturee_' + req.user.id;
  const row = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  const borne = row?.valeur || debutJourneeParisUtc();
  const relances = db.prepare(`
    SELECT r.issue, r.notes, c.nom, c.prenom, c.telephone
    FROM relances r JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ? AND r.created_at > ?
    ORDER BY r.created_at ASC
  `).all(req.user.id, borne);
  const actions = relances.map(r => ({
    nom: r.nom, prenom: r.prenom, telephone: r.telephone,
    statut: r.issue || 'contacte', notes: r.notes || '',
  }));
  const stats = {
    total: actions.length,
    rdv: actions.filter(a => a.statut === 'projet').length,
    contactes: actions.filter(a => !['projet', 'sans_reponse'].includes(a.statut)).length,
    pasRep: actions.filter(a => a.statut === 'sans_reponse').length,
  };
  res.json({ actions, stats, borne });
});

// Mes rappels : contacts en rappel planifié dont la DERNIÈRE relance 'rappel' vient de
// l'agent connecté (= ses promesses de rappel). Groupés retard / aujourd'hui / à venir (7 j).
router.get('/mes-rappels', (req, res) => {
  const blocsRappels = B.blocsDeLaDemande(req.user, req.query.bloc_id) || [];
  const today = new Date().toISOString().slice(0, 10);
  const dans7j = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT c.id, c.civilite, c.nom, c.prenom, c.telephone, c.telephone2, c.ville,
      c.prochain_contact, r.notes AS derniere_note
    FROM contacts c
    JOIN relances r ON r.id = (
      SELECT id FROM relances
      WHERE contact_id = c.id AND statut = 'rappel_planifie'
      ORDER BY created_at DESC, id DESC LIMIT 1
    )
    WHERE c.statut = 'rappel_planifie' AND c.prochain_contact IS NOT NULL
      AND r.agent_id = ?
      AND c.supprime_le IS NULL AND ${B.clauseBlocs(blocsRappels, 'c.bloc_id')}
    ORDER BY c.prochain_contact ASC
  `).all(req.user.id, ...blocsRappels);
  const retard = [], aujourdhui = [], aVenir = [];
  for (const c of rows) {
    const d = String(c.prochain_contact).slice(0, 10);
    if (d < today) retard.push(c);
    else if (d === today) aujourdhui.push(c);
    else if (d <= dans7j) aVenir.push(c);
  }
  res.json({ retard, aujourdhui, aVenir });
});

module.exports = router;
module.exports.ISSUE_STATUT = ISSUE_STATUT;
