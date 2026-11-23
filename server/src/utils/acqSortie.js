// Sortir des personnes de la Mission Acquéreurs à partir d'un fichier.
//
// Cas d'origine (20/11/2026) : des contacts rappelés hors mission par une
// conseillère, déjà archivés ou réattribués dans Modelo. Dans l'appli il faut
// qu'ils quittent la file, qu'un prochain import ne les y remette pas, et
// qu'ils ne produisent plus aucune ligne de report (Modelo est déjà à jour).
//
// Rien n'est effacé : fiches, appels et notes restent. La sortie se lève
// depuis « Personnes hors de la file » (Remettre dans la file).
const { db } = require('../database');
const { lire, sansAccent } = require('./acqImport');

const vide = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const cleNom = (s) => sansAccent(s).replace(/[^a-z0-9]+/g, ' ').trim();

function perimetre() {
  return db.prepare(`SELECT COUNT(*) AS contacts, SUM(exclu IS NULL) AS dans_la_file,
      SUM(exclu = 'HORS_MISSION') AS hors_mission FROM acq_contacts`).get();
}

function sortir(texte, { simulation = true, par = null, fichier = null } = {}) {
  if (String(texte).includes('�')) return { ok: false, error: 'Le fichier n’est pas en UTF-8 (accents illisibles). Renvoyez-le tel quel, sans le rouvrir dans un tableur.' };
  const { lignes, colonnes } = lire(texte);
  if (!colonnes.includes('id_contact')) return { ok: false, error: 'Colonne id_contact absente du fichier.' };
  if (!lignes.length) return { ok: false, error: 'Le fichier ne contient aucune ligne.' };

  // Une personne, toutes ses fiches : le fichier porte une ligne par fiche.
  const parContact = new Map();
  for (const l of lignes) {
    const id = vide(l.id_contact);
    if (!id) continue;
    const p = parContact.get(id) || { id_contact: id, nom: vide(l.nom), prenom: vide(l.prenom), motif: null, fiches: [] };
    p.motif = p.motif || vide(l.motif);
    if (vide(l.id_fiche)) p.fiches.push(vide(l.id_fiche));
    parContact.set(id, p);
  }
  return appliquer(parContact, { simulation, par, fichier, lignes: lignes.length });
}

// La sortie elle-même, pour une liste de personnes déjà établie (fichier, ou
// liste validée à l'écran) : { id_contact, nom, prenom, motif, fiches }.
function sortirPersonnes(personnes, { simulation = true, par = null, fichier = null } = {}) {
  const parContact = new Map();
  for (const p of personnes) {
    const id = vide(p.id_contact);
    if (id && !parContact.has(id)) parContact.set(id, { id_contact: id, nom: vide(p.nom), prenom: vide(p.prenom), motif: vide(p.motif), fiches: p.fiches || [] });
  }
  if (!parContact.size) return { ok: false, error: 'Aucune personne à sortir.' };
  return appliquer(parContact, { simulation, par, fichier, lignes: parContact.size });
}

function appliquer(parContact, { simulation, par, fichier, lignes: nbLignes }) {

  const contact = db.prepare(`SELECT c.id_contact, c.nom, c.prenom, c.exclu, c.statut, c.rappel_le,
      (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels,
      (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact
        AND a.horodatage > COALESCE(c.modelo_reporte_le, '')) AS a_reporter
    FROM acq_contacts c WHERE c.id_contact = ?`);
  const dejaSorti = db.prepare('SELECT 1 FROM acq_hors_mission WHERE id_contact = ? AND leve_le IS NULL');
  const sortis = [], inconnus = [], deja = [], rejetes = [];
  for (const p of parContact.values()) {
    const c = contact.get(p.id_contact);
    if (c && p.nom && cleNom(p.nom) !== cleNom(c.nom)) {
      rejetes.push({ ...p, motif_rejet: `le nom ne correspond pas (dans l’appli : ${c.nom || ''} ${c.prenom || ''})` }); continue;
    }
    if (dejaSorti.get(p.id_contact)) { deja.push(p); continue; }
    if (!c) { inconnus.push(p); continue; }
    sortis.push({ ...p, nom: c.nom, prenom: c.prenom, etait_dans_la_file: c.exclu == null, exclu_avant: c.exclu,
      appels: c.appels, a_reporter: c.a_reporter, rappel_prevu: !!c.rappel_le });
  }

  const avant = perimetre();
  if (!simulation) {
    const noter = db.prepare(`INSERT INTO acq_hors_mission (id_contact, nom, prenom, motif, fiches, par, fichier)
      VALUES (@id_contact, @nom, @prenom, @motif, @fiches, @par, @fichier)
      ON CONFLICT(id_contact) DO UPDATE SET nom = excluded.nom, prenom = excluded.prenom, motif = excluded.motif,
        fiches = excluded.fiches, par = excluded.par, fichier = excluded.fichier, le = datetime('now'),
        leve_le = NULL, leve_par = NULL`);
    // Un motif déjà posé (stop téléphone, opposition...) reste : il dit plus.
    const ecarter = db.prepare("UPDATE acq_contacts SET exclu = 'HORS_MISSION' WHERE id_contact = ? AND exclu IS NULL");
    db.transaction(() => {
      for (const p of [...sortis, ...inconnus]) {
        noter.run({ id_contact: p.id_contact, nom: p.nom, prenom: p.prenom, motif: p.motif, fiches: p.fiches.join(',') || null, par, fichier });
        ecarter.run(p.id_contact);
      }
    })();
  }
  const apres = simulation
    ? { ...avant, dans_la_file: avant.dans_la_file - sortis.filter(s => s.etait_dans_la_file).length }
    : perimetre();
  return { ok: true, simulation, lignes: nbLignes, contacts: parContact.size, sortis, inconnus, deja, rejetes,
    avant: { contacts: avant.contacts, dans_la_file: avant.dans_la_file || 0 },
    apres: { contacts: apres.contacts, dans_la_file: apres.dans_la_file || 0 } };
}

module.exports = { sortir, sortirPersonnes, perimetre };
