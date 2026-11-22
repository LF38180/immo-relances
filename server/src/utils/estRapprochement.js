// Mission Estimés : import du rapprochement fait par Exploration Modelo.
//
// Son fichier reprend l'export des contacts de l'appli (colonne `id` intacte)
// et ajoute, pour chaque bien de la personne : id_contact, id_bien et l'état
// des fiches dans Modelo. Une ligne par bien : l'`id` de l'appli se répète
// quand une personne a plusieurs biens.
//
// On vérifie avant d'écrire. Le nom de chaque ligne est comparé à celui de la
// fiche : un fichier d'une autre origine, ou des lignes décalées, sont refusés
// ligne par ligne plutôt qu'enregistrés de travers.
const Papa = require('papaparse');
const { db } = require('../database');

// La Mission Estimés : le fichier d'agence des estimés (le bloc 1, historique,
// et tout autre fichier d'agence de code « estimes »). Les bases personnelles
// des agents n'en font pas partie.
const blocsEstimes = () => {
  const ids = db.prepare("SELECT id FROM blocs WHERE code = 'estimes' AND proprietaire_id IS NULL").all().map(b => b.id);
  return ids.includes(1) ? ids : [1, ...ids];
};
const OBLIGATOIRES = ['id', 'nom', 'id_contact', 'id_bien', 'rapprochement'];
const vide = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const cle = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ouiNon = (v) => { const x = cle(v); return x === 'oui' ? 1 : x === 'non' ? 0 : null; };
const NIVEAU = { sur: 'SUR', probable: 'PROBABLE', introuvable: 'INTROUVABLE' };
const nombre = (v) => { const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

function etat() {
  const blocs = blocsEstimes();
  const fiches = db.prepare(`SELECT COUNT(*) n FROM contacts WHERE supprime_le IS NULL AND bloc_id IN (${blocs.map(() => '?').join(',')})`).get(...blocs).n;
  const l = db.prepare(`SELECT COUNT(DISTINCT contact_id) AS fiches,
      COUNT(DISTINCT CASE WHEN id_bien IS NOT NULL THEN contact_id END) AS fiches_avec_bien,
      SUM(id_bien IS NOT NULL) AS biens,
      SUM(rapprochement = 'SUR') AS surs, SUM(rapprochement = 'PROBABLE') AS probables,
      SUM(rapprochement = 'INTROUVABLE') AS introuvables,
      COUNT(DISTINCT CASE WHEN origine_suivi LIKE 'op%' THEN id_contact END) AS contacts_operation,
      MAX(importe_le) AS dernier_import
    FROM est_modelo_liens WHERE retire_le IS NULL`).get();
  const plusieurs = db.prepare(`SELECT COUNT(*) n FROM (SELECT contact_id FROM est_modelo_liens
    WHERE retire_le IS NULL AND id_bien IS NOT NULL GROUP BY contact_id HAVING COUNT(*) > 1)`).get().n;
  const deuxContacts = db.prepare(`SELECT COUNT(*) n FROM (SELECT contact_id FROM est_modelo_liens
    WHERE retire_le IS NULL AND id_contact IS NOT NULL GROUP BY contact_id HAVING COUNT(DISTINCT id_contact) > 1)`).get().n;
  return { fiches_mission: fiches, fiches_liees: l.fiches || 0, fiches_avec_bien: l.fiches_avec_bien || 0,
    fiches_sans_lien: fiches - (l.fiches || 0), biens: l.biens || 0, surs: l.surs || 0, probables: l.probables || 0,
    introuvables: l.introuvables || 0, fiches_plusieurs_biens: plusieurs, fiches_deux_contacts: deuxContacts,
    contacts_reattribues_par_operation: l.contacts_operation || 0, dernier_import: l.dernier_import || null };
}

function importer(texte, { simulation = true, par = null, fichier = null } = {}) {
  if (String(texte).includes('�')) return { ok: false, error: 'Le fichier n’est pas en UTF-8 (accents illisibles). Redemandez-le tel quel, sans le rouvrir dans un tableur.' };
  const brut = String(texte).replace(/^﻿/, '');
  // Virgule ou point-virgule : on lit la première ligne.
  const entete = brut.split(/\r?\n/)[0] || '';
  const delimiter = (entete.match(/;/g) || []).length > (entete.match(/,/g) || []).length ? ';' : ',';
  const r = Papa.parse(brut, { header: true, delimiter, skipEmptyLines: true });
  const colonnes = r.meta.fields || [];
  const graves = (r.errors || []).filter(e => e.type === 'Quotes' || e.code === 'TooManyFields' || e.code === 'TooFewFields');
  if (graves.length) return { ok: false, error: `Fichier mal formé, rien n’a été lu : ligne ${(graves[0].row ?? 0) + 2}${graves.length > 1 ? ` et ${graves.length - 1} autre(s)` : ''}.` };
  const manquantes = OBLIGATOIRES.filter(c => !colonnes.includes(c));
  if (manquantes.length) return { ok: false, error: `Colonnes absentes du fichier : ${manquantes.join(', ')}.` };
  if (!r.data.length) return { ok: false, error: 'Le fichier ne contient aucune ligne.' };

  const fiche = db.prepare('SELECT id, nom, bloc_id, supprime_le FROM contacts WHERE id = ?');
  const blocs = blocsEstimes();
  const lignes = [], rejets = [], vus = new Set();
  r.data.forEach((l, i) => {
    const rejet = (motif) => rejets.push({ ligne: i + 2, id: vide(l.id), id_bien: vide(l.id_bien), motif });
    const id = vide(l.id);
    if (!id || !/^\d+$/.test(id)) return rejet('numéro de fiche de l’appli manquant ou illisible');
    const c = fiche.get(Number(id));
    if (!c || c.supprime_le) return rejet('fiche inconnue dans l’appli');
    if (!blocs.includes(c.bloc_id)) return rejet('fiche hors de la Mission Estimés');
    if (cle(l.nom) !== cle(c.nom)) return rejet('le nom ne correspond pas à la fiche de l’appli');
    const niveau = NIVEAU[cle(l.rapprochement)];
    if (!niveau) return rejet(`rapprochement illisible : « ${String(l.rapprochement || '').trim()} »`);
    const idBien = vide(l.id_bien), idContact = vide(l.id_contact);
    if (niveau !== 'INTROUVABLE' && (!idBien || !idContact)) return rejet('identifiant du contact ou du bien manquant');
    const k = `${id}|${idBien || ''}`;
    if (vus.has(k)) return rejet('ligne en double (même fiche, même bien)');
    vus.add(k);
    lignes.push({ contact_id: Number(id), id_contact: idContact, id_bien: idBien, rapprochement: niveau,
      ref_ancienne: vide(l.ref_ancienne), adresse_bien: vide(l.adresse_bien), date_estimation: vide(l.date_estimation),
      statut_bien: vide(l.statut_bien), bien_archive: ouiNon(l.bien_archive), conseiller_bien: vide(l.conseiller_bien),
      agence_bien: vide(l.agence_bien), prix_estime: nombre(l.prix_estime), suivi_par_contact: vide(l.suivi_par_contact),
      contact_archive: ouiNon(l.contact_archive), stop_tel: vide(l.stop_tel), stop_mail: vide(l.stop_mail),
      methode: vide(l.methode), remarque: vide(l.remarque), origine_suivi: vide(l.origine_suivi),
      date_reattribution_ac: vide(l.date_reattribution_ac), derniere_note_ac: vide(l.derniere_note_ac) });
  });

  // Un même bien rattaché à deux fiches de l'appli : on le dit, sans refuser.
  const parBien = new Map();
  for (const l of lignes) if (l.id_bien) parBien.set(l.id_bien, [...(parBien.get(l.id_bien) || []), l.contact_id]);
  const biensPartages = [...parBien.entries()].filter(([, v]) => v.length > 1).map(([id_bien, fiches]) => ({ id_bien, fiches }));

  const fichesDuFichier = new Set(lignes.map(l => l.contact_id));
  const parFiche = new Map();
  for (const l of lignes) parFiche.set(l.contact_id, [...(parFiche.get(l.contact_id) || []), l]);
  const existe = db.prepare("SELECT id FROM est_modelo_liens WHERE contact_id = ? AND COALESCE(id_bien, '') = ?");
  let nouvelles = 0, mises_a_jour = 0, retirees = 0;
  for (const l of lignes) (existe.get(l.contact_id, l.id_bien || '') ? mises_a_jour++ : nouvelles++);
  const actuelles = db.prepare('SELECT id, contact_id, id_bien FROM est_modelo_liens WHERE retire_le IS NULL').all()
    .filter(x => fichesDuFichier.has(x.contact_id) && !vus.has(`${x.contact_id}|${x.id_bien || ''}`));
  retirees = actuelles.length;

  if (!simulation) {
    const ecrire = db.prepare(`INSERT INTO est_modelo_liens (contact_id, id_contact, id_bien, rapprochement, ref_ancienne, adresse_bien,
        date_estimation, statut_bien, bien_archive, conseiller_bien, agence_bien, prix_estime, suivi_par_contact, contact_archive,
        stop_tel, stop_mail, methode, remarque, origine_suivi, date_reattribution_ac, derniere_note_ac, importe_par, fichier)
      VALUES (@contact_id, @id_contact, @id_bien, @rapprochement, @ref_ancienne, @adresse_bien, @date_estimation, @statut_bien,
        @bien_archive, @conseiller_bien, @agence_bien, @prix_estime, @suivi_par_contact, @contact_archive, @stop_tel, @stop_mail,
        @methode, @remarque, @origine_suivi, @date_reattribution_ac, @derniere_note_ac, @par, @fichier)
      ON CONFLICT(contact_id, COALESCE(id_bien, '')) DO UPDATE SET id_contact = excluded.id_contact,
        rapprochement = excluded.rapprochement, ref_ancienne = excluded.ref_ancienne, adresse_bien = excluded.adresse_bien,
        date_estimation = excluded.date_estimation, statut_bien = excluded.statut_bien, bien_archive = excluded.bien_archive,
        conseiller_bien = excluded.conseiller_bien, agence_bien = excluded.agence_bien, prix_estime = excluded.prix_estime,
        suivi_par_contact = excluded.suivi_par_contact, contact_archive = excluded.contact_archive, stop_tel = excluded.stop_tel,
        stop_mail = excluded.stop_mail, methode = excluded.methode, remarque = excluded.remarque,
        origine_suivi = excluded.origine_suivi, date_reattribution_ac = excluded.date_reattribution_ac,
        derniere_note_ac = excluded.derniere_note_ac,
        importe_le = datetime('now'), importe_par = excluded.importe_par, fichier = excluded.fichier, retire_le = NULL`);
    const retirer = db.prepare("UPDATE est_modelo_liens SET retire_le = datetime('now') WHERE id = ?");
    db.transaction(() => {
      for (const l of lignes) ecrire.run({ ...l, par, fichier });
      for (const x of actuelles) retirer.run(x.id);
    })();
  }

  const n = (f) => lignes.filter(f).length;
  const tailles = [...parFiche.values()].map(v => v.filter(x => x.id_bien).length);
  return { ok: true, simulation, lignes_lues: r.data.length, lignes: lignes.length, fiches: fichesDuFichier.size,
    biens: n(l => l.id_bien), surs: n(l => l.rapprochement === 'SUR'), probables: n(l => l.rapprochement === 'PROBABLE'),
    introuvables: n(l => l.rapprochement === 'INTROUVABLE'),
    fiches_un_bien: tailles.filter(t => t === 1).length, fiches_plusieurs_biens: tailles.filter(t => t > 1).length,
    fiches_sans_bien: tailles.filter(t => t === 0).length,
    fiches_deux_contacts: [...parFiche.values()].filter(v => new Set(v.map(x => x.id_contact).filter(Boolean)).size > 1).length,
    nouvelles, mises_a_jour, retirees, rejets, biens_partages: biensPartages,
    etat: simulation ? null : etat() };
}

module.exports = { importer, etat, blocsEstimes };
