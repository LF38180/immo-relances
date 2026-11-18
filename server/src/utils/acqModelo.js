// Report du Fichier Acquéreurs vers Modelo : le fichier qu'Exploration Modelo
// applique, une ligne par fiche acquéreur, au format qu'il a demandé le 18/11.
//
// Une note saisie sur une fiche est la même que celle du contact (vérifié par
// Exploration Modelo) : la note n'est donc écrite qu'UNE fois par contact, sur
// sa première ligne.
const { db } = require('../database');
const A = require('./acqRegles');

const PREFIXE = '[MADAME FICHIER ACQ 2026]';
const TYPE_NOTE = 'Appel téléphonique';
const STATUTS_ARCHIVANT = ['ABANDONNE', 'DEJA_ACHETE', 'DECEDE', 'NE_PLUS_CONTACTER'];
const LIB_STATUT = { REQUALIFIE: 'requalifié', A_RAPPELER: 'à rappeler', EN_PAUSE: 'projet en pause',
  ABANDONNE: 'projet abandonné', DEJA_ACHETE: 'a déjà acheté', SANS_REPONSE: 'sans réponse après 4 tentatives',
  NE_PLUS_CONTACTER: 'ne souhaite plus être contacté', ERREUR_IDENTITE: 'erreur d’identité', DECEDE: 'décédé',
  FAUX_NUMERO: 'faux numéro' };
const LIB_ISSUE = { REPONDEUR: 'répondeur', PAS_DE_REPONSE: 'pas de réponse', FAUX_NUMERO: 'faux numéro' };

const jj = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 && !/Z$/.test(s) && s.includes(':') ? 'Z' : ''));
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const json = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const initiales = (nom) => String(nom || '').split(/\s+/).map(x => x[0] || '').join('').toUpperCase();

// Le bloc « Précisions sur la recherche » (cahier, section 7). Les anciennes
// précisions sont gardées en dessous : rien de ce que Modelo savait n'est perdu.
function blocPrecisions(fiche, contact, appel) {
  const p = json(fiche.requalif);
  const v = json(appel?.details).vendre || {};
  const crit = (niv) => (p.criteres || []).filter(c => c.niveau === niv).map(c => c.valeur ? `${c.critere} : ${c.valeur}` : c.critere).join(', ');
  const FIN = { ACCORD: 'accord de principe', SIMULATION: 'simulation faite', COMPTANT: 'comptant', EN_COURS: 'en cours', NON: 'non validé' };
  const lignes = ['━━━ LE PROJET ━━━',
    `PROJET : ${[p.type_achat, p.motivation && ('par ' + p.motivation.toLowerCase()), p.motivation_texte].filter(Boolean).join(' — ')}`,
    `URGENCE : ${[p.urgence && `${p.urgence}/10`, p.passer_a_10 && `passerait à 10 si : ${p.passer_a_10}`, p.date_emmenagement && `emménagement ${p.date_emmenagement}`].filter(Boolean).join(' — ')}`,
    `SITUATION : ${[v.statut_logement && v.statut_logement.toLowerCase(), v.depuis && `depuis ${v.depuis}`, v.doit_vendre && `doit vendre : ${v.doit_vendre.toLowerCase()}`, v.etat_revente && `revente : ${v.etat_revente.toLowerCase().replace(/_/g, ' ')}`].filter(Boolean).join(' — ')}`,
    `FINANCEMENT : ${[p.mode_financement, FIN[p.financement_valide], p.financement_nom, p.financement_date, p.financement_montant && `${Number(p.financement_montant).toLocaleString('fr-FR')} €`, p.apport && `apport ${Number(p.apport).toLocaleString('fr-FR')} €`, p.apport_revente && `dont revente ${Number(p.apport_revente).toLocaleString('fr-FR')} €`, p.mensualite && `mensualité ${p.mensualite} €`, p.banque_ou_courtier].filter(Boolean).join(' — ')}`,
    `DÉCIDEURS : ${p.decideurs || ''}`,
    `IMPORTANT : ${crit('IMPORTANT')}`,
    `OPTIONNEL : ${crit('OPTIONNEL')}`,
    `RÉDHIBITOIRES : ${crit('REDHIBITOIRE')}`,
    `SECTEURS : ${Array.isArray(p.secteurs) ? p.secteurs.join(', ') : (p.secteurs || '')}`,
    `DÉJÀ VU : ${p.deja_vu || ''}`,
    `MAJ : ${jj(appel?.horodatage)} ${initiales(appel?.madame_fichier)}`];
  if (fiche.precisions) lignes.push('', '─── Précisions précédentes ───', fiche.precisions);
  return lignes.join('\n');
}

// La note d'appel, une par contact : toutes les tentatives et l'appel abouti
// depuis le dernier report.
function noteContact(contact, appels) {
  const tent = appels.filter(a => LIB_ISSUE[a.issue]).map(a => `${jj(a.horodatage).slice(0, 5)} ${a.canal === 'SMS' ? 'SMS envoyé' : a.canal === 'MAIL' ? 'mail envoyé' : LIB_ISSUE[a.issue]}`);
  const fin = [...appels].reverse().find(a => a.statut_final);
  const morceaux = [PREFIXE];
  if (tent.length) morceaux.push(`Tentatives : ${tent.join(', ')}.`);
  if (fin) {
    const d = json(fin.details);
    morceaux.push(`Appel du ${jj(fin.horodatage)} : ${LIB_STATUT[fin.statut_final] || fin.statut_final}.`);
    if (fin.prochaine_action) morceaux.push(`Prochaine action : ${fin.prochaine_action}${fin.date_prochaine_action ? ' le ' + jj(fin.date_prochaine_action) : ''}.`);
    const anc = Object.entries(d.coordonnees || {}).filter(([, c]) => ['MODIFIE', 'A_SUPPRIMER'].includes(c.etat) && c.avant)
      .map(([k, c]) => `${k.replace('_', ' ')} : ${typeof c.avant === 'object' ? Object.values(c.avant).filter(Boolean).join(' ') : c.avant}`);
    if (anc.length) morceaux.push(`Anciennes coordonnées : ${anc.join(' ; ')}.`);
    if (d.marine?.proposee) morceaux.push(`Rendez-vous courtage proposé${d.marine.accord ? ', client d’accord' : ''}.`);
    if (d.vendre?.estimation_proposee) morceaux.push(`Estimation proposée${d.vendre.estimation_acceptee ? `, acceptée${d.vendre.date_rdv_estimation ? ' (rdv le ' + jj(d.vendre.date_rdv_estimation) + ')' : ''}` : ''}.`);
    if (d.consentement_rappel) morceaux.push('Accepte d’être rappelé.');
    if (fin.notes) morceaux.push(fin.notes);
  } else if (!tent.length) return null;
  else morceaux.splice(1, 0, 'Non joint.');
  return morceaux.join(' ');
}

const COLONNES = ['id_contact', 'id_fiche', 'nom', 'prenom', 'agent', 'date_note', 'type_note', 'note_contact',
  'stop_tel', 'stop_mail',
  'tel_portable_avant', 'tel_portable_apres', 'tel_fixe_avant', 'tel_fixe_apres', 'email_avant', 'email_apres',
  'adresse_avant', 'adresse_apres',
  'type_bien_apres', 'budget_min_apres', 'budget_max_avant', 'budget_max_apres', 'surface_min_apres',
  'pieces_min_apres', 'chambres_min_apres', 'priorite_apres', 'criteres_obligatoires_apres', 'precisions_apres',
  'nego_contact_cible', 'nego_fiche_cible', 'alerte_mail', 'archiver_fiche', 'commentaire_fiche', 'fusion_dans',
  'type_contact_ajout', 'a_proposer_a_loick', 'jusqu_a'];

// Les fiches dont l'archivage attend la validation de Loïck ou Thomas.
function archivagesEnAttente() {
  return db.prepare(`SELECT f.*, c.nom, c.prenom, c.statut AS statut_contact FROM acq_fiches f
    JOIN acq_contacts c ON c.id_contact = f.id_contact
    WHERE f.archivage_valide IS NULL
      AND (f.decision IN ('ARCHIVER','FUSIONNER') OR c.statut IN (${STATUTS_ARCHIVANT.map(() => '?').join(',')}))
    ORDER BY c.nom, c.prenom`).all(...STATUTS_ARCHIVANT);
}

function aReporter() {
  return db.prepare(`SELECT c.* FROM acq_contacts c
    WHERE EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact
      AND a.horodatage > COALESCE(c.modelo_reporte_le, ''))
    ORDER BY c.nom, c.prenom`).all();
}

function lignesReport(jusquA) {
  const lignes = [];
  for (const c of aReporter()) {
    const appels = db.prepare(`SELECT * FROM acq_appels WHERE id_contact = ? AND horodatage > COALESCE(?, '') AND horodatage <= ?
      ORDER BY horodatage`).all(c.id_contact, c.modelo_reporte_le, jusquA);
    if (!appels.length) continue;
    const fin = [...appels].reverse().find(a => a.statut_final);
    const d = json(fin?.details);
    const co = d.coordonnees || {};
    const note = noteContact(c, appels);
    const requal = c.statut === 'REQUALIFIE';
    const archiveTout = STATUTS_ARCHIVANT.includes(c.statut);
    const vendeur = d.vendre?.doit_vendre === 'OUI' && !/vendeur/i.test(c.type_contact || '');
    const fiches = db.prepare('SELECT * FROM acq_fiches WHERE id_contact = ? ORDER BY id_fiche').all(c.id_contact);
    const av = (k) => { const x = co[k]; return x && ['MODIFIE', 'A_SUPPRIMER'].includes(x.etat) ? (typeof x.avant === 'object' ? Object.values(x.avant || {}).filter(Boolean).join(' ') : x.avant || '') : ''; };
    const ap = (k) => { const x = co[k]; if (!x) return ''; if (x.etat === 'A_SUPPRIMER') return '(supprimer)';
      return ['MODIFIE', 'AJOUTE'].includes(x.etat) ? (typeof x.apres === 'object' ? [x.apres.adresse, x.apres.code_postal, x.apres.commune].filter(Boolean).join(' ') : x.apres || '') : ''; };
    fiches.forEach((f, i) => {
      const p = json(f.requalif);
      const garde = f.decision === 'GARDER' && fin && appels.some(a => a.statut_final);
      const archiver = (f.decision === 'ARCHIVER' || f.decision === 'FUSIONNER' || archiveTout) && f.archivage_valide === 1;
      const motif = f.decision === 'FUSIONNER' ? `doublon de la recherche n° ${f.fusion_dans}, conservée et mise à jour`
        : f.decision === 'ARCHIVER' ? (f.motif_archivage || 'projet ancien')
        : archiveTout ? LIB_STATUT[c.statut] : '';
      lignes.push({
        id_contact: c.id_contact, id_fiche: f.id_fiche, nom: c.nom || '', prenom: c.prenom || '',
        agent: fin?.madame_fichier || appels[appels.length - 1].madame_fichier, date_note: jj((fin || appels[appels.length - 1]).horodatage),
        type_note: TYPE_NOTE, note_contact: i === 0 ? (note || '') : '',
        stop_tel: i === 0 && c.statut === 'NE_PLUS_CONTACTER' ? 'OUI' : '', stop_mail: '',
        tel_portable_avant: i === 0 ? av('tel_portable') : '', tel_portable_apres: i === 0 ? ap('tel_portable') : '',
        tel_fixe_avant: i === 0 ? av('tel_fixe') : '', tel_fixe_apres: i === 0 ? ap('tel_fixe') : '',
        email_avant: i === 0 ? av('email') : '', email_apres: i === 0 ? ap('email') : '',
        adresse_avant: i === 0 ? av('adresse') : '', adresse_apres: i === 0 ? ap('adresse') : '',
        type_bien_apres: garde ? (p.type_bien || '') : '',
        budget_min_apres: garde && p.budget_min ? String(p.budget_min) : '',
        budget_max_avant: garde && f.budget_max ? String(f.budget_max) : '',
        budget_max_apres: garde && p.budget_max ? String(A.budgetModelo(p.budget_max)) : '',
        surface_min_apres: garde && p.surface_min ? String(p.surface_min) : '',
        pieces_min_apres: garde && p.pieces ? String(p.pieces) : '',
        chambres_min_apres: garde && p.chambres ? String(p.chambres) : '',
        priorite_apres: garde ? (A.prioriteModelo(p.urgence) || '') : '',
        criteres_obligatoires_apres: garde ? (p.criteres || []).filter(x => x.niveau === 'INDISPENSABLE').map(x => x.valeur ? `${x.critere} : ${x.valeur}` : x.critere).join(', ') : '',
        precisions_apres: garde ? blocPrecisions(f, c, fin) : '',
        nego_contact_cible: i === 0 && requal ? fin.madame_fichier : '',
        nego_fiche_cible: requal && garde ? fin.madame_fichier : '',
        alerte_mail: garde ? (requal ? 'oui' : c.statut === 'EN_PAUSE' ? 'non' : '') : (archiver ? 'non' : ''),
        archiver_fiche: archiver ? 'oui' : '',
        commentaire_fiche: archiver ? `${PREFIXE} Fiche archivée le ${jj(f.decision_le || fin?.horodatage)} par ${fin?.madame_fichier || ''} : ${motif}.` : '',
        fusion_dans: archiver && f.decision === 'FUSIONNER' ? (f.fusion_dans || '') : '',
        type_contact_ajout: i === 0 && vendeur ? 'Vendeur' : '',
        a_proposer_a_loick: i === 0 && vendeur ? 'oui' : '',
        jusqu_a: jusquA,
      });
    });
  }
  return lignes;
}

const cellule = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const enCsv = (lignes) => '﻿' + [COLONNES.join(';'), ...lignes.map(l => COLONNES.map(k => cellule(l[k])).join(';'))].join('\r\n');

module.exports = { blocPrecisions, noteContact, lignesReport, enCsv, archivagesEnAttente, aReporter, COLONNES,
  STATUTS_ARCHIVANT, LIB_STATUT, PREFIXE };
