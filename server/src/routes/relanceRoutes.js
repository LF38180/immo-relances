const express = require('express');
const { db, recalculerScore } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

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

  const result = db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, notes, duree_appel, prochain_contact, issue)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(contact_id, req.user.id, statutRelance, notes || null, duree_appel || null,
    (issue === 'rappel' ? date_rappel : prochain_contact) || null, issueFinale);

  // Effet sur le contact selon l'issue
  let contactStatut;
  let prochainContact = null;
  const sets = [];
  const setParams = [];
  if (issue === 'sans_reponse') {
    contactStatut = 'tente_sans_reponse';
    prochainContact = dansNJours(param('delai_sans_reponse_jours', 3));
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
    prochainContact = dansNJours(param('relance_sans_projet_jours', 180));
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
      updated_at = datetime('now')
    WHERE id = ?
  `).run(contactStatut, ...setParams, prochainContact, contact_id);

  recalculerScore(contact_id);
  res.status(201).json({ id: result.lastInsertRowid });
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
  const result = db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, notes, type)
    VALUES (?, ?, 'contacte', ?, 'note')
  `).run(contact_id, req.user.id, String(notes).trim());
  res.status(201).json({ id: result.lastInsertRowid });
});

// Historique relances d'un contact
router.get('/contact/:id', (req, res) => {
  const relances = db.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM relances r JOIN users u ON r.agent_id = u.id
    WHERE r.contact_id = ? ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json(relances);
});

// Stats pour dashboard
router.get('/stats', (req, res) => {
  const { debut, fin, agent_id } = req.query;
  const dateDebut = debut || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateFin = fin || new Date().toISOString().slice(0, 10);

  const agentFilter = agent_id ? 'AND r.agent_id = ?' : '';
  const agentParam = agent_id ? [agent_id] : [];

  const totalRelances = db.prepare(`
    SELECT COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? AND r.type = 'appel' ${agentFilter}
  `).get(dateDebut, dateFin, ...agentParam).cnt;

  const parStatut = db.prepare(`
    SELECT statut, COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? AND r.type = 'appel' ${agentFilter}
    GROUP BY statut
  `).all(dateDebut, dateFin, ...agentParam);

  const parJour = db.prepare(`
    SELECT DATE(r.created_at) as jour, COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? AND r.type = 'appel' ${agentFilter}
    GROUP BY DATE(r.created_at) ORDER BY jour
  `).all(dateDebut, dateFin, ...agentParam);

  const parIssue = db.prepare(`
    SELECT issue, COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? AND r.type = 'appel' AND r.issue IS NOT NULL ${agentFilter}
    GROUP BY issue
  `).all(dateDebut, dateFin, ...agentParam);

  const rdvObtenus = db.prepare(`
    SELECT COUNT(*) as cnt FROM contacts WHERE statut = 'rdv_obtenu'
  `).get().cnt;

  const contactsParCategorie = db.prepare(`
    SELECT categorie, COUNT(*) as cnt FROM contacts GROUP BY categorie
  `).all();

  const contactsParStatut = db.prepare(`
    SELECT statut, COUNT(*) as cnt FROM contacts GROUP BY statut
  `).all();

  // Relances aujourd'hui par agent
  const today = new Date().toISOString().slice(0, 10);
  const parAgent = db.prepare(`
    SELECT u.nom, u.prenom, u.id, COUNT(r.id) as relances_jour
    FROM users u LEFT JOIN relances r ON r.agent_id = u.id AND DATE(r.created_at) = ? AND r.type = 'appel'
    WHERE u.role = 'agent' AND u.actif = 1 GROUP BY u.id
  `).all(today);

  res.json({
    totalRelances,
    parStatut,
    parJour,
    parIssue,
    rdvObtenus,
    contactsParCategorie,
    contactsParStatut,
    parAgent,
    totalContacts: db.prepare('SELECT COUNT(*) as cnt FROM contacts').get().cnt,
  });
});

module.exports = router;
module.exports.ISSUE_STATUT = ISSUE_STATUT;
