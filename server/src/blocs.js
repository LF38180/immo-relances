// Fichiers (« blocs ») : qui voit quoi.
//
// Une seule règle, appliquée par toutes les routes du cœur :
//   - admin    : tous les blocs ;
//   - manager  : les blocs de son agence, et ceux sans agence (tous si lui-même
//                n'a pas d'agence renseignée) ;
//   - agent    : les blocs qu'on lui a ouverts (bloc_acces) et ceux dont il est
//                propriétaire (sa base personnelle) ;
//   - courtage, conseiller : aucun — ils ont leur propre espace.
// Le bloc 1 est le fichier historique (les estimés) : tout l'existant y est.
const { db } = require('./database');

const BLOC_HISTORIQUE = 1;
const aPlat = (s) => (s == null ? '' : String(s).trim().toLowerCase());

function blocsVisibles(user) {
  if (!user) return [];
  const tous = db.prepare('SELECT * FROM blocs WHERE actif = 1 ORDER BY id').all();
  if (user.role === 'admin') return tous;
  if (user.role === 'manager') {
    const agence = aPlat(db.prepare('SELECT agence FROM users WHERE id = ?').get(user.id)?.agence);
    return tous.filter(b => !agence || !aPlat(b.agence) || aPlat(b.agence) === agence);
  }
  if (user.role === 'agent') {
    const ouverts = new Set(db.prepare('SELECT bloc_id FROM bloc_acces WHERE user_id = ?').all(user.id).map(r => r.bloc_id));
    return tous.filter(b => ouverts.has(b.id) || b.proprietaire_id === user.id);
  }
  return [];
}

// Les blocs sur lesquels porte une demande : celui demandé (s'il est visible),
// sinon tous ceux que la personne voit. `null` = bloc demandé mais interdit.
function blocsDeLaDemande(user, demande) {
  const visibles = blocsVisibles(user).map(b => b.id);
  if (demande === undefined || demande === null || demande === '') return visibles;
  const id = parseInt(demande, 10);
  return visibles.includes(id) ? [id] : null;
}

// Fragment SQL « colonne IN (…) ». Une liste vide ne doit rien renvoyer.
function clauseBlocs(ids, colonne = 'contacts.bloc_id') {
  return ids.length ? `${colonne} IN (${ids.map(() => '?').join(',')})` : '0';
}

// Le bloc dans lequel on crée ou importe quand rien n'est précisé : le fichier
// historique s'il est visible, sinon le premier de la liste.
function blocParDefaut(user) {
  const ids = blocsVisibles(user).map(b => b.id);
  if (!ids.length) return null;
  return ids.includes(BLOC_HISTORIQUE) ? BLOC_HISTORIQUE : ids[0];
}

// Une fiche est-elle à la portée de cette personne ? (existe, non supprimée, bloc visible)
function contactVisible(user, contactId) {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ? AND supprime_le IS NULL').get(contactId);
  if (!c) return null;
  return blocsVisibles(user).some(b => b.id === c.bloc_id) ? c : null;
}

// Réglage d'un bloc, avec repli sur le réglage général.
function delaiDuBloc(blocId, cle, general) {
  const b = db.prepare(`SELECT ${cle} AS v FROM blocs WHERE id = ?`).get(blocId);
  return Number.isFinite(b?.v) && b.v > 0 ? b.v : general;
}

function journaliser(user, contactId, blocId, type, avant, apres) {
  try {
    db.prepare('INSERT INTO contact_evenements (user_id, contact_id, bloc_id, type, avant, apres) VALUES (?,?,?,?,?,?)')
      .run(user?.id ?? null, contactId, blocId ?? null, type, avant == null ? null : String(avant), apres == null ? null : String(apres));
  } catch (e) { console.error('[journal contacts]', e.message); }   // ne bloque jamais l'action
}

module.exports = { BLOC_HISTORIQUE, blocsVisibles, blocsDeLaDemande, clauseBlocs, blocParDefaut, contactVisible, delaiDuBloc, journaliser };
