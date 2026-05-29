const express = require('express');
const { db, recalculerScore } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Enregistrer une relance
router.post('/', (req, res) => {
  const { contact_id, statut, notes, duree_appel, prochain_contact } = req.body;
  if (!contact_id || !statut) return res.status(400).json({ error: 'contact_id et statut requis' });

  const result = db.prepare(`
    INSERT INTO relances (contact_id, agent_id, statut, notes, duree_appel, prochain_contact)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(contact_id, req.user.id, statut, notes, duree_appel, prochain_contact || null);

  // Mettre à jour le contact
  const contactStatut = mapRelanceToContactStatut(statut);
  db.prepare(`
    UPDATE contacts SET
      statut = ?,
      date_dernier_contact = datetime('now'),
      nombre_tentatives = nombre_tentatives + 1,
      prochain_contact = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(contactStatut, prochain_contact || null, contact_id);

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
    WHERE DATE(r.created_at) BETWEEN ? AND ? ${agentFilter}
  `).get(dateDebut, dateFin, ...agentParam).cnt;

  const parStatut = db.prepare(`
    SELECT statut, COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? ${agentFilter}
    GROUP BY statut
  `).all(dateDebut, dateFin, ...agentParam);

  const parJour = db.prepare(`
    SELECT DATE(r.created_at) as jour, COUNT(*) as cnt FROM relances r
    WHERE DATE(r.created_at) BETWEEN ? AND ? ${agentFilter}
    GROUP BY DATE(r.created_at) ORDER BY jour
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
    FROM users u LEFT JOIN relances r ON r.agent_id = u.id AND DATE(r.created_at) = ?
    WHERE u.role = 'agent' AND u.actif = 1 GROUP BY u.id
  `).all(today);

  res.json({
    totalRelances,
    parStatut,
    parJour,
    rdvObtenus,
    contactsParCategorie,
    contactsParStatut,
    parAgent,
    totalContacts: db.prepare('SELECT COUNT(*) as cnt FROM contacts').get().cnt,
  });
});

module.exports = router;
