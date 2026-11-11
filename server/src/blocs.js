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

// La même personne dans plusieurs fichiers (même téléphone ou même e-mail).
// Rien n'est fusionné ni bloqué : c'est à la direction de dire à qui est le
// contact. On compare les chiffres seuls du téléphone (06 12… == 0612… == +33612…).
const cleTel = (t) => {
  let n = String(t || '').replace(/\D/g, '');
  if (n.startsWith('0033')) n = '0' + n.slice(4);
  else if (n.startsWith('33') && n.length === 11) n = '0' + n.slice(2);
  return n.length >= 8 ? n : '';
};
function doublonsEntreFichiers() {
  if (db.prepare('SELECT COUNT(*) n FROM blocs WHERE actif = 1').get().n < 2) return [];   // un seul fichier : rien à comparer
  const lignes = db.prepare(`SELECT c.id, c.nom, c.prenom, c.telephone, c.telephone2, c.email, c.bloc_id, c.assigned_to,
      c.statut, c.created_at, b.libelle AS fichier, b.proprietaire_id
    FROM contacts c JOIN blocs b ON b.id = c.bloc_id AND b.actif = 1
    WHERE c.supprime_le IS NULL`).all();
  // Regroupement par clés partagées (union-find) : A et B ont le même mobile,
  // B et C le même e-mail → une seule personne.
  const parent = new Map();
  const racine = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const parCle = new Map();
  for (const l of lignes) {
    parent.set(l.id, l.id);
    const cles = [cleTel(l.telephone), cleTel(l.telephone2)].filter(Boolean).map(t => 't:' + t);
    const mail = aPlat(l.email); if (mail) cles.push('m:' + mail);
    for (const k of cles) {
      if (parCle.has(k)) parent.set(racine(l.id), racine(parCle.get(k)));
      else parCle.set(k, l.id);
    }
  }
  const groupes = new Map();
  for (const l of lignes) { const r = racine(l.id); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(l); }
  const noms = new Map(db.prepare('SELECT id, prenom, nom FROM users').all().map(u => [u.id, `${u.prenom || ''} ${u.nom || ''}`.trim()]));
  return [...groupes.values()]
    .filter(g => new Set(g.map(l => l.bloc_id)).size > 1)
    .map(g => ({
      personne: `${g[0].prenom || ''} ${g[0].nom || ''}`.trim(),
      telephone: g.map(l => l.telephone).find(Boolean) || '',
      fiches: g.sort((a, b) => a.bloc_id - b.bloc_id || a.id - b.id).map(l => ({
        id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(), bloc_id: l.bloc_id, fichier: l.fichier,
        proprietaire: noms.get(l.proprietaire_id) || null, suivi_par: noms.get(l.assigned_to) || null,
        statut: l.statut, cree_le: l.created_at,
      })),
    }))
    .sort((a, b) => a.personne.localeCompare(b.personne, 'fr'));
}

module.exports = { doublonsEntreFichiers, cleTel, BLOC_HISTORIQUE, blocsVisibles, blocsDeLaDemande, clauseBlocs, blocParDefaut, contactVisible, delaiDuBloc, journaliser };
