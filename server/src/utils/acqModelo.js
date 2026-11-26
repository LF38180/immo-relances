// Report du Fichier Acquéreurs vers Modelo : le fichier qu'Exploration Modelo
// applique, une ligne par fiche acquéreur, au format qu'il a demandé le 18/11.
//
// Une note saisie sur une fiche est la même que celle du contact (vérifié par
// Exploration Modelo) : la note n'est donc écrite qu'UNE fois par contact, sur
// sa première ligne.
const { db } = require('../database');
const A = require('./acqRegles');
const Z = require('./acqZones');

const PREFIXE = '[MISSION ACQUÉREURS 2026]';
const TYPE_NOTE = 'Appel téléphonique';
const STATUTS_ARCHIVANT = ['ABANDONNE', 'DEJA_ACHETE', 'DECEDE', 'NE_PLUS_CONTACTER'];
const LIB_STATUT = { REQUALIFIE: 'requalifié', A_RAPPELER: 'à rappeler', EN_PAUSE: 'projet en pause',
  ABANDONNE: 'projet abandonné', DEJA_ACHETE: 'a déjà acheté', SANS_REPONSE: 'sans réponse après 4 tentatives',
  NE_PLUS_CONTACTER: 'ne souhaite plus être contacté', ERREUR_IDENTITE: 'erreur d’identité', DECEDE: 'décédé',
  FAUX_NUMERO: 'faux numéro' };
const LIB_ISSUE = { REPONDEUR: 'répondeur', PAS_DE_REPONSE: 'pas de réponse', FAUX_NUMERO: 'faux numéro' };

// Le mandat de recherche, en clair : « accepté le 20/11 (exclusif) ».
const TYPE_MANDAT = { SIMPLE: 'simple', EXCLUSIF: 'exclusif', NON_PRECISE: 'à préciser' };
function texteMandat(m) {
  if (!m) return null;
  const jour = (d) => (d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) : '');
  if (m.etat === 'ACCEPTE') return `accepté le ${jour(m.date_acceptation)} (${TYPE_MANDAT[m.type] || 'à préciser'})${m.rdv_signature ? `, signature le ${jjh(m.rdv_signature)}` : ', rendez-vous de signature à fixer'}`;
  if (m.etat === 'REFUSE') return `refusé${m.motif_refus ? ` (${m.motif_refus})` : ''}`;
  if (m.etat === 'A_REPROPOSER') return 'à reproposer';
  return 'proposé';
}

const jj = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 && !/Z$/.test(s) && s.includes(':') ? 'Z' : ''));
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
// Une date saisie à l'écran (« 2026-11-20T15:30 », heure de Paris) : on la
// recopie telle quelle, sans conversion — passer par jj() la traitait comme
// de l'UTC et perdait l'heure du rendez-vous.
const jjh = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` à ${m[4]} h ${m[5]}` : ''}` : jj(s); };
const json = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

// Tout ce que les appels aboutis d'un lot ont appris, fusionné : le plus
// récent gagne champ par champ. Avant, seul le DERNIER appel était lu — un
// numéro corrigé lundi disparaissait du report si la personne était
// requalifiée mercredi (constat de la table ronde du 18/11).
function fusionDetails(appels) {
  const f = { coordonnees: {}, vendre: {}, marine: {}, mandat: null, stop_mail: false, consentement_rappel: false, achat: null };
  for (const a of appels.filter(x => x.statut_final)) {
    const d = json(a.details);
    for (const [k, x] of Object.entries(d.coordonnees || {})) {
      if (!x || !x.etat) continue;
      const prec = f.coordonnees[k];
      // « Confirmé » après une modification du même lot ne l'efface pas ; et
      // l'« avant » reste celui d'avant le lot (ce que Modelo connaît).
      if (prec && ['MODIFIE', 'AJOUTE', 'A_SUPPRIMER'].includes(prec.etat) && ['CONFIRME', 'SANS'].includes(x.etat)) continue;
      f.coordonnees[k] = prec && ['MODIFIE', 'AJOUTE', 'A_SUPPRIMER'].includes(prec.etat) ? { ...x, avant: prec.avant, etat: prec.etat === 'AJOUTE' && x.etat === 'MODIFIE' ? 'AJOUTE' : x.etat } : x;
    }
    Object.assign(f.vendre, Object.fromEntries(Object.entries(d.vendre || {}).filter(([, v]) => v != null && v !== '')));
    Object.assign(f.marine, Object.fromEntries(Object.entries(d.marine || {}).filter(([, v]) => v)));
    if (d.mandat) f.mandat = d.mandat;
    if (d.stop_mail) f.stop_mail = true;
    if (d.consentement_rappel) f.consentement_rappel = true;
    if (d.achat) f.achat = d.achat;
  }
  // « Doit vendre » n'a de sens que pour un propriétaire.
  if (f.vendre.statut_logement && f.vendre.statut_logement !== 'PROPRIETAIRE') { delete f.vendre.doit_vendre; delete f.vendre.etat_revente; }
  return f;
}
const initiales = (nom) => String(nom || '').split(/\s+/).map(x => x[0] || '').join('').toUpperCase();

// Les codes de l'écran, en français lisible pour Modelo.
const LOGEMENT = { PROPRIETAIRE: 'propriétaire', LOCATAIRE: 'locataire', HEBERGE: 'hébergé' };
const REVENTE = { PAS_SORTIE: 'pas encore lancée', ESTIMEE: 'estimée', EN_VENTE: 'en vente', SOUS_OFFRE: 'sous offre',
  SOUS_COMPROMIS: 'sous compromis', PRET_RELAIS: 'prêt relais' };
const ACHAT = { RP: 'résidence principale', RS: 'résidence secondaire', INVESTISSEMENT: 'investissement' };
const MOTIF = { ENVIE: 'envie', OBLIGATION: 'obligation', OPPORTUNITE: 'opportunité' };

// Le bloc « Précisions sur la recherche » (cahier, section 7). Les anciennes
// précisions sont gardées en dessous : rien de ce que Modelo savait n'est perdu.
function blocPrecisions(fiche, contact, appel, fusion = null) {
  const p = json(fiche.requalif);
  const det = fusion || json(appel?.details);
  const v = det.vendre || {};
  const crit = (niv) => (p.criteres || []).filter(c => c.niveau === niv).map(c => c.valeur ? `${c.critere} : ${c.valeur}` : c.critere).join(', ');
  const FIN = { ACCORD: 'accord de principe', SIMULATION: 'simulation faite', COMPTANT: 'comptant', EN_COURS: 'en cours', NON: 'non validé' };
  const lignes = ['━━━ LE PROJET ━━━',
    `PROJET : ${[ACHAT[p.type_achat] || p.type_achat, p.motivation && ('par ' + (MOTIF[p.motivation] || p.motivation.toLowerCase())), p.motivation_texte, p.recherche_depuis && `cherche depuis ${p.recherche_depuis}`].filter(Boolean).join(' — ')}`,
    `URGENCE : ${[p.urgence && `${p.urgence}/10`, p.passer_a_10 && `passerait à 10 si : ${p.passer_a_10}`, p.date_emmenagement && `emménagement ${p.date_emmenagement}`].filter(Boolean).join(' — ')}`,
    `SITUATION : ${[LOGEMENT[v.statut_logement], v.depuis && `depuis ${v.depuis}`, v.doit_vendre && `doit vendre : ${v.doit_vendre.toLowerCase()}`, v.etat_revente && `revente : ${REVENTE[v.etat_revente] || v.etat_revente}`, v.doit_vendre === 'OUI' && v.adresse_bien_a_vendre && `bien à vendre : ${v.adresse_bien_a_vendre}`].filter(Boolean).join(' — ')}`,
    `FINANCEMENT : ${[p.mode_financement, FIN[p.financement_valide], p.financement_par && `par ${p.financement_par}`, p.financement_nom, p.financement_date, p.financement_montant && `${Number(p.financement_montant).toLocaleString('fr-FR')} €`, p.apport && `apport ${Number(p.apport).toLocaleString('fr-FR')} €`, p.apport_revente && `dont revente ${Number(p.apport_revente).toLocaleString('fr-FR')} €`, p.mensualite && `mensualité ${p.mensualite} €`, p.banque_ou_courtier, p.origine_fonds && `origine des fonds : ${p.origine_fonds}`].filter(Boolean).join(' — ')}`,
    `DÉCIDEURS : ${p.decideurs || ''}`,
    `IMPORTANT : ${crit('IMPORTANT')}`,
    `OPTIONNEL : ${crit('OPTIONNEL')}`,
    `RÉDHIBITOIRES : ${crit('REDHIBITOIRE')}`,
    // Ce que l'appelante a noté librement sous la liste des critères.
    `AUTRES CRITÈRES : ${String(p.criteres_libre || '').replace(/\s*\n+\s*/g, ' ; ').trim()}`,
    // Les quartiers de Grenoble en clair : c'est ce qu'un humain lira dans la fiche.
    `SECTEURS : ${Z.localisation({ secteurs: p.secteurs, quartiers: p.quartiers_grenoble }).texte}`,
    `DÉJÀ VU : ${p.deja_vu || ''}`,
    ...(det.mandat ? [`MANDAT DE RECHERCHE : ${texteMandat(det.mandat)}`] : []),
    `MAJ : ${jj(appel?.horodatage)} ${initiales(appel?.madame_fichier)}`]
    // Une rubrique sans rien derrière ses deux-points n'apprend rien à qui
    // lit la fiche dans Modelo : on ne l'écrit pas.
    .filter(l => !/^[^:━]+ : ?$/.test(l));
  if (fiche.precisions) lignes.push('', '─── Précisions précédentes ───', fiche.precisions);
  return lignes.join('\n');
}

// La note d'appel, une par contact : toutes les tentatives et l'appel abouti
// depuis le dernier report.
function noteContact(contact, appels, fiches = []) {
  // Comme pour l'opération : les appels dans le vide sur une ligne, chaque SMS
  // ou mail dans une phrase à part, avec son texte s'il a été noté.
  const tent = appels.filter(a => LIB_ISSUE[a.issue] && a.canal === 'APPEL').map(a => `${jj(a.horodatage).slice(0, 5)} ${LIB_ISSUE[a.issue]}`);
  // Un SMS « dans la foulée » d'un répondeur est rangé dans le même appel.
  const messages = appels.filter(a => a.canal !== 'APPEL' || json(a.details).sms).map(a => { const t = json(a.details).texte;
    return `${a.canal === 'MAIL' ? 'Mail' : 'SMS'} envoyé le ${jj(a.horodatage).slice(0, 5)}${t ? ` : « ${t} »` : ''}.`; });
  const aboutis = appels.filter(a => a.statut_final);
  const fin = aboutis[aboutis.length - 1];
  const morceaux = [PREFIXE];
  if (tent.length) morceaux.push(`Tentatives : ${tent.join(', ')}.`);
  morceaux.push(...messages);
  if (fin) {
    const d = fusionDetails(appels);
    // Les appels aboutis d'avant, dans le même lot : une ligne chacun.
    for (const a of aboutis.slice(0, -1)) morceaux.push(`Appel du ${jj(a.horodatage)} : ${LIB_STATUT[a.statut_final] || a.statut_final}.${a.notes ? ' ' + a.notes : ''}`);
    morceaux.push(`Appel du ${jj(fin.horodatage)} : ${LIB_STATUT[fin.statut_final] || fin.statut_final}.`);
    if (fin.prochaine_action) morceaux.push(`Prochaine action : ${fin.prochaine_action}${fin.date_prochaine_action ? ' le ' + jjh(fin.date_prochaine_action) : ''}.`);
    const achats = [d.achat, ...fiches.map(f => json(f.requalif).achete_ou_chez_qui)].filter(Boolean);
    if (achats.length) morceaux.push(`A acheté : ${[...new Set(achats)].join(' ; ')}.`);
    const anc = Object.entries(d.coordonnees || {}).filter(([, c]) => ['MODIFIE', 'A_SUPPRIMER'].includes(c.etat) && c.avant)
      .map(([k, c]) => `${k.replace('_', ' ')} : ${typeof c.avant === 'object' ? Object.values(c.avant).filter(Boolean).join(' ') : c.avant}`);
    if (anc.length) morceaux.push(`Anciennes coordonnées : ${anc.join(' ; ')}.`);
    if (d.coordonnees?.adresse?.etat === 'A_SUPPRIMER') morceaux.push('Adresse postale fausse (NPAI).');
    if (d.stop_mail) morceaux.push('Ne veut plus recevoir de mails.');
    if (d.marine?.proposee) morceaux.push(`Rendez-vous courtage proposé${d.marine.accord ? ', client d’accord' : ''}.`);
    if (d.vendre?.estimation_proposee) morceaux.push(`Estimation proposée${d.vendre.estimation_acceptee ? `, acceptée${d.vendre.date_rdv_estimation ? ' (rdv le ' + jjh(d.vendre.date_rdv_estimation) + ')' : ''}` : ''}.`);
    if (d.mandat) morceaux.push(`Mandat de recherche ${texteMandat(d.mandat)}.`);
    // Un projet saisi à l'appel et absent de Modelo : décrit ici, pour qu'il
    // soit lisible dans Modelo même avant la création de sa fiche.
    for (const f of fiches.filter(x => aCreer(x) && x.decision === 'GARDER')) morceaux.push(`Nouveau projet d’achat, en plus : ${resumeNouveau(f)}.`);
    if (fin.notes) morceaux.push(fin.notes);
  } else if (!tent.length && !messages.length) return null;
  else morceaux.splice(1, 0, 'Non joint.');
  return morceaux.join(' ');
}

// « Maison ou appartement » part sous le libellé du type Modelo, « Appartement/Maison »
// (un seul type par fiche de recherche dans Modelo, cette valeur couvre les deux).
// Les libellés de Modelo (liste donnée par Exploration Modelo le 26/11/2026) :
// Appartement, Maison, Appartement/Maison, Immeuble, Terrain, Immobilier Pro,
// Fonds de commerce, Stationnement, Droit au Bail, Programme immobilier.
// « Parking » s'y appelle « Stationnement ». « Autre » n'y existe pas : on
// n'envoie alors aucun type, Modelo garde le sien et le reste de la ligne passe
// (décision de Loïck). Tout autre libellé part tel quel.
const typeBienModelo = (t) => { const v = String(t || '').trim();
  if (/^(maison ou appartement|appartement\s*\/\s*maison|maison\s*\/\s*appartement)$/i.test(v)) return 'Appartement/Maison';
  if (/^(parking|stationnement)$/i.test(v)) return 'Stationnement';
  if (/^autre$/i.test(v)) return '';
  return v; };
const COLONNES = ['id_contact', 'id_fiche', 'nom', 'prenom', 'agent', 'date_note', 'type_note', 'commentaire',
  'stop_tel', 'stop_mail',
  'tel_portable_avant', 'tel_portable_apres', 'tel_fixe_avant', 'tel_fixe_apres', 'email_avant', 'email_apres',
  'adresse_avant', 'adresse_apres',
  'type_bien_apres', 'budget_min_apres', 'budget_max_avant', 'budget_max_apres', 'surface_min_apres',
  'pieces_min_apres', 'chambres_min_apres', 'secteurs_avant', 'secteurs_apres', 'priorite_avant', 'priorite_apres',
  'criteres_obligatoires_apres', 'precisions_apres',
  'nego_contact_cible', 'nego_fiche_cible', 'alerte_mail', 'archiver_fiche', 'commentaire_fiche', 'fusion_dans',
  'type_contact_ajout', 'a_proposer_a_loick', 'jusqu_a',
  // À remplir par Exploration Modelo, puis réimporter : « reporté » ou « échec ».
  'statut', 'motif_echec',
  // Zones à tracer sur la carte de Modelo (quartiers de Grenoble). Ajoutée le
  // 20/11/2026 tout à la fin : aucune colonne existante ne change de place.
  'zones_apres',
  // Création d'une recherche (26/11/2026), tout à la fin elles aussi.
  'creer_fiche', 'ref_creation'];

// Un nouveau projet saisi à l'appel, pas encore créé dans Modelo (26/11/2026).
// Exploration Modelo a confirmé le 26/11 qu'il crée la recherche et rend son
// numéro (essai ZZTEST, fiche 16049). Le projet part donc sur une ligne à part :
// `id_fiche` vide, `creer_fiche` = oui, `ref_creation` = notre identifiant
// provisoire, toujours le même d'un report à l'autre (c'est par lui
// qu'Exploration évite de créer deux fois). Au retour, le numéro rendu dans
// `id_fiche` est rangé dans `id_modelo_cree`. Tant qu'il n'est pas revenu, la
// ligne repart à chaque report. ACQ_ENVOI_CREATIONS=0 referme l'envoi.
const ENVOI_CREATIONS = process.env.ACQ_ENVOI_CREATIONS !== '0';
// Le numéro Modelo d'une recherche : le sien, ou celui rendu après sa création.
const idModelo = (f) => f.id_modelo_cree || f.id_fiche;
const aCreer = (f) => f.creee_appli === 1 && !f.id_modelo_cree;
const resumeNouveau = (f) => { const p = json(f.requalif);
  const bien = typeBienModelo(p.type_bien || f.type_bien) === 'Appartement/Maison' ? 'maison ou appartement' : (p.type_bien || f.type_bien || '');
  const secteurs = Array.isArray(p.secteurs) ? p.secteurs.join(', ') : (p.secteurs || '');
  const eur = (n) => Number(n) > 0 ? Math.round(Number(n)).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €' : '';
  return [bien, eur(p.budget_max) && `budget ${eur(p.budget_max)}`, p.surface_min && `${p.surface_min} m² minimum`, secteurs && `secteur ${secteurs}`].filter(Boolean).join(', '); };
function creationsEnAttente() {
  return db.prepare(`SELECT f.id_fiche, f.id_contact, f.type_bien, f.requalif, f.creee_le, f.creee_par, c.nom, c.prenom FROM acq_fiches f
    JOIN acq_contacts c ON c.id_contact = f.id_contact
    WHERE f.creee_appli = 1 AND f.id_modelo_cree IS NULL AND f.decision = 'GARDER' ORDER BY f.creee_le`).all()
    .map(f => ({ id_fiche: f.id_fiche, id_contact: f.id_contact, nom: f.nom, prenom: f.prenom, creee_le: f.creee_le, creee_par: f.creee_par, resume: resumeNouveau(f) }));
}

// Les fiches dont l'archivage attend la validation de Loïck ou Thomas.
function archivagesEnAttente() {
  return db.prepare(`SELECT f.*, c.nom, c.prenom, c.statut AS statut_contact FROM acq_fiches f
    JOIN acq_contacts c ON c.id_contact = f.id_contact
    WHERE f.archivage_valide IS NULL
      AND NOT (f.creee_appli = 1 AND f.id_modelo_cree IS NULL)
      AND NOT EXISTS (SELECT 1 FROM acq_hors_mission h WHERE h.id_contact = c.id_contact AND h.leve_le IS NULL AND h.reporter_appels = 0)
      AND (f.decision IN ('ARCHIVER','FUSIONNER') OR c.statut IN (${STATUTS_ARCHIVANT.map(() => '?').join(',')}))
    ORDER BY c.nom, c.prenom`).all(...STATUTS_ARCHIVANT);
}

function aReporter() {
  return db.prepare(`SELECT c.* FROM acq_contacts c
    WHERE (EXISTS (SELECT 1 FROM acq_appels a WHERE a.id_contact = c.id_contact
      AND a.horodatage > COALESCE(c.modelo_reporte_le, ''))
      -- Un projet saisi à l'appel attend sa création dans Modelo : le contact
      -- reste à reporter tant que le numéro n'est pas revenu.
      ${ENVOI_CREATIONS ? "OR EXISTS (SELECT 1 FROM acq_fiches f WHERE f.id_contact = c.id_contact AND f.creee_appli = 1 AND f.id_modelo_cree IS NULL AND f.decision = 'GARDER')" : ''})
      -- Sorti hors mission par fichier : Modelo est déjà à jour, plus aucune ligne de
      -- report. Sorti d'office (autre mission) : les appels déjà passés partent.
      AND NOT EXISTS (SELECT 1 FROM acq_hors_mission h WHERE h.id_contact = c.id_contact AND h.leve_le IS NULL AND h.reporter_appels = 0)
    ORDER BY c.nom, c.prenom`).all();
}

function lignesReport(jusquA) {
  const lignes = [];
  const sortisDOffice = new Set(db.prepare('SELECT id_contact FROM acq_hors_mission WHERE leve_le IS NULL AND reporter_appels = 1').all().map(x => x.id_contact));
  for (const c of aReporter()) {
    const appels = db.prepare(`SELECT * FROM acq_appels WHERE id_contact = ? AND horodatage > COALESCE(?, '') AND horodatage <= ?
      ORDER BY horodatage`).all(c.id_contact, c.modelo_reporte_le, jusquA);
    if (!appels.length) {
      // Plus aucun appel à reporter, mais un projet attend sa création : sa
      // ligne seule, sans note (la note est déjà partie avec l'appel).
      if (ENVOI_CREATIONS) for (const f of db.prepare("SELECT * FROM acq_fiches WHERE id_contact = ? AND creee_appli = 1 AND id_modelo_cree IS NULL AND decision = 'GARDER' ORDER BY id_fiche").all(c.id_contact))
        lignes.push(ligneCreation(c, f, jusquA));
      continue;
    }
    const fin = [...appels].reverse().find(a => a.statut_final);
    const d = fusionDetails(appels);
    const co = d.coordonnees || {};
    const toutes = db.prepare('SELECT * FROM acq_fiches WHERE id_contact = ? ORDER BY id_fiche').all(c.id_contact);
    // Les projets à créer n'ont pas de ligne tant que l'envoi n'est pas ouvert.
    // Les projets à créer ont leur propre ligne, ajoutée après celles des recherches.
    const fiches = toutes.filter(f => !aCreer(f));
    const note = noteContact(c, appels, toutes);
    // La réattribution et la mise à jour des fiches ne partent que si CE lot
    // contient l'appel abouti : après un report, une simple tentative sur un
    // contact requalifié ne donne qu'une note (et `fin` n'existe pas).
    const requal = c.statut === 'REQUALIFIE' && !!fin;
    // Sortie d'office : la personne reste au conseiller de l'autre mission.
    // Sa note et la mise à jour de sa recherche partent, pas la réattribution.
    const resteAilleurs = sortisDOffice.has(c.id_contact);
    const archiveTout = STATUTS_ARCHIVANT.includes(c.statut);
    const vendeur = !!fin && d.vendre?.doit_vendre === 'OUI' && !/vendeur/i.test(c.type_contact || '');
    const av = (k) => { const x = co[k]; return x && ['MODIFIE', 'A_SUPPRIMER'].includes(x.etat) ? (typeof x.avant === 'object' ? Object.values(x.avant || {}).filter(Boolean).join(' ') : x.avant || '') : ''; };
    // Une adresse « à supprimer » est une adresse fausse : NPAI, comme dans
    // l'opération anciens clients.
    const ap = (k) => { const x = co[k]; if (!x) return ''; if (x.etat === 'A_SUPPRIMER') return k === 'adresse' ? '(NPAI : adresse fausse)' : '(supprimer)';
      return ['MODIFIE', 'AJOUTE'].includes(x.etat) ? (typeof x.apres === 'object' ? [x.apres.adresse, x.apres.code_postal, x.apres.commune].filter(Boolean).join(' ') : x.apres || '') : ''; };
    fiches.forEach((f, i) => {
      const p = json(f.requalif);
      // Une recherche « gardée » chez une personne dont le statut archive tout
      // (abandonné, déjà acheté…) n'est pas mise à jour : elle part à l'archivage.
      const garde = f.decision === 'GARDER' && !!fin && !archiveTout;
      const archiver = (f.decision === 'ARCHIVER' || f.decision === 'FUSIONNER' || archiveTout) && f.archivage_valide === 1;
      // Le budget + 10 % ne part que s'il a été rediscuté : contact requalifié,
      // ou montant différent de celui de Modelo. Sinon une valeur simplement
      // pré-remplie était gonflée à chaque report.
      const budgetDiscute = garde && p.budget_max && (requal || Number(p.budget_max) !== Number(f.budget_max));
      // Communes par leur nom, ou zones à tracer dès qu'un quartier de Grenoble
      // est coché (règles dans acqZones.js). En repli « sans contour », on
      // n'envoie aucune localisation : Exploration Modelo n'y touche pas.
      const loc = Z.localisation({ secteurs: p.secteurs, quartiers: p.quartiers_grenoble });
      const secteurs = loc.repli === 'SANS_CONTOUR' ? '' : loc.mode === 'ZONES' ? loc.texte : loc.communes;
      const repli = garde ? Z.mentionRepli(loc) : '';
      const motif = f.decision === 'FUSIONNER' ? `doublon de la recherche n° ${f.fusion_dans}, conservée et mise à jour`
        : f.decision === 'ARCHIVER' ? (f.motif_archivage || 'projet ancien')
        : archiveTout ? LIB_STATUT[c.statut] : '';
      lignes.push({
        id_contact: c.id_contact, id_fiche: idModelo(f), nom: c.nom || '', prenom: c.prenom || '',
        agent: fin?.madame_fichier || appels[appels.length - 1].madame_fichier, date_note: jj((fin || appels[appels.length - 1]).horodatage),
        type_note: TYPE_NOTE, commentaire: i === 0 ? (note || '') : '',
        stop_tel: i === 0 && c.statut === 'NE_PLUS_CONTACTER' ? 'OUI' : '', stop_mail: i === 0 && d.stop_mail ? 'OUI' : '',
        tel_portable_avant: i === 0 ? av('tel_portable') : '', tel_portable_apres: i === 0 ? ap('tel_portable') : '',
        tel_fixe_avant: i === 0 ? av('tel_fixe') : '', tel_fixe_apres: i === 0 ? ap('tel_fixe') : '',
        email_avant: i === 0 ? av('email') : '', email_apres: i === 0 ? ap('email') : '',
        adresse_avant: i === 0 ? av('adresse') : '', adresse_apres: i === 0 ? ap('adresse') : '',
        type_bien_apres: garde ? typeBienModelo(p.type_bien) : '',
        budget_min_apres: garde && p.budget_min ? String(p.budget_min) : '',
        budget_max_avant: budgetDiscute && f.budget_max ? String(f.budget_max) : '',
        budget_max_apres: budgetDiscute ? String(A.budgetModelo(p.budget_max)) : '',
        surface_min_apres: garde && p.surface_min ? String(p.surface_min) : '',
        pieces_min_apres: garde && p.pieces ? String(p.pieces) : '',
        chambres_min_apres: garde && p.chambres ? String(p.chambres) : '',
        secteurs_avant: garde && secteurs ? (f.communes || f.codes_postaux || '') : '',
        secteurs_apres: garde ? secteurs : '',
        priorite_avant: garde && A.prioriteModelo(p.urgence) ? (f.priorite || '') : '',
        priorite_apres: garde ? (A.prioriteModelo(p.urgence) || '') : '',
        criteres_obligatoires_apres: garde ? (p.criteres || []).filter(x => x.niveau === 'INDISPENSABLE').map(x => x.valeur ? `${x.critere} : ${x.valeur}` : x.critere).join(', ') : '',
        precisions_apres: garde ? blocPrecisions(f, c, fin, d) : '',
        nego_contact_cible: i === 0 && requal && !resteAilleurs ? fin.madame_fichier : '',
        nego_fiche_cible: requal && garde && !resteAilleurs ? fin.madame_fichier : '',
        // Projet actif confirmé à l'appel : l'acquéreur doit recevoir les biens,
        // d'office (Loïck, 25/11). L'état se lit recherche par recherche.
        alerte_mail: garde ? (p.etat_projet === 'ACTIF' ? 'oui' : p.etat_projet === 'EN_PAUSE' ? 'non' : requal ? 'oui' : c.statut === 'EN_PAUSE' ? 'non' : '')
          : (archiver || (archiveTout && f.decision === 'GARDER') ? 'non' : ''),
        archiver_fiche: archiver ? 'oui' : '',
        commentaire_fiche: archiver ? `${PREFIXE} Fiche archivée le ${jj(f.decision_le || fin?.horodatage)} par ${fin?.madame_fichier || ''} : ${motif}.` : '',
        fusion_dans: archiver && f.decision === 'FUSIONNER' ? (toutes.find(x => x.id_fiche === f.fusion_dans)?.id_modelo_cree || f.fusion_dans || '') : '',
        type_contact_ajout: i === 0 && vendeur ? 'Vendeur' : '',
        a_proposer_a_loick: [i === 0 && vendeur ? 'oui' : '', repli].filter(Boolean).join(' ; '),
        jusqu_a: jusquA,
        zones_apres: garde && loc.mode === 'ZONES' ? JSON.stringify(loc.zones) : '',
        creer_fiche: '', ref_creation: '',
      });
    });
    if (ENVOI_CREATIONS) for (const f of toutes.filter(x => aCreer(x) && x.decision === 'GARDER')) lignes.push(ligneCreation(c, f, jusquA, fin, d));
  }
  return lignes;
}

// La ligne qui demande la création d'une recherche : pas de numéro, notre
// référence, et tout ce qu'il faut pour la remplir. Elle ne porte ni note ni
// coordonnées (celles-ci sont sur la première ligne du contact). Le conseiller
// de la recherche est toujours renseigné : vide, Modelo y mettrait Loïck.
function ligneCreation(c, f, jusquA, fin = null, fusion = null) {
  const p = json(f.requalif);
  const loc = Z.localisation({ secteurs: p.secteurs, quartiers: p.quartiers_grenoble });
  const secteurs = loc.repli === 'SANS_CONTOUR' ? '' : loc.mode === 'ZONES' ? loc.texte : loc.communes;
  const qui = f.creee_par || fin?.madame_fichier || c.madame_fichier || '';
  const vide = Object.fromEntries(COLONNES.map(k => [k, '']));
  return { ...vide,
    id_contact: c.id_contact, id_fiche: '', nom: c.nom || '', prenom: c.prenom || '',
    agent: qui, date_note: jj(f.creee_le), type_note: TYPE_NOTE,
    type_bien_apres: typeBienModelo(p.type_bien || f.type_bien),
    budget_min_apres: p.budget_min ? String(p.budget_min) : '',
    budget_max_apres: p.budget_max ? String(A.budgetModelo(p.budget_max)) : '',
    surface_min_apres: p.surface_min ? String(p.surface_min) : '',
    pieces_min_apres: p.pieces ? String(p.pieces) : '',
    chambres_min_apres: p.chambres ? String(p.chambres) : '',
    secteurs_apres: secteurs,
    priorite_apres: A.prioriteModelo(p.urgence) || '',
    criteres_obligatoires_apres: (p.criteres || []).filter(x => x.niveau === 'INDISPENSABLE').map(x => x.valeur ? `${x.critere} : ${x.valeur}` : x.critere).join(', '),
    precisions_apres: blocPrecisions(f, c, fin || { horodatage: f.creee_le, madame_fichier: qui }, fusion),
    nego_fiche_cible: qui,
    alerte_mail: p.etat_projet === 'ACTIF' ? 'oui' : 'non',
    a_proposer_a_loick: Z.mentionRepli(loc) || '',
    jusqu_a: jusquA,
    zones_apres: loc.mode === 'ZONES' ? JSON.stringify(loc.zones) : '',
    creer_fiche: 'oui', ref_creation: f.id_fiche,
  };
}

const cellule = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const enCsv = (lignes) => '﻿' + [COLONNES.join(';'), ...lignes.map(l => COLONNES.map(k => cellule(l[k])).join(';'))].join('\r\n');

const jour = (s) => jj(s);
module.exports = { jour, fusionDetails, blocPrecisions, noteContact, lignesReport, enCsv, archivagesEnAttente, aReporter, creationsEnAttente, ENVOI_CREATIONS, idModelo, typeBienModelo, COLONNES,
  STATUTS_ARCHIVANT, LIB_STATUT, PREFIXE };
