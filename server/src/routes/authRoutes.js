const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND actif = 1').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, nom, prenom, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

router.put('/password', requireAuth, (req, res) => {
  const { ancien, nouveau } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(ancien, user.password)) return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(nouveau, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
