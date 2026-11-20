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
function oppositions() {
  const lignes = db.prepare(`SELECT id_modelo, telephone FROM op_journal_opposition WHERE canal = 'TELEPHONE'`).all();
  const tels = new Set(lignes.map(l => cleTel(l.telephone)).filter(Boolean));
  // Un « ne plus contacter » noté par Marine vaut aussi pour les acquéreurs :
  // la personne a dit non à l'agence, pas à un module.
  for (const l of db.prepare("SELECT telephone FROM courtage_fiches WHERE statut = 'ne_plus_contacter'").all()) {
    const k = cleTel(l.telephone); if (k) tels.add(k);
  }
  return { ids: new Set(lignes.map(l => l.id_modelo)), tels };
}
// `journal` : le résultat de oppositions(), lu une fois quand on teste toute
// une file (sinon une requête par contact, à chaque affichage).
function opposee(contact, journal = oppositions()) {
  return journal.ids.has(contact.id_contact)
    || [cleTel(contact.tel_portable), cleTel(contact.tel_fixe)].some(t => t && journal.tels.has(t));
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

// Ce qui interdit d'appeler. Liste vide = l'appel est permis.
//
// Décision de Loïck du 18/11 : la plage horaire n'interdit plus, elle AVERTIT
// (comme dans l'opération anciens clients) — voir alertes(). Un appel commencé
// à 12 h 55 et clos à 13 h 02 ne pouvait plus être enregistré. Restent
// bloquants : le stop, l'opposition, le plafond mensuel, et une fiche sortie
// de la file. `entrant` : c'est la personne qui rappelle — rien de tout cela
// ne s'applique à un appel qu'elle a passé elle-même.
const LIB_EXCLU = { CONTACT_ARCHIVE: 'contact archivé ou absent de Modelo', STOP_TEL: 'stop téléphone',
  SANS_TELEPHONE: 'sans téléphone', DECES_POSSIBLE: 'décès possible (note Modelo)',
  DOUBLON_AUTRE_AGENCE: 'doublon avec Saint-Égrève', SUIVI_PAR_AGENT: 'suivi par un agent en poste',
  LOCATION_SEULE: 'recherche en location uniquement', OPPOSITION: 'a demandé à ne plus être contacté' };
function blocages(contact, appelsCeMois, maintenant = new Date(), { entrant = false } = {}) {
  if (entrant) return [];
  const b = [];
  if (contact.exclu) b.push(`Hors de la file : ${LIB_EXCLU[contact.exclu] || contact.exclu}. À remettre dans la file côté administration avant d’appeler.`);
  if (contact.stop_tel) b.push('Stop téléphone : cette personne ne veut plus être appelée.');
  if (contact.statut === 'NE_PLUS_CONTACTER' || opposee(contact)) b.push('Cette personne a demandé à ne plus être contactée.');
  if (appelsCeMois >= R.PLAFOND_MENSUEL) b.push(`Plafond atteint : ${appelsCeMois} appels ce mois-ci (maximum ${R.PLAFOND_MENSUEL}).`);
  return b;
}
// Ce qui mérite un avertissement sans interdire : l'heure.
function alertes(maintenant = new Date()) {
  const p = R.plageAppelOk(maintenant);
  return p.ok ? [] : [p.raison];
}

// Le moment où l'appel a commencé, tel que l'écran l'a noté à l'ouverture de
// la fiche. On ne le croit que s'il est plausible : dans le passé, et vieux de
// quatre heures au plus. Sinon, maintenant.
function debutAppel(valeur, maintenant = new Date()) {
  const d = valeur ? new Date(valeur) : null;
  if (!d || Number.isNaN(d.getTime())) return maintenant;
  const age = maintenant.getTime() - d.getTime();
  return age >= 0 && age <= 4 * 3600 * 1000 ? d : maintenant;
}

// Ce qui manque pour une fiche complète. Depuis le 20/11 ce n'est plus bloquant :
// la requalification demande seulement un projet actif (voir la clôture).
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

module.exports = { STATUTS, STATUTS_FINAUX, TENTATIVES_MAX, opposee, oppositions, appelsRecentsAilleurs, appelRecent,
  blocages, alertes, debutAppel, manquesRequalif, prioriteModelo, budgetModelo };
