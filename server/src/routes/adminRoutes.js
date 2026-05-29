const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('manager', 'admin'));

// Utilisateurs
router.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, nom, prenom, email, role, actif, created_at FROM users').all());
});

router.post('/users', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, password, role } = req.body;
  try {
    const result = db.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)')
      .run(nom, prenom, email.toLowerCase(), bcrypt.hashSync(password, 10), role);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

router.put('/users/:id', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, role, actif, password } = req.body;
  if (password) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  db.prepare(`UPDATE users SET nom = COALESCE(?, nom), prenom = COALESCE(?, prenom),
    email = COALESCE(?, email), role = COALESCE(?, role), actif = COALESCE(?, actif) WHERE id = ?`)
    .run(nom, prenom, email, role, actif, req.params.id);
  res.json({ ok: true });
});

// Paramètres
router.get('/parametres', (req, res) => {
  const rows = db.prepare('SELECT * FROM parametres').all();
  const params = {};
  rows.forEach(r => params[r.cle] = r.valeur);
  res.json(params);
});

router.put('/parametres', (req, res) => {
  const update = db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)');
  const updateAll = db.transaction((params) => {
    Object.entries(params).forEach(([k, v]) => update.run(k, String(v)));
  });
  updateAll(req.body);
  res.json({ ok: true });
});

// Supervision temps réel
router.get('/supervision', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const activite = db.prepare(`
    SELECT u.id, u.nom, u.prenom,
      COUNT(r.id) as relances_total,
      SUM(CASE WHEN r.statut = 'rdv_obtenu' THEN 1 ELSE 0 END) as rdv,
      SUM(CASE WHEN r.statut = 'tente_sans_reponse' THEN 1 ELSE 0 END) as sans_reponse,
      SUM(CASE WHEN r.statut = 'contacte' THEN 1 ELSE 0 END) as contactes,
      MAX(r.created_at) as derniere_relance
    FROM users u LEFT JOIN relances r ON r.agent_id = u.id AND DATE(r.created_at) = ?
    WHERE u.role = 'agent' AND u.actif = 1 GROUP BY u.id
  `).all(today);

  res.json({ activite, date: today });
});

module.exports = router;
