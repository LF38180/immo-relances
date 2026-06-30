const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');

const ROLES_VALIDES = ['agent', 'manager', 'admin'];

const router = express.Router();
router.use(requireAuth, requireRole('manager', 'admin'));

// Utilisateurs
router.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, nom, prenom, email, role, actif, created_at, last_login FROM users').all());
});

router.post('/users', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, password, role } = req.body;
  if (!ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (!nom || !prenom || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
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
  if (role !== undefined && !ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
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

// Décalage Europe/Paris -> UTC en minutes pour une date donnée (60 hiver, 120 été).
// Déduit du rendu de la date à midi dans le fuseau Paris vs UTC.
function parisOffsetMinutes(dateYmd) {
  const midi = new Date(`${dateYmd}T12:00:00Z`);
  const parisStr = midi.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' });
  const parisHeure = parseInt(parisStr, 10); // 13 (hiver) ou 14 (été) pour 12h UTC
  return (parisHeure - 12) * 60;
}

// Soustrait `min` minutes à un datetime local "YYYY-MM-DDTHH:MM:SS" et renvoie
// la chaîne UTC "YYYY-MM-DD HH:MM:SS" (format created_at SQLite).
function isoUtcMoins(localIso, min) {
  const [d, t] = localIso.split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  // Date UTC construite à partir des composantes locales, puis on retire l'offset.
  const ms = Date.UTC(Y, M - 1, D, h, mi, s) - min * 60000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// Récap des relances d'un agent pour une journée donnée (regénère un récap de
// session perdu : l'agent a fermé l'onglet avant d'éditer/exporter sa fiche).
// Les relances sont persistées à chaque appel, donc reconstructibles ici.
// date = 'YYYY-MM-DD' (défaut : aujourd'hui, fuseau Europe/Paris). Filtre sur la
// date locale Paris pour éviter le décalage UTC en soirée.
router.get('/relances-jour', (req, res) => {
  const agentId = parseInt(req.query.agent_id, 10);
  if (!agentId) return res.status(400).json({ error: 'agent_id requis' });
  // date demandée (YYYY-MM-DD), sinon aujourd'hui en heure de Paris
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date invalide (YYYY-MM-DD)' });

  const agent = db.prepare('SELECT id, nom, prenom FROM users WHERE id = ?').get(agentId);
  if (!agent) return res.status(404).json({ error: 'agent introuvable' });

  // created_at est stocké en UTC. On compare à la journée locale Paris en bornant
  // sur [début, fin[ exprimés en UTC (calculés en JS qui connaît Europe/Paris),
  // pour éviter tout décalage de date en soirée — indépendant du fuseau serveur.
  const offsetMin = parisOffsetMinutes(date); // décalage Paris→UTC ce jour-là (60 ou 120)
  const debutUtc = isoUtcMoins(`${date}T00:00:00`, offsetMin);
  const finUtc = isoUtcMoins(`${date}T24:00:00`, offsetMin);

  const relances = db.prepare(`
    SELECT r.id, r.statut, r.notes, r.prochain_contact, r.created_at,
           c.nom, c.prenom, c.telephone
    FROM relances r
    JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ?
      AND r.created_at >= ? AND r.created_at < ?
    ORDER BY r.created_at ASC
  `).all(agentId, debutUtc, finUtc);

  const stats = {
    total: relances.length,
    rdv: relances.filter(r => r.statut === 'rdv_obtenu').length,
    contactes: relances.filter(r => r.statut === 'contacte').length,
    pasRep: relances.filter(r => r.statut === 'tente_sans_reponse').length,
  };

  res.json({ agent, date, relances, stats });
});

module.exports = router;
