// Opération anciens clients — espace cloisonné, comme le courtage.
//
// Lecture et écriture : rôle conseiller sur son seul portefeuille. Le manager
// et l'admin voient tout ; un manager porteur d'une agence ne voit que la
// sienne (cas de Saint-Égrève).
//
// Les règles d'appel (plages légales, plafond mensuel, opposition au
// démarchage) AVERTISSENT sans bloquer : les conseillers sont des
// professionnels qui en répondent. La route enregistre en revanche tout appel
// passé hors de ce cadre, pour que la trace existe.
const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const R = require('../utils/opRegles');
const S = require('../utils/opScripts');

const router = express.Router();
router.use(requireAuth);

const conseillerOuPlus = requireRole('conseiller', 'manager', 'admin', 'courtage');
const pilotage = requireRole('manager', 'admin');

// --- Qui est l'utilisateur, et que voit-il ? -------------------------------
//
// Le jeton ne porte que l'email : l'attribution des fiches, elle, se fait sur
// « Prénom NOM ». On relit donc le compte pour reconstituer ce nom. Passer par
// l'email évite les pièges d'homonymie et de casse.
function identite(req) {
  const u = db.prepare('SELECT id, prenom, nom, role, agence FROM users WHERE id = ?').get(req.user.id);
  if (!u) return null;
  return {
    id: u.id,
    // Le compte dit « Marine Rosain », le fichier Modelo « Marine ROSAIN ».
    // Toute comparaison de nom se fait donc sans tenir compte de la casse ni
    // des espaces : sinon Marine ne voyait aucune de ses 31 fiches, et le
    // cloisonnement rendait le défaut invisible jusqu'au premier matin.
    nom_complet: `${u.prenom} ${u.nom}`.trim(),
    role: u.role,
    agence: u.agence || null,
    // Voit tout le monde : manager et admin. Un manager rattaché à une agence
    // est restreint à celle-ci.
    global: ['manager', 'admin'].includes(u.role),
  };
}

// Clause SQL restreignant ce qu'une personne a le droit de voir.
function perimetre(moi, prefixe = '') {
  const p = prefixe ? prefixe + '.' : '';
  if (!moi.global) return { where: `LOWER(TRIM(${p}conseiller)) = LOWER(?)`, params: [moi.nom_complet] };
  if (moi.agence) return { where: `${p}agence = ?`, params: [moi.agence] };
  return { where: '1=1', params: [] };
}

// Nombre d'appels passés ce mois civil à cette personne, toutes issues et tous
// conseillers confondus : c'est ce que plafonne la loi.
const appelsCeMois = db.prepare(
  "SELECT COUNT(*) n FROM op_appels WHERE id_modelo = ? AND strftime('%Y-%m', horodatage) = ?");
const compteurMois = (id, maintenant = new Date()) =>
  appelsCeMois.get(id, R.moisCourant(maintenant)).n;

const getContact = (id) => db.prepare('SELECT * FROM op_contacts WHERE id_modelo = ?').get(id);

// Cette fiche appartient-elle à cette personne ? Comparaison insensible à la
// casse : les noms viennent de deux sources qui ne les écrivent pas pareil.
const normNom = (x) => (x || '').trim().toLowerCase();
const estSien = (contact, moi) => normNom(contact.conseiller) === normNom(moi.nom_complet);

// Enrichit une fiche de ce qui se calcule : état d'appelabilité, compteur,
// en-tête de script. Évite au client de refaire la règle — et de se tromper.
function enrichir(c, maintenant = new Date()) {
  if (!c) return null;
  const n = compteurMois(c.id_modelo, maintenant);
  const dernier = db.prepare(
    'SELECT issue, horodatage, conseiller FROM op_appels WHERE id_modelo = ? ORDER BY horodatage DESC LIMIT 1').get(c.id_modelo);
  return {
    ...c,
    appels_ce_mois: n,
    avertissements: R.avertissementsAppel(c, n, maintenant),
    avertissements_mail: R.avertissementsMail(c),
    dernier_appel: dernier || null,
    entete: S.enTete(c),
    resultat: db.prepare('SELECT * FROM op_resultats WHERE id_modelo = ?').get(c.id_modelo) || null,
  };
}

// --- Ai-je quelque chose à faire dans cette opération ? ---------------------
//
// Appelée au démarrage par toute personne connectée. Sert à décider si on lui
// montre l'écran de choix : quelqu'un qui n'a aucune fiche ne doit voir aucun
// changement.
router.get('/mon-acces', (req, res) => {
  const moi = identite(req);
  if (!moi) return res.json({ participe: false });
  const n = db.prepare('SELECT COUNT(*) n FROM op_contacts WHERE LOWER(TRIM(conseiller)) = LOWER(?)').get(moi.nom_complet).n;
  // Chiffres de la page d'accueil : ceux du conseiller connecté, recalculés à
  // chaque affichage.
  const { where, params } = perimetre(moi, 'c');
  const bilan = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN c.objectif_principal = 'ADRESSE' THEN 1 ELSE 0 END) AS adresse_count,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
               THEN 1 ELSE 0 END) AS restants
    FROM op_contacts c WHERE ${where} AND c.a_dispatcher = 0`).get(...params);

  const acquis = db.prepare(`
    SELECT
      SUM(CASE WHEN r.actualisation = 'ACCEPTEE' THEN 1 ELSE 0 END) AS rdv,
      SUM(CASE WHEN r.adresse_maj IS NOT NULL THEN 1 ELSE 0 END)    AS adresses
    FROM op_resultats r JOIN op_contacts c ON c.id_modelo = r.id_modelo
    WHERE ${where}`).get(...params);

  res.json({
    participe: n > 0 || moi.global,
    fiches: moi.global ? bilan.total : n,
    pilote: moi.global,
    agence: moi.agence,
    bilan: {
      total: bilan.total || 0,
      restants: bilan.restants || 0,
      adresse_count: bilan.adresse_count || 0,
      rdv: acquis.rdv || 0,
      adresses: acquis.adresses || 0,
    },
  });
});

// --- Ce que je dois faire aujourd'hui --------------------------------------
//
// L'ordre est celui du contrat : les rappels dus d'abord (un rendez-vous
// téléphonique manqué annule le bénéfice de l'appel précédent), puis les
// objectifs « adresse » jamais appelés, puis le reste, puis les sans-réponse
// de plus de 48 h.
router.get('/file', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });
  const { where, params } = perimetre(moi, 'c');

  const lignes = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM op_appels a
        WHERE a.id_modelo = c.id_modelo
          AND strftime('%Y-%m', a.horodatage) = ?)                         AS appels_ce_mois,
      (SELECT COUNT(*) FROM op_appels a WHERE a.id_modelo = c.id_modelo)   AS appels_total,
      (SELECT MAX(a.horodatage) FROM op_appels a WHERE a.id_modelo = c.id_modelo) AS dernier_appel_le,
      (SELECT a.issue FROM op_appels a WHERE a.id_modelo = c.id_modelo
        ORDER BY a.horodatage DESC LIMIT 1)                                AS derniere_issue,
      (SELECT a.rappel_le FROM op_appels a WHERE a.id_modelo = c.id_modelo
        AND a.issue = 'A_RAPPELER' ORDER BY a.horodatage DESC LIMIT 1)     AS rappel_le
    FROM op_contacts c
    WHERE ${where}
      AND c.a_dispatcher = 0
    ORDER BY c.nom, c.prenom
  `).all(R.moisCourant(), ...params);

  const maintenant = new Date();
  const nowIso = maintenant.toISOString();

  // Les fiches signalées restent dans la file, en fin de liste : l'agent les
  // voit, avec leur avertissement, et décide. Un refus ferme ou un décès, en
  // revanche, clôt le dossier — ce n'est plus un avertissement, c'est une
  // conversation terminée.
  const ouverts = lignes.filter(l => !R.ISSUES_TERMINALES.has(l.derniere_issue));
  const plafonnes = ouverts.filter(l => l.appels_ce_mois >= R.PLAFOND_MENSUEL).length;
  const opposes = ouverts.filter(l => l.stop_telephone).length;

  const rappelsDus = ouverts.filter(l => l.rappel_le && l.rappel_le <= nowIso
    && l.derniere_issue === 'A_RAPPELER');
  const reste = ouverts.filter(l => !rappelsDus.includes(l));

  const jamaisAppeles = reste.filter(l => !l.appels_total);
  const adresseDAbord = jamaisAppeles.filter(l => l.objectif_principal === 'ADRESSE');
  const autresNeufs = jamaisAppeles.filter(l => l.objectif_principal !== 'ADRESSE');

  // Relance : 48 h, et à une autre tranche horaire que la dernière tentative.
  const il48h = Date.now() - 48 * 3600 * 1000;
  const aRelancer = reste.filter(l => l.appels_total
    && ['PAS_DE_REPONSE', 'REPONDEUR'].includes(l.derniere_issue)
    && l.dernier_appel_le && new Date(l.dernier_appel_le).getTime() < il48h
    && new Date(l.dernier_appel_le).getHours() < 14 !== maintenant.getHours() < 14);

  // Les fiches à signalement grave passent en queue : on ne les cache pas,
  // mais on ne les met pas non plus sous la main en premier.
  const ordonnee = [...rappelsDus, ...adresseDAbord, ...autresNeufs, ...aRelancer];
  const signalee = (l) => l.stop_telephone || l.appels_ce_mois >= R.PLAFOND_MENSUEL;
  // Filet : toute fiche encore ouverte qu'aucun groupe n'a reprise. Un contact
  // joint mais sans suite, un faux numéro à revoir — sans ce filet, ils
  // disparaîtraient de l'écran sans que personne ne s'en aperçoive.
  const deja = new Set(ordonnee.map(l => l.id_modelo));
  const autres = ouverts.filter(l => !deja.has(l.id_modelo));
  const complete = [...ordonnee, ...autres];

  const file = [...complete.filter(l => !signalee(l)), ...complete.filter(signalee)]
    .map(l => ({
      ...l,
      entete: S.enTete(l),
      avertissements: R.avertissementsAppel(l, l.appels_ce_mois, maintenant),
    }));

  res.json({
    plage: R.plageAppelOk(maintenant),
    file,
    groupes: {
      rappels_dus: rappelsDus.length,
      adresse_jamais_appeles: adresseDAbord.length,
      jamais_appeles: autresNeufs.length,
      a_relancer: aRelancer.length,
      a_revoir: autres.length,
    },
    compteurs: {
      portefeuille: lignes.length,
      plafonnes,
      opposes,
      clos: lignes.length - ouverts.length,
      restants: file.length,
    },
  });
});

// --- Une fiche --------------------------------------------------------------
router.get('/contacts/:id', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  if (!moi.global && !estSien(c, moi))
    return res.status(403).json({ error: 'Ce contact ne vous est pas attribué' });
  if (moi.global && moi.agence && c.agence !== moi.agence)
    return res.status(403).json({ error: 'Ce contact est hors de votre agence' });

  res.json({
    contact: enrichir(c),
    appels: db.prepare('SELECT * FROM op_appels WHERE id_modelo = ? ORDER BY horodatage DESC').all(c.id_modelo),
  });
});

// --- Enregistrer un appel ---------------------------------------------------
//
// L'appel n'est jamais refusé : c'est le conseiller qui décide. Mais s'il sort
// du cadre légal — hors plage, au-delà du plafond, ou vers une personne
// opposée — la raison est écrite sur la ligne d'appel.
router.post('/contacts/:id/appel', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  if (!moi.global && !estSien(c, moi))
    return res.status(403).json({ error: 'Ce contact ne vous est pas attribué' });

  const b = req.body || {};
  const issue = String(b.issue || '').toUpperCase();
  const ISSUES = ['JOINT', 'REPONDEUR', 'PAS_DE_REPONSE', 'FAUX_NUMERO', 'A_RAPPELER',
    'REFUS_FERME', 'ERREUR_IDENTITE', 'SUIVI_ANCIEN_CONSEILLER', 'DECEDE'];
  if (!ISSUES.includes(issue)) return res.status(400).json({ error: 'Issue d\'appel inconnue' });

  // Un rappel sans créneau est un rappel qui n'aura pas lieu.
  if (issue === 'A_RAPPELER' && !b.rappel_le)
    return res.status(400).json({ error: 'Un rappel demande une date et une heure' });

  const maintenant = new Date();
  const av = R.avertissementsAppel(c, compteurMois(c.id_modelo, maintenant), maintenant);
  const trace = R.horsCadre(av) ? av.filter(a => a.niveau === 'grave' || a.code === 'HORS_PLAGE')
    .map(a => a.code).join(',') : null;

  const ecrire = db.transaction(() => {
    db.prepare(`INSERT INTO op_appels (id_modelo, conseiller, user_id, issue, rappel_le, duree_sec, notes, hors_cadre)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      c.id_modelo, moi.nom_complet, moi.id, issue,
      issue === 'A_RAPPELER' ? b.rappel_le : null,
      b.duree_sec || null, (b.notes || '').trim() || null, trace);

    // Un refus ferme vaut opposition : journal inaltérable, et retrait de
    // toutes les files, celle-ci comme les suivantes.
    if (issue === R.ISSUE_OPPOSITION) {
      db.prepare(`INSERT INTO op_journal_opposition (id_modelo, canal, origine, agent, nom, prenom, telephone)
        VALUES (?, 'TELEPHONE', 'APPEL', ?, ?, ?, ?)`).run(
        c.id_modelo, moi.nom_complet, c.nom, c.prenom, c.tel_portable || c.tel_fixe);
      db.prepare("UPDATE op_contacts SET stop_telephone = 1, updated_at = datetime('now') WHERE id_modelo = ?")
        .run(c.id_modelo);
    }
  });
  ecrire();

  res.status(201).json({
    ok: true,
    hors_cadre: trace,
    contact: enrichir(getContact(c.id_modelo), maintenant),
  });
});

// --- Ce qu'on a recueilli ---------------------------------------------------
const CHAMPS_RESULTAT = [
  'adresse_maj', 'complement_maj', 'code_postal_maj', 'commune_maj',
  'courrier_renvoye', 'date_renvoi', 'toujours_proprietaire', 'revendu_quand',
  'revendu_par_qui', 'statut_actuel', 'projet', 'projet_echeance',
  'actualisation', 'date_rdv', 'soiree', 'panneau',
  'recommandation_nom', 'recommandation_mode', 'consentement_tel', 'date_consentement',
];

router.put('/contacts/:id/resultat', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  if (!moi.global && !estSien(c, moi))
    return res.status(403).json({ error: 'Ce contact ne vous est pas attribué' });

  const b = req.body || {};
  const fournis = CHAMPS_RESULTAT.filter(k => k in b);
  if (!fournis.length) return res.status(400).json({ error: 'Rien à enregistrer' });

  // Le consentement est daté automatiquement : c'est la date qui lui donne sa
  // valeur, et un agent ne doit pas avoir à y penser.
  const valeurs = {};
  for (const k of fournis) valeurs[k] = b[k] === '' ? null : b[k];
  if (valeurs.consentement_tel != null && !valeurs.date_consentement)
    valeurs.date_consentement = new Date().toISOString();
  if (valeurs.courrier_renvoye && !valeurs.date_renvoi)
    valeurs.date_renvoi = new Date().toISOString().slice(0, 10);

  const cles = Object.keys(valeurs);
  db.prepare(`
    INSERT INTO op_resultats (id_modelo, ${cles.join(', ')})
    VALUES (@id_modelo, ${cles.map(k => '@' + k).join(', ')})
    ON CONFLICT(id_modelo) DO UPDATE SET
      ${cles.map(k => `${k} = excluded.${k}`).join(', ')},
      updated_at = datetime('now')
  `).run({ id_modelo: c.id_modelo, ...valeurs });

  res.json({ ok: true, resultat: db.prepare('SELECT * FROM op_resultats WHERE id_modelo = ?').get(c.id_modelo) });
});

// --- Dispatch des orphelins (pilotage) --------------------------------------
router.get('/dispatch', pilotage, (req, res) => {
  const lignes = db.prepare(`
    SELECT id_modelo, nom, prenom, commune, code_postal, courrier_etat, script,
           bien_concerne, situation, suggestion_conseiller, suggestion_base,
           conseiller_precedent, point_attention
    FROM op_contacts WHERE a_dispatcher = 1
    ORDER BY suggestion_base, conseiller_precedent, nom`).all();

  // Le compteur du contrat : ce que chacun a, ce qu'il recevrait si on suivait
  // toutes les suggestions. La règle géographique indique, elle n'arbitre pas
  // la charge — Tara couvre Grenoble et récupérerait 109 fiches de plus.
  const charge = db.prepare(`
    SELECT conseiller AS nom, COUNT(*) n FROM op_contacts
    WHERE a_dispatcher = 0 AND conseiller IS NOT NULL GROUP BY conseiller`).all();
  const suggere = db.prepare(`
    SELECT suggestion_conseiller AS nom, COUNT(*) n FROM op_contacts
    WHERE a_dispatcher = 1 AND suggestion_conseiller IS NOT NULL GROUP BY suggestion_conseiller`).all();

  const parNom = {};
  charge.forEach(c => { parNom[c.nom] = { nom: c.nom, actuel: c.n, suggere: 0 }; });
  suggere.forEach(s => { (parNom[s.nom] = parNom[s.nom] || { nom: s.nom, actuel: 0, suggere: 0 }).suggere = s.n; });
  const compteur = Object.values(parNom)
    .map(x => ({ ...x, total_si_suivi: x.actuel + x.suggere }))
    .sort((a, b) => b.total_si_suivi - a.total_si_suivi);

  res.json({ a_dispatcher: lignes.length, lignes, compteur });
});

// Attribution en lot : c'est elle qui fait gagner l'heure sur 340 fiches.
router.post('/dispatch', pilotage, (req, res) => {
  const b = req.body || {};
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  const vers = String(b.conseiller || '').trim();
  if (!ids.length) return res.status(400).json({ error: 'Aucune fiche sélectionnée' });
  if (!vers) return res.status(400).json({ error: 'Choisissez un conseiller' });

  // On n'attribue qu'à quelqu'un qui a un compte : sans compte, la fiche
  // disparaîtrait dans la file de personne.
  const existe = db.prepare(
    "SELECT 1 FROM users WHERE LOWER(TRIM(prenom || ' ' || nom)) = LOWER(?) AND actif = 1").get(vers);
  if (!existe) return res.status(400).json({ error: `${vers} n'a pas de compte actif` });

  const maj = db.prepare(`UPDATE op_contacts
     SET conseiller = ?, a_dispatcher = 0, updated_at = datetime('now')
     WHERE id_modelo = ? AND a_dispatcher = 1`);
  let n = 0;
  db.transaction(() => { for (const id of ids) n += maj.run(vers, id).changes; })();

  res.json({ ok: true, attribuees: n, restantes: db.prepare('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher = 1').get().n });
});

// --- Pilotage ---------------------------------------------------------------
//
// Ce qu'on regarde le matin. L'indicateur principal est le nombre
// d'actualisations calées : c'est le seul qui se transforme en mandat. On ne
// compte pas les mandats — le délai se mesure en mois, et un compteur à zéro
// pendant six semaines démobilise.
router.get('/pilotage', pilotage, (req, res) => {
  const moi = identite(req);
  const { where, params } = perimetre(moi, 'c');
  const joint = (sql, ...a) => db.prepare(sql).all(...a);

  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  res.json({
    appels_par_jour: joint(`
      SELECT date(a.horodatage) AS jour, a.conseiller, COUNT(*) n
      FROM op_appels a JOIN op_contacts c ON c.id_modelo = a.id_modelo
      WHERE ${where} AND date(a.horodatage) >= date('now','-7 day')
      GROUP BY jour, a.conseiller ORDER BY jour DESC, n DESC`, ...params),

    avancement: joint(`
      SELECT c.conseiller,
        COUNT(*) AS portefeuille,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo) THEN 1 ELSE 0 END) AS appeles,
        SUM(CASE WHEN c.objectif_principal = 'ADRESSE' THEN 1 ELSE 0 END) AS objectif_adresse
      FROM op_contacts c WHERE ${where} AND c.a_dispatcher = 0
      GROUP BY c.conseiller ORDER BY portefeuille DESC`, ...params),

    resultats: db.prepare(`
      SELECT
        SUM(CASE WHEN r.actualisation = 'ACCEPTEE' THEN 1 ELSE 0 END) AS actualisations,
        SUM(CASE WHEN r.adresse_maj IS NOT NULL THEN 1 ELSE 0 END)    AS adresses_maj,
        SUM(CASE WHEN r.soiree = 1 THEN 1 ELSE 0 END)                 AS soiree,
        SUM(CASE WHEN r.panneau = 1 THEN 1 ELSE 0 END)                AS panneau,
        SUM(CASE WHEN r.courrier_renvoye = 1 THEN 1 ELSE 0 END)       AS courriers_renvoyes
      FROM op_resultats r JOIN op_contacts c ON c.id_modelo = r.id_modelo
      WHERE ${where}`).get(...params),

    rappels_du_jour: joint(`
      SELECT c.id_modelo, c.nom, c.prenom, c.conseiller, a.rappel_le
      FROM op_appels a JOIN op_contacts c ON c.id_modelo = a.id_modelo
      WHERE ${where} AND a.issue = 'A_RAPPELER' AND date(a.rappel_le) <= date(?)
      ORDER BY a.rappel_le`, ...params, aujourdhui),

    refus_recents: joint(`
      SELECT c.nom, c.prenom, c.conseiller, a.horodatage
      FROM op_appels a JOIN op_contacts c ON c.id_modelo = a.id_modelo
      WHERE ${where} AND a.issue = 'REFUS_FERME' AND date(a.horodatage) >= date(?)
      ORDER BY a.horodatage DESC`, ...params, hier),

    a_dispatcher: db.prepare('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher = 1').get().n,
  });
});

module.exports = router;
