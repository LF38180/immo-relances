// Import du Fichier Acquéreurs : l'extraction préparée par Exploration Modelo
// (une ligne par fiche acquéreur, croisée avec la fiche contact).
//
// Les colonnes sont lues par leur NOM, jamais par leur place : une version
// suivante du fichier peut ajouter une colonne (la civilité, par exemple)
// sans casser l'import.
//
// Rien n'est jamais effacé. Une fiche déjà importée voit ses données Modelo
// rafraîchies, mais ce que Lilas a saisi (décisions, requalification,
// statut, appels) n'est pas touché.
const Papa = require('papaparse');
const { db } = require('../database');
const { cleTel } = require('../blocs');

const OBLIGATOIRES = ['id_fiche', 'id_contact', 'nom', 'tel_portable', 'stop_tel', 'type_recherche'];
const OPTIONS = ['balcon', 'terrasse', 'jardin', 'ascenseur', 'dernier_etage', 'cave', 'piscine', 'pmr'];

const vide = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
// « 300 000,00 » vaut 300 000, pas 30 000 000 : les décimales tombent avant
// qu'on retire ce qui n'est pas un chiffre.
const entier = (v) => { const n = parseInt(String(v || '').replace(/[.,]\d{1,2}\s*(€|euros?)?\s*$/i, '').replace(/\D/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
const oui = (v) => /^(oui|1|true)$/i.test(String(v || '').trim()) ? 1 : 0;
// Un stop n'est pas une case qu'on devine : oui ou non, rien d'autre.
const ouiNonValide = (v) => /^(oui|non|1|0|true|false)?$/i.test(String(v == null ? '' : v).trim());
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function lire(texte) {
  const brut = String(texte).replace(/^﻿/, '');
  const r = Papa.parse(brut, { header: true, delimiter: ';', skipEmptyLines: true });
  return { lignes: r.data, colonnes: r.meta.fields || [], erreurs: r.errors || [],
    lignes_physiques: brut.split(/\r?\n/).filter(x => x.trim()).length - 1 };
}

// Les contacts que l'audit des doublons propose d'archiver : l'autre agence
// garde la personne, Lilas ne l'appelle pas.
function doublonsAArchiver(texte) {
  if (!texte || !String(texte).trim()) return new Set();
  const { lignes } = lire(texte);
  return new Set(lignes.filter(l => /^archiver/i.test(String(l.proposition || '').trim()))
    .map(l => String(l.id_contact || '').trim()).filter(Boolean));
}

// Pourquoi ce contact ne va pas dans la file. null = il y va.
function motifExclusion(c, fiches, { doublons, suiveursRepris }) {
  // Sans accents : un fichier dont les accents ont souffert ne doit pas laisser
  // passer un décès ou un contact archivé.
  const alertes = sansAccent(fiches.map(f => f.alertes_a_verifier || '').join(' | '));
  if (c.stop_brut == null || /contact archiv/.test(alertes)) return 'CONTACT_ARCHIVE';
  if (c.stop_tel) return 'STOP_TEL';
  if (!cleTel(c.tel_portable) && !cleTel(c.tel_fixe)) return 'SANS_TELEPHONE';
  if (/dec[eè]s|decede/.test(alertes)) return 'DECES_POSSIBLE';
  if (doublons.has(c.id_contact)) return 'DOUBLON_AUTRE_AGENCE';
  if (c.suivi_par && !suiveursRepris.has(sansAccent(c.suivi_par))) return 'SUIVI_PAR_AGENT';
  if (fiches.every(f => sansAccent(f.type_recherche) === 'location')) return 'LOCATION_SEULE';
  return null;
}

const LIBELLES_EXCLUSION = {
  CONTACT_ARCHIVE: 'Contact archivé ou absent de Modelo',
  STOP_TEL: 'Stop téléphone',
  SANS_TELEPHONE: 'Sans téléphone',
  DECES_POSSIBLE: 'Décès possible (note Modelo)',
  DOUBLON_AUTRE_AGENCE: 'Doublon avec Saint-Égrève, à archiver',
  SUIVI_PAR_AGENT: 'Contact suivi par un agent en poste',
  LOCATION_SEULE: 'Recherche en location uniquement',
  OPPOSITION: 'A demandé à ne plus être contacté',
  HORS_MISSION: 'Sorti hors mission',
};

function importer(texte, { doublonsCsv = null, madameFichier, suiveursRepris = ['Loick FERRUCCI'], simulation = true } = {}) {
  if (!madameFichier) return { ok: false, error: 'Précisez qui traite ce fichier.' };
  // Un fichier ré-enregistré par un tableur dans un autre encodage arrive avec
  // des caractères de remplacement : on le refuse, on ne devine pas.
  if (String(texte).includes('\uFFFD')) return { ok: false, error: 'Le fichier n’est pas en UTF-8 (accents illisibles). Demandez à Exploration Modelo de le renvoyer tel quel, sans le rouvrir dans un tableur.' };
  const { lignes, colonnes, erreurs: malFormees, lignes_physiques } = lire(texte);
  // Un guillemet mal fermé avale les lignes suivantes sans prévenir.
  const graves = malFormees.filter(e => e.type === 'Quotes' || e.code === 'TooManyFields' || e.code === 'TooFewFields');
  if (graves.length) return { ok: false, error: `Fichier mal formé, rien n’a été importé : ${graves.slice(0, 3).map(e => `ligne ${(e.row ?? 0) + 2} (${e.code === 'TooFewFields' ? 'colonnes manquantes' : e.code === 'TooManyFields' ? 'colonnes en trop' : 'guillemet non fermé'})`).join(', ')}${graves.length > 3 ? `, et ${graves.length - 3} autres` : ''}.` };
  const manquantes = OBLIGATOIRES.filter(c => !colonnes.includes(c));
  if (manquantes.length) return { ok: false, error: `Colonnes absentes du fichier : ${manquantes.join(', ')}.`, colonnes };
  if (!lignes.length) return { ok: false, error: 'Le fichier ne contient aucune ligne.' };
  const stopIllisible = lignes.findIndex(l => !ouiNonValide(l.stop_tel) || !ouiNonValide(l.stop_mail));
  if (stopIllisible >= 0) return { ok: false, error: `Ligne ${stopIllisible + 2} : la colonne stop_tel ou stop_mail contient « ${String(lignes[stopIllisible].stop_tel || lignes[stopIllisible].stop_mail).trim()} ». Seuls OUI et NON sont acceptés ; rien n’a été importé.` };

  const doublons = doublonsAArchiver(doublonsCsv);
  const repris = new Set([madameFichier, ...suiveursRepris].map(sansAccent));

  // Regroupement par contact : une personne, toutes ses fiches.
  const parContact = new Map();
  const erreurs = [];
  lignes.forEach((l, i) => {
    const idf = vide(l.id_fiche), idc = vide(l.id_contact);
    if (!idf || !idc) { erreurs.push(`Ligne ${i + 2} : identifiant manquant.`); return; }
    if (!parContact.has(idc)) {
      parContact.set(idc, {
        contact: {
          id_contact: idc, civilite: vide(l.civilite), nom: vide(l.nom), prenom: vide(l.prenom), societe: vide(l.societe),
          email: vide(l.email), tel_portable: vide(l.tel_portable), tel_fixe: vide(l.tel_fixe),
          adresse: vide(l.adresse_contact), code_postal: vide(l.cp_contact), commune: vide(l.commune_contact),
          stop_brut: vide(l.stop_tel), stop_tel: oui(l.stop_tel), stop_mail: oui(l.stop_mail),
          type_contact: vide(l.type_contact), suivi_par: vide(l.suivi_par_contact),
          nb_notes: entier(l.nb_notes_contact), derniere_note_date: vide(l.derniere_note_date),
          derniere_note_auteur: vide(l.derniere_note_auteur), derniere_note_extrait: vide(l.derniere_note_extrait),
          acheteur_vendeur: /vendeur/i.test(l.type_contact || '') ? 1 : 0,
        },
        fiches: [],
      });
    }
    parContact.get(idc).fiches.push({
      id_fiche: idf, id_contact: idc,
      ancien_conseiller: vide(l.ancien_conseiller_fiche), type_recherche: vide(l.type_recherche), type_bien: vide(l.type_bien),
      budget_min: entier(l.budget_min), budget_max: entier(l.budget_max),
      surface_min: entier(l.surface_min), surface_max: entier(l.surface_max),
      pieces_min: entier(l.pieces_min), chambres_min: entier(l.chambres_min),
      localisation_mode: vide(l.localisation_mode), communes: vide(l.communes), codes_postaux: vide(l.codes_postaux),
      priorite: vide(l.priorite), alerte_mail: oui(l.alerte_mail), modifiee_periode: vide(l.fiche_modifiee_periode),
      precisions: vide(l.precisions), observations: vide(l.observations), alertes_a_verifier: vide(l.alertes_a_verifier),
      criteres_obligatoires: OPTIONS.filter(o => /obligatoire/i.test(l[o] || '')).join(', ') || null,
      donnees: JSON.stringify(l),
    });
  });

  const bilan = { ok: true, simulation, lignes: lignes.length, lignes_physiques, fiches: 0, contacts: parContact.size,
    nouveaux_contacts: 0, contacts_mis_a_jour: 0, dans_la_file: 0, fiches_dans_la_file: 0, exclus: {}, erreurs,
    // Les contacts déjà travaillés que ce fichier sort de la file : à lire
    // avant d'enregistrer, un rappel convenu peut disparaître avec eux.
    sortis_de_la_file: [] };
  const ecrire = db.transaction(() => {
    const ficheDe = db.prepare('SELECT id_contact FROM acq_fiches WHERE id_fiche = ?');
    const existe = db.prepare(`SELECT id_contact, exclu_leve, statut, exclu, nom, prenom, rappel_le,
      EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = acq_contacts.id_contact) AS travaille FROM acq_contacts WHERE id_contact = ?`);
    const insC = db.prepare(`INSERT INTO acq_contacts (id_contact, civilite, nom, prenom, societe, email, tel_portable, tel_fixe,
        adresse, code_postal, commune, stop_tel, stop_mail, type_contact, suivi_par, madame_fichier, exclu,
        acheteur_vendeur, nb_notes, derniere_note_date, derniere_note_auteur, derniere_note_extrait)
      VALUES (@id_contact, @civilite, @nom, @prenom, @societe, @email, @tel_portable, @tel_fixe,
        @adresse, @code_postal, @commune, @stop_tel, @stop_mail, @type_contact, @suivi_par, @madame_fichier, @exclu,
        @acheteur_vendeur, @nb_notes, @derniere_note_date, @derniere_note_auteur, @derniere_note_extrait)`);
    // Mise à jour : les données Modelo, jamais le travail fait dans l'appli.
    // Un stop posé dans Modelo depuis s'applique ; un stop levé dans Modelo
    // ne lève pas celui posé ici.
    // `@garder` = 1 : la fiche a déjà été travaillée (un appel, ou un numéro
    // saisi pour la remettre dans la file). Ses coordonnées sont alors celles
    // que l'agent a vérifiées au téléphone : le fichier ne les écrase pas.
    const majC = db.prepare(`UPDATE acq_contacts SET civilite = COALESCE(@civilite, civilite), nom = @nom, prenom = @prenom,
        societe = @societe,
        email = CASE WHEN @garder = 1 THEN email ELSE @email END,
        tel_portable = CASE WHEN @garder = 1 THEN tel_portable ELSE @tel_portable END,
        tel_fixe = CASE WHEN @garder = 1 THEN tel_fixe ELSE @tel_fixe END,
        adresse = CASE WHEN @garder = 1 THEN adresse ELSE @adresse END,
        code_postal = CASE WHEN @garder = 1 THEN code_postal ELSE @code_postal END,
        commune = CASE WHEN @garder = 1 THEN commune ELSE @commune END,
        stop_tel = MAX(stop_tel, @stop_tel), stop_mail = MAX(stop_mail, @stop_mail),
        type_contact = @type_contact, suivi_par = @suivi_par, acheteur_vendeur = MAX(acheteur_vendeur, @acheteur_vendeur),
        nb_notes = @nb_notes, derniere_note_date = @derniere_note_date, derniere_note_auteur = @derniere_note_auteur,
        derniere_note_extrait = @derniere_note_extrait,
        exclu = CASE WHEN exclu_leve = 1 THEN exclu ELSE @exclu END,
        maj_import_le = datetime('now')
      WHERE id_contact = @id_contact`);
    const insF = db.prepare(`INSERT INTO acq_fiches (id_fiche, id_contact, ancien_conseiller, type_recherche, type_bien,
        budget_min, budget_max, surface_min, surface_max, pieces_min, chambres_min, localisation_mode, communes,
        codes_postaux, priorite, alerte_mail, modifiee_periode, precisions, observations, alertes_a_verifier,
        criteres_obligatoires, donnees)
      VALUES (@id_fiche, @id_contact, @ancien_conseiller, @type_recherche, @type_bien, @budget_min, @budget_max,
        @surface_min, @surface_max, @pieces_min, @chambres_min, @localisation_mode, @communes, @codes_postaux,
        @priorite, @alerte_mail, @modifiee_periode, @precisions, @observations, @alertes_a_verifier,
        @criteres_obligatoires, @donnees)
      ON CONFLICT(id_fiche) DO UPDATE SET ancien_conseiller = excluded.ancien_conseiller,
        type_recherche = excluded.type_recherche, type_bien = excluded.type_bien,
        budget_min = excluded.budget_min, budget_max = excluded.budget_max,
        surface_min = excluded.surface_min, surface_max = excluded.surface_max,
        pieces_min = excluded.pieces_min, chambres_min = excluded.chambres_min,
        localisation_mode = excluded.localisation_mode, communes = excluded.communes,
        codes_postaux = excluded.codes_postaux, priorite = excluded.priorite, alerte_mail = excluded.alerte_mail,
        modifiee_periode = excluded.modifiee_periode, precisions = excluded.precisions,
        observations = excluded.observations, alertes_a_verifier = excluded.alertes_a_verifier,
        criteres_obligatoires = excluded.criteres_obligatoires, donnees = excluded.donnees`);
    // Sorti de la mission par l'agence : il n'y revient pas, même si sa fiche
    // réapparaît active. Un motif calculé (stop, décès...) reste prioritaire.
    const horsMission = db.prepare('SELECT 1 FROM acq_hors_mission WHERE id_contact = ? AND leve_le IS NULL');
    for (const { contact, fiches } of parContact.values()) {
      const exclu = motifExclusion(contact, fiches, { doublons, suiveursRepris: repris })
        || (horsMission.get(contact.id_contact) ? 'HORS_MISSION' : null);
      bilan.fiches += fiches.length;
      if (exclu) bilan.exclus[exclu] = (bilan.exclus[exclu] || 0) + 1;
      else { bilan.dans_la_file++; bilan.fiches_dans_la_file += fiches.filter(f => sansAccent(f.type_recherche) !== 'location').length; }
      const ligne = { ...contact, madame_fichier: madameFichier, exclu };
      delete ligne.stop_brut;
      const deja = existe.get(contact.id_contact);
      if (deja) {
        bilan.contacts_mis_a_jour++;
        if (exclu && !deja.exclu && !deja.exclu_leve && deja.travaille)
          bilan.sortis_de_la_file.push({ id_contact: contact.id_contact, nom: deja.nom, prenom: deja.prenom, motif: LIBELLES_EXCLUSION[exclu] || exclu, rappel_le: deja.rappel_le || null });
        majC.run({ ...ligne, garder: deja.travaille || deja.exclu_leve ? 1 : 0 });
      } else { bilan.nouveaux_contacts++; insC.run(ligne); }
      for (const f of fiches) {
        // Une fiche déjà connue sous un autre contact : elle y reste (on ne
        // déplace pas le travail fait), et on le dit.
        const avant = ficheDe.get(f.id_fiche);
        if (avant && avant.id_contact !== f.id_contact) { erreurs.push(`Fiche ${f.id_fiche} : présentée sous le contact ${f.id_contact}, déjà rattachée au contact ${avant.id_contact}. Non déplacée.`); continue; }
        insF.run(f);
      }
    }
    if (simulation) throw new Error('__simulation__');
  });
  try { ecrire(); } catch (e) { if (e.message !== '__simulation__') throw e; }
  bilan.exclus_libelles = Object.fromEntries(Object.entries(bilan.exclus).map(([k, v]) => [LIBELLES_EXCLUSION[k] || k, v]));
  return bilan;
}

module.exports = { importer, lire, motifExclusion, LIBELLES_EXCLUSION, sansAccent };
