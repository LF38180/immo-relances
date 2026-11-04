// Journal d'activité. Une écriture ne doit jamais faire échouer l'action
// qu'elle trace : tout est dans un try, et on se contente d'un avertissement.
const { db } = require('../database');

const inserer = db.prepare(`INSERT INTO op_journal (auteur, user_id, action, id_modelo, details)
  VALUES (?, ?, ?, ?, ?)`);

// `qui` : un objet { id, nom_complet } (identite()), un utilisateur de la table
// users, ou req.user (jeton : id + email).
function nomDe(qui) {
  if (!qui) return null;
  if (qui.nom_complet) return qui.nom_complet;
  if (qui.prenom || qui.nom) return `${qui.prenom || ''} ${qui.nom || ''}`.trim();
  if (qui.id) {
    const u = db.prepare('SELECT prenom, nom FROM users WHERE id = ?').get(qui.id);
    if (u) return `${u.prenom} ${u.nom}`.trim();
  }
  return qui.email || null;
}

function journaliser(qui, action, { id_modelo = null, details = null } = {}) {
  try {
    inserer.run(nomDe(qui), qui?.id ?? null, action, id_modelo,
      details == null ? null : JSON.stringify(details));
  } catch (e) {
    console.warn('journal :', action, e.message);
  }
}

module.exports = { journaliser };
