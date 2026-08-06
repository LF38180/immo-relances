// Espace courtage (Marine) — totalement cloisonné du reste de l'app.
// Écriture : rôle courtage uniquement. Lecture : courtage + manager + admin.
const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const lireSeule = requireRole('courtage', 'manager', 'admin');
const ecriture = requireRole('courtage');

// Helpers
const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('33') && d.length === 11) d = '0' + d.slice(2); return d || null; };
const normMail = (m) => (m || '').trim().toLowerCase() || null;
const param = (cle, defaut) => { const r = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get(cle); return r ? r.valeur : defaut; };
const dansNJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const enListeNoire = (tel, mail) => !!db.prepare('SELECT 1 FROM courtage_blacklist WHERE (telephone_norm IS NOT NULL AND telephone_norm = ?) OR (mail_norm IS NOT NULL AND mail_norm = ?)').get(tel || '∅', mail || '∅');

const STATUTS = ['a_qualifier', 'en_relance', 'simulation_faite', 'dossier_en_cours', 'gagne', 'perdu', 'injoignable', 'ne_plus_contacter'];

const insertAction = db.prepare(`INSERT INTO courtage_actions (fiche_id, type, commentaire, prochaine_relance, statut_avant, statut_apres)
  VALUES (@fiche_id, @type, @commentaire, @prochaine_relance, @statut_avant, @statut_apres)`);
function action(fiche_id, type, extra = {}) {
  insertAction.run({ fiche_id, type, commentaire: null, prochaine_relance: null, statut_avant: null, statut_apres: null, ...extra });
}
function getFiche(id) {
  return db.prepare('SELECT * FROM courtage_fiches WHERE id = ?').get(id);
}

// POST /fiches — création rapide
router.post('/fiches', ecriture, (req, res) => {
  const b = req.body || {};
  if (!b.nom || !String(b.nom).trim()) return res.status(400).json({ error: 'Le nom est requis' });
  const telephone_norm = normTel(b.telephone);
  const mail_norm = normMail(b.mail);
  if (enListeNoire(telephone_norm, mail_norm)) {
    return res.status(409).json({ error: 'Ce contact est en liste noire (ne plus contacter)' });
  }
  const prochaine_relance = b.prochaine_relance || dansNJours(parseInt(param('courtage_delai_relance_jours', '7'), 10));
  const r = db.prepare(`INSERT INTO courtage_fiches
    (nom, prenom, telephone, telephone_norm, mail, mail_norm, date_contact, montant_projet, reference_bien,
     source, attribution_cr, capacite_emprunt, categorie, priorite, statut, prochaine_relance, commentaire)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    String(b.nom).trim(), b.prenom || null, b.telephone || null, telephone_norm, b.mail || null, mail_norm,
    b.date_contact || null, b.montant_projet || null, b.reference_bien || null,
    b.source || 'CI Facile', b.attribution_cr || null, b.capacite_emprunt || null,
    b.categorie || 'manuel', b.priorite != null ? b.priorite : 1, 'en_relance', prochaine_relance, b.commentaire || null
  );
  const id = r.lastInsertRowid;
  action(id, 'creation', { commentaire: b.commentaire || null, prochaine_relance });
  if (b.reference_bien) {
    db.prepare('INSERT INTO courtage_demandes (fiche_id, reference_bien, date_demande) VALUES (?,?,?)')
      .run(id, b.reference_bien, b.date_contact || new Date().toISOString().slice(0, 10));
  }
  res.status(201).json(getFiche(id));
});

// GET /fiches — liste filtrable
router.get('/fiches', lireSeule, (req, res) => {
  const { statut, q } = req.query;
  let sql = 'SELECT * FROM courtage_fiches WHERE 1=1';
  const args = [];
  if (statut) { sql += ' AND statut = ?'; args.push(statut); }
  if (q) {
    sql += ' AND (nom LIKE ? OR prenom LIKE ? OR telephone LIKE ? OR telephone_norm LIKE ?)';
    const like = '%' + q + '%';
    args.push(like, like, like, '%' + (normTel(q) || q) + '%');
  }
  sql += ' ORDER BY updated_at DESC';
  res.json(db.prepare(sql).all(...args));
});

// GET /fiches/relances-jour — fiches à relancer aujourd'hui (ou en retard)
router.get('/fiches/relances-jour', lireSeule, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*,
      (SELECT a.commentaire FROM courtage_actions a
        WHERE a.fiche_id = f.id AND a.commentaire IS NOT NULL
        ORDER BY a.created_at DESC, a.id DESC LIMIT 1) AS dernier_commentaire
    FROM courtage_fiches f
    WHERE f.statut NOT IN ('gagne','perdu','ne_plus_contacter')
      AND f.prochaine_relance IS NOT NULL
      AND f.prochaine_relance <= date('now')
    ORDER BY f.priorite ASC, f.prochaine_relance ASC
  `).all();
  res.json(rows);
});

// GET /fiches/:id — détail avec historique
router.get('/fiches/:id', lireSeule, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const actions = db.prepare('SELECT * FROM courtage_actions WHERE fiche_id = ? ORDER BY created_at DESC, id DESC').all(fiche.id);
  const demandes = db.prepare('SELECT * FROM courtage_demandes WHERE fiche_id = ? ORDER BY created_at DESC, id DESC').all(fiche.id);
  res.json({ ...fiche, actions, demandes });
});

// POST /fiches/:id/relance — relance faite (commentaire obligatoire)
router.post('/fiches/:id/relance', ecriture, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const { commentaire, prochaine_relance, statut } = req.body || {};
  if (!commentaire || !String(commentaire).trim()) return res.status(400).json({ error: 'Le commentaire est requis' });
  if (statut && !STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  const date = prochaine_relance || dansNJours(7);
  action(fiche.id, 'relance', { commentaire: String(commentaire).trim(), prochaine_relance: date });
  if (statut && statut !== fiche.statut) {
    action(fiche.id, 'statut', { statut_avant: fiche.statut, statut_apres: statut });
  }
  db.prepare(`UPDATE courtage_fiches SET prochaine_relance = ?, statut = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(date, statut || fiche.statut, fiche.id);
  res.json(getFiche(fiche.id));
});

// POST /fiches/:id/trop-tot — décale la relance
router.post('/fiches/:id/trop-tot', ecriture, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const { jours, date } = req.body || {};
  const nouvelle = date || dansNJours(jours != null ? parseInt(jours, 10) : 7);
  action(fiche.id, 'trop_tot', { prochaine_relance: nouvelle });
  db.prepare(`UPDATE courtage_fiches SET prochaine_relance = ?, updated_at = datetime('now') WHERE id = ?`).run(nouvelle, fiche.id);
  res.json(getFiche(fiche.id));
});

// POST /fiches/:id/pas-de-reponse — incrémente les tentatives, bascule injoignable au seuil
router.post('/fiches/:id/pas-de-reponse', ecriture, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const max = parseInt(param('courtage_tentatives_max', '2'), 10);
  const tentatives = fiche.tentatives_sans_reponse + 1;
  let statut = fiche.statut;
  if (tentatives >= max && statut !== 'injoignable') {
    action(fiche.id, 'statut', { statut_avant: fiche.statut, statut_apres: 'injoignable' });
    statut = 'injoignable';
  }
  const demain = dansNJours(1);
  action(fiche.id, 'pas_de_reponse', { prochaine_relance: demain });
  db.prepare(`UPDATE courtage_fiches SET tentatives_sans_reponse = ?, statut = ?, prochaine_relance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(tentatives, statut, demain, fiche.id);
  res.json({ tentatives, statut });
});

// PUT /fiches/:id/statut — changement de statut
router.put('/fiches/:id/statut', ecriture, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const { statut } = req.body || {};
  if (!STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  let prochaine_relance = fiche.prochaine_relance;
  if (statut === 'ne_plus_contacter') {
    db.prepare('INSERT INTO courtage_blacklist (telephone_norm, mail_norm, motif) VALUES (?,?,?)')
      .run(fiche.telephone_norm, fiche.mail_norm, 'ne_plus_contacter');
    prochaine_relance = null;
  }
  if (statut === 'gagne' || statut === 'perdu') prochaine_relance = null;
  action(fiche.id, 'statut', { statut_avant: fiche.statut, statut_apres: statut });
  db.prepare(`UPDATE courtage_fiches SET statut = ?, prochaine_relance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(statut, prochaine_relance, fiche.id);
  res.json(getFiche(fiche.id));
});

// POST /fiches/:id/mail-propose — trace l'envoi du mail injoignable
router.post('/fiches/:id/mail-propose', ecriture, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  const date = dansNJours(7);
  action(fiche.id, 'mail_propose', { prochaine_relance: date });
  db.prepare(`UPDATE courtage_fiches SET mail_propose_le = date('now'), prochaine_relance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(date, fiche.id);
  res.json(getFiche(fiche.id));
});

// GET /mail-modele/:id — mailto prérempli depuis les paramètres
router.get('/mail-modele/:id', lireSeule, (req, res) => {
  const fiche = getFiche(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' });
  if (!fiche.mail) return res.status(400).json({ error: 'Cette fiche n\'a pas d\'adresse mail' });
  const remplacer = (t) => t
    .replace(/\[Prénom\]/g, fiche.prenom || '')
    .replace(/\[BIEN\]/g, fiche.reference_bien ? `(${fiche.reference_bien})` : 'immobilier')
    .replace(/\[TEL_MARINE\]/g, param('courtage_tel_marine', ''));
  const objet = remplacer(param('courtage_mail_objet', ''));
  const corps = remplacer(param('courtage_mail_corps', ''));
  const mailto = `mailto:${fiche.mail}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
  res.json({ mailto });
});

// GET /dashboard — indicateurs courtage
router.get('/dashboard', lireSeule, (req, res) => {
  const parStatut = db.prepare('SELECT statut, COUNT(*) AS cnt FROM courtage_fiches GROUP BY statut').all();
  const relancesSemaine = db.prepare(`SELECT COUNT(*) AS cnt FROM courtage_actions WHERE type = 'relance' AND created_at >= datetime('now','-7 days')`).get().cnt;
  const simulations = db.prepare(`SELECT COUNT(*) AS cnt FROM courtage_fiches WHERE statut IN ('simulation_faite','dossier_en_cours','gagne')`).get().cnt;
  const dossiers = db.prepare(`SELECT COUNT(*) AS cnt FROM courtage_fiches WHERE statut IN ('dossier_en_cours','gagne')`).get().cnt;
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM courtage_fiches').get().cnt;
  const tauxOuiSimulation = total ? Math.round((simulations / total) * 100) : 0;
  const tauxSimulationDossier = simulations ? Math.round((dossiers / simulations) * 100) : 0;
  const aRelancerAujourdhui = db.prepare(`
    SELECT COUNT(*) AS cnt FROM courtage_fiches
    WHERE statut NOT IN ('gagne','perdu','ne_plus_contacter')
      AND prochaine_relance IS NOT NULL AND prochaine_relance <= date('now')
  `).get().cnt;
  res.json({ parStatut, relancesSemaine, simulations, dossiers, tauxOuiSimulation, tauxSimulationDossier, aRelancerAujourdhui });
});

module.exports = router;
