// Règles du Fichier Acquéreurs (cahier des charges du 18/11/2026, section 3).
//
// Contrairement à l'opération anciens clients, les règles légales ici
// BLOQUENT : « l'interface interdit, elle n'avertit pas ». Les plages, les
// jours fériés et le plafond mensuel viennent de opRegles, pour qu'il n'y ait
// qu'une seule définition du cadre légal dans l'application.
const R = require('./opRegles');
const { db } = require('../database');
const { cleTel } = require('../blocs');

// Les statuts qui sortent un contact de la file.
const STATUTS_FINAUX = ['REQUALIFIE', 'EN_PAUSE', 'ABANDONNE', 'DEJA_ACHETE', 'SANS_REPONSE',
  'NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE', 'FAUX_NUMERO'];
const STATUTS = ['REQUALIFIE', 'A_RAPPELER', 'EN_PAUSE', 'ABANDONNE', 'DEJA_ACHETE', 'SANS_REPONSE',
  'NE_PLUS_CONTACTER', 'ERREUR_IDENTITE', 'DECEDE'];
// Après la quatrième tentative sans réponse, le contact sort de la file
// (cahier : deux tentatives à des heures différentes, message à la troisième,
// SMS ou mail à la quatrième).
const TENTATIVES_MAX = 4;

// La personne s'est-elle opposée, dans N'IMPORTE QUEL module ? Le journal des
// oppositions est commun avec l'opération anciens clients : on le lit par
// identifiant Modelo et par téléphone.
function opposee(contact) {
  const tels = [cleTel(contact.tel_portable), cleTel(contact.tel_fixe)].filter(Boolean);
  const lignes = db.prepare(`SELECT id_modelo, telephone FROM op_journal_opposition WHERE canal = 'TELEPHONE'`).all();
  return lignes.some(l => l.id_modelo === contact.id_contact || (l.telephone && tels.includes(cleTel(l.telephone))));
}

// Les appels des 15 derniers jours dans les autres modules, par téléphone.
// Construit une fois pour toute la file : une Map téléphone -> dernier appel.
function appelsRecentsAilleurs() {
  const m = new Map();
  const garder = (tel, le, par, module) => {
    const k = cleTel(tel); if (!k) return;
    const prec = m.get(k);
    if (!prec || prec.le < le) m.set(k, { le, par, module });
  };
  for (const r of db.prepare(`SELECT c.tel_portable, c.tel_fixe, MAX(a.horodatage) le, a.conseiller par
      FROM op_appels a JOIN op_contacts c ON c.id_modelo = a.id_modelo
      WHERE a.horodatage >= datetime('now', '-15 days') GROUP BY a.id_modelo`).all()) {
    garder(r.tel_portable, r.le, r.par, 'Opération anciens clients');
    garder(r.tel_fixe, r.le, r.par, 'Opération anciens clients');
  }
  for (const r of db.prepare(`SELECT c.telephone, c.telephone2, MAX(r.created_at) le, u.prenom || ' ' || u.nom par
      FROM relances r JOIN contacts c ON c.id = r.contact_id LEFT JOIN users u ON u.id = r.agent_id
      WHERE r.created_at >= datetime('now', '-15 days') GROUP BY r.contact_id`).all()) {
    garder(r.telephone, r.le, r.par, 'Fichier Estimés');
    garder(r.telephone2, r.le, r.par, 'Fichier Estimés');
  }
  for (const r of db.prepare(`SELECT f.telephone, MAX(a.created_at) le FROM courtage_actions a
      JOIN courtage_fiches f ON f.id = a.fiche_id
      WHERE a.type IN ('relance','pas_de_reponse') AND a.created_at >= datetime('now', '-15 days') GROUP BY f.id`).all())
    garder(r.telephone, r.le, 'Marine', 'Courtage');
  return m;
}

function appelRecent(contact, carte) {
  const r = [cleTel(contact.tel_portable), cleTel(contact.tel_fixe)].filter(Boolean)
    .map(t => carte.get(t)).filter(Boolean).sort((a, b) => b.le.localeCompare(a.le))[0];
  return r || null;
}

// Ce qui interdit d'appeler maintenant. Liste vide = l'appel est permis.
function blocages(contact, appelsCeMois, maintenant = new Date()) {
  const b = [];
  if (contact.stop_tel) b.push('Stop téléphone : cette personne ne veut plus être appelée.');
  if (contact.statut === 'NE_PLUS_CONTACTER' || opposee(contact)) b.push('Cette personne a demandé à ne plus être contactée.');
  if (appelsCeMois >= R.PLAFOND_MENSUEL) b.push(`Plafond atteint : ${appelsCeMois} appels ce mois-ci (maximum ${R.PLAFOND_MENSUEL}).`);
  // Les tests tournent à toute heure : ils seuls peuvent lever la plage.
  const ignorer = process.env.NODE_ENV === 'test' && process.env.ACQ_IGNORER_PLAGE === '1';
  const p = R.plageAppelOk(maintenant);
  if (!p.ok && !ignorer) b.push(p.raison);
  return b;
}

// La requalification n'est possible que si tout est là. Renvoie ce qui manque.
function manquesRequalif(projet = {}) {
  const m = [];
  if (projet.etat_projet !== 'ACTIF') m.push('projet actif');
  if (!(Number(projet.budget_max) > 0)) m.push('budget');
  if (!(Array.isArray(projet.secteurs) ? projet.secteurs.length : String(projet.secteurs || '').trim())) m.push('secteur');
  if (!projet.date_emmenagement && !(Number(projet.urgence) >= 1)) m.push('délai');
  if (!projet.mode_financement) m.push('mode de financement');
  if (!projet.financement_valide) m.push('financement validé ou non');
  return m;
}

// Correspondances vers Modelo (cahier, compléments du 18/11).
const prioriteModelo = (u) => { const n = Number(u); if (!n) return null;
  return n >= 9 ? 'Urgent' : n >= 7 ? 'Court terme' : n >= 4 ? 'Moyen terme' : 'Long terme'; };
const budgetModelo = (b) => (Number(b) > 0 ? Math.round(Number(b) * 1.1) : null);

module.exports = { STATUTS, STATUTS_FINAUX, TENTATIVES_MAX, opposee, appelsRecentsAilleurs, appelRecent,
  blocages, manquesRequalif, prioriteModelo, budgetModelo };
