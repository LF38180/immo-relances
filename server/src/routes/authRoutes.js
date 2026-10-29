const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  // Les espaces en bout du mot de passe sont un accident de copier-coller
  // (« LeQuai2026 » suivi d'un espace ou d'un point final sur mobile), jamais
  // une intention. Même règle au changement de mot de passe, pour rester
  // cohérent.
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND actif = 1').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password).trim(), user.password)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role, must_change_password: user.must_change_password }
  });
});

// `must_change_password` y figure pour qu'un second appareil puisse savoir que
// le changement a déjà été fait sur le premier : sans cela, le téléphone
// redemandait l'ancien mot de passe provisoire, désormais faux.
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, nom, prenom, email, role, must_change_password FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

router.put('/password', requireAuth, (req, res) => {
  const ancien = String(req.body?.ancien ?? '').trim();
  const nouveau = String(req.body?.nouveau ?? '').trim();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(ancien, user.password)) {
    return res.status(400).json({
      error: 'Ancien mot de passe incorrect. Si vous l\'avez déjà changé sur un autre appareil, déconnectez-vous et reconnectez-vous avec le nouveau.',
    });
  }
  // Les règles vivent ici, pas seulement à l'écran : l'API ne doit pas
  // accepter ce que le formulaire refuse. Et « nouveau = ancien » rendrait le
  // changement obligatoire inopérant — quinze comptes garderaient le mot de
  // passe commun.
  if (nouveau.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
  if (nouveau === ancien) return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l\'ancien.' });

  // Les deux écritures ensemble : un mot de passe changé avec le drapeau
  // encore levé redemanderait un changement avec un « ancien » devenu faux.
  db.transaction(() => {
    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
      .run(bcrypt.hashSync(nouveau, 10), req.user.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
