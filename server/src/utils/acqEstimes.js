// Mission Acquéreurs × Mission Estimés : les personnes que Chrystelle a déjà
// eues au téléphone.
//
// Décision de Loïck (23/11/2026) : quand Chrystelle a eu la personne, elle a
// aussi fait le point sur son projet d'achat. La personne sort donc de la file
// de l'appelante acquéreurs et reste à Chrystelle dans Modelo. Si Chrystelle
// ne l'a jamais jointe, elle reste dans la file, et l'écran d'appel le dit.
// Une personne déjà appelée côté acquéreurs n'est pas touchée.
//
// Rien n'est sorti d'office : l'administration voit la liste et valide. La
// sortie passe par acqSortie (réversible, tenue aux imports suivants).
//
// Le lien entre les deux fiches : le téléphone, et le numéro de contact Modelo
// quand le rapprochement de la Mission Estimés est importé (est_modelo_liens).
const { db } = require('../database');
const { cleTel } = require('../blocs');
const { blocsEstimes } = require('./estRapprochement');

const MOTIF = 'Déjà vue par Chrystelle (Mission Estimés)';
const LIBELLES = { projet: 'Projet', rappel: 'À recontacter plus tard', demenage: 'N’habite plus à l’adresse',
  sans_projet: 'Plus de projet', autre: 'Autre', sans_reponse: 'Sans réponse' };
// Anciennes relances, saisies avant les issues : le statut dit si elle a répondu.
const STATUTS_JOINTS = ['contacte', 'rdv_obtenu', 'pas_interesse', 'rappel_planifie'];
const jointe = (r) => (r.issue ? r.issue !== 'sans_reponse' : STATUTS_JOINTS.includes(r.statut));
const plier = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Toutes les fiches de la Mission Estimés, avec leurs appels, rangées par
// téléphone et par numéro de contact Modelo.
function fichesEstimes() {
  const blocs = blocsEstimes();
  const q = blocs.map(() => '?').join(',');
  const fiches = db.prepare(`SELECT id, nom, prenom, telephone, telephone2, statut, tags
    FROM contacts WHERE supprime_le IS NULL AND bloc_id IN (${q})`).all(...blocs);
  const parId = new Map(fiches.map(f => [f.id, { ...f, appels: [] }]));
  const appels = db.prepare(`SELECT r.contact_id, r.issue, r.statut, r.notes, r.created_at,
      TRIM(COALESCE(u.prenom, '') || ' ' || COALESCE(u.nom, '')) AS par
    FROM relances r LEFT JOIN users u ON u.id = r.agent_id
    WHERE r.type = 'appel' AND r.contact_id IN (SELECT id FROM contacts WHERE supprime_le IS NULL AND bloc_id IN (${q}))
    ORDER BY r.created_at, r.id`).all(...blocs);
  for (const a of appels) parId.get(a.contact_id)?.appels.push(a);
  const parTel = new Map(), parModelo = new Map();
  const ranger = (m, k, f) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(f); };
  for (const f of parId.values()) { ranger(parTel, cleTel(f.telephone), f); ranger(parTel, cleTel(f.telephone2), f); }
  for (const l of db.prepare('SELECT contact_id, id_contact FROM est_modelo_liens WHERE retire_le IS NULL AND id_contact IS NOT NULL').all()) {
    const f = parId.get(l.contact_id); if (f) ranger(parModelo, String(l.id_contact), f);
  }
  return { parTel, parModelo };
}

// Ce que la Mission Estimés sait d'une personne de la Mission Acquéreurs.
function resume(c, index) {
  const trouvees = new Map();
  const ajouter = (set, lien) => { for (const f of set || []) if (!trouvees.has(f.id)) trouvees.set(f.id, { f, lien }); };
  ajouter(index.parModelo.get(String(c.id_contact)), 'MODELO');
  for (const t of [cleTel(c.tel_portable), cleTel(c.tel_fixe)].filter(Boolean)) ajouter(index.parTel.get(t), 'TELEPHONE');
  if (!trouvees.size) return null;
  const appels = [...trouvees.values()].flatMap(x => x.f.appels).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const joints = appels.filter(jointe);
  const dernier = joints[joints.length - 1] || null;
  const fiches = [...trouvees.values()];
  // « N'habite plus » sans nouvelle adresse : Chrystelle a pu parler à un tiers.
  const tiers = !!dernier && dernier.issue === 'demenage'
    && fiches.some(x => x.f.statut === 'inactif' && String(x.f.tags || '').includes('prospecter_terrain'));
  return {
    fiches_estimes: fiches.map(x => x.f.id), nom_estimes: `${fiches[0].f.nom || ''} ${fiches[0].f.prenom || ''}`.trim(),
    lien: fiches.some(x => x.lien === 'MODELO') ? 'MODELO' : 'TELEPHONE',
    // Lié par le seul téléphone, avec un nom différent : un numéro partagé, peut-être pas la même personne.
    nom_different: fiches.every(x => x.lien === 'TELEPHONE' && plier(x.f.nom) !== plier(c.nom)),
    jointe: !!dernier, tiers_possible: tiers,
    tentatives: appels.length - joints.length, appels: appels.length,
    dernier_appel: dernier ? { le: dernier.created_at, issue: dernier.issue, libelle: LIBELLES[dernier.issue] || 'Jointe',
      note: dernier.notes || '', par: dernier.par || '' } : null,
    derniere_tentative_le: appels.length ? appels[appels.length - 1].created_at : null,
  };
}

// Pour l'écran d'appel : une seule personne.
function pourContact(c) { return resume(c, fichesEstimes()); }

// La liste pour l'administration.
function croisement() {
  const index = fichesEstimes();
  const contacts = db.prepare(`SELECT c.id_contact, c.civilite, c.nom, c.prenom, c.tel_portable, c.tel_fixe, c.exclu,
      c.madame_fichier, c.derniere_note_date, c.derniere_note_auteur, c.derniere_note_extrait,
      (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels_acq,
      (SELECT GROUP_CONCAT(f.id_fiche) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS fiches
    FROM acq_contacts c ORDER BY c.nom, c.prenom`).all();
  const lignes = [];
  for (const c of contacts) {
    const e = resume(c, index);
    const noteModelo = /chrystelle|bajulaz/.test(plier(c.derniere_note_auteur));
    if (!e && !noteModelo) continue;
    const vue = !!(e && e.jointe) || noteModelo;
    lignes.push({
      id_contact: c.id_contact, civilite: c.civilite, nom: c.nom, prenom: c.prenom, madame_fichier: c.madame_fichier,
      fiches: c.fiches ? String(c.fiches).split(',') : [], exclu: c.exclu, appels_acq: c.appels_acq,
      estimes: e, note_modelo: noteModelo ? { le: c.derniere_note_date, extrait: c.derniere_note_extrait || '' } : null,
      // À SORTIR : vue par Chrystelle, encore dans la file, jamais appelée côté acquéreurs.
      etat: !vue ? 'JAMAIS_JOINTE' : c.exclu ? 'DEJA_HORS_FILE' : c.appels_acq ? 'DEJA_APPELEE' : 'A_SORTIR',
      // Cochée d'office seulement quand il n'y a pas de doute.
      a_verifier: !!e && (e.tiers_possible || e.nom_different),
    });
  }
  return lignes;
}

function compter(lignes = croisement()) {
  const n = (f) => lignes.filter(f).length;
  return { communes: n(l => !!l.estimes), a_sortir: n(l => l.etat === 'A_SORTIR'), dont_a_verifier: n(l => l.etat === 'A_SORTIR' && l.a_verifier),
    dont_note_modelo_seule: n(l => l.etat === 'A_SORTIR' && !(l.estimes && l.estimes.jointe)),
    deja_appelees: n(l => l.etat === 'DEJA_APPELEE'), deja_hors_file: n(l => l.etat === 'DEJA_HORS_FILE'),
    jamais_jointes: n(l => l.etat === 'JAMAIS_JOINTE'), liees_par_modelo: n(l => l.estimes && l.estimes.lien === 'MODELO') };
}

module.exports = { croisement, compter, pourContact, MOTIF };
