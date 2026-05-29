const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { categorie } = req.query;
  const where = categorie ? 'WHERE categorie = ? AND actif = 1' : 'WHERE actif = 1';
  const params = categorie ? [categorie] : [];
  res.json(db.prepare(`SELECT * FROM scripts ${where} ORDER BY categorie, ordre`).all(...params));
});

router.post('/', requireRole('manager', 'admin'), (req, res) => {
  const { categorie, titre, contenu, ordre = 0 } = req.body;
  const result = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)').run(categorie, titre, contenu, ordre);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', requireRole('manager', 'admin'), (req, res) => {
  const { titre, contenu, ordre, actif } = req.body;
  db.prepare('UPDATE scripts SET titre = COALESCE(?, titre), contenu = COALESCE(?, contenu), ordre = COALESCE(?, ordre), actif = COALESCE(?, actif) WHERE id = ?')
    .run(titre, contenu, ordre, actif, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('manager', 'admin'), (req, res) => {
  db.prepare('UPDATE scripts SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
