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
const I = require('../utils/opImport');
const D = require('../utils/opDemo');

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
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
               THEN 1 ELSE 0 END) AS restants
    FROM op_contacts c WHERE ${where} AND c.a_dispatcher = 0`).get(...params);

  // Les quatre objectifs, au même rang. Calculés côté serveur pour qu'ils
  // survivent à un rechargement de page : un compteur qui repart à zéro à midi
  // ne mesure rien et décourage.
  const acquis = db.prepare(`
    SELECT
      SUM(CASE WHEN r.actualisation = 'ACCEPTEE' THEN 1 ELSE 0 END) AS estimations,
      SUM(CASE WHEN r.soiree = 1 THEN 1 ELSE 0 END)                 AS soiree,
      SUM(CASE WHEN r.panneau = 1 THEN 1 ELSE 0 END)                AS panneaux,
      SUM(CASE WHEN r.adresse_maj IS NOT NULL OR r.statut_actuel IS NOT NULL
                 OR r.projet IS NOT NULL OR r.toujours_proprietaire IS NOT NULL
                 OR r.fiche_confirmee = 1
               THEN 1 ELSE 0 END)                                   AS fiches_a_jour
    FROM op_resultats r JOIN op_contacts c ON c.id_modelo = r.id_modelo
    WHERE ${where}`).get(...params);

  const joints = db.prepare(`
    SELECT COUNT(DISTINCT a.id_modelo) n FROM op_appels a
    JOIN op_contacts c ON c.id_modelo = a.id_modelo
    WHERE ${where} AND a.issue = 'JOINT'`).get(...params).n;

  // Tout le portefeuille n'a pas reçu le courrier : celui de Céline a été
  // sorti de l'envoi, par choix. Un agent dans ce cas ne doit pas ouvrir sur
  // « vous avez reçu notre lettre » — on le lui dit dès l'accueil, calculé
  // plutôt qu'écrit en dur pour que la règle vaille pour qui que ce soit.
  const courrier = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN courrier_etat = 'NON_IMPRIME' THEN 1 ELSE 0 END) AS sans
    FROM op_contacts WHERE LOWER(TRIM(conseiller)) = LOWER(?)`).get(moi.nom_complet);
  const sansCourrier = courrier.total > 0 && courrier.sans === courrier.total;

  // Deux chiffres distincts, qu'on confondait : `fiches` est ce que la
  // personne a elle-même à appeler, `perimetre` est ce qu'elle supervise.
  // Un manager voyait « 748 fiches à appeler » au lieu de ses 51.
  res.json({
    participe: n > 0 || moi.global,
    fiches: n,
    perimetre: bilan.total || 0,
    pilote: moi.global,
    agence: moi.agence,
    sans_courrier: sansCourrier,
    bilan: {
      total: bilan.total || 0,
      restants: bilan.restants || 0,
      joints,
      estimations: acquis.estimations || 0,
      soiree: acquis.soiree || 0,
      panneaux: acquis.panneaux || 0,
      fiches_a_jour: acquis.fiches_a_jour || 0,
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
        AND a.issue = 'A_RAPPELER' ORDER BY a.horodatage DESC LIMIT 1)     AS rappel_le,
      (SELECT a.conseiller FROM op_appels a WHERE a.id_modelo = c.id_modelo
        ORDER BY a.horodatage DESC LIMIT 1)                                AS dernier_par,
      (SELECT a.notes FROM op_appels a WHERE a.id_modelo = c.id_modelo
        AND a.notes IS NOT NULL ORDER BY a.horodatage DESC LIMIT 1)        AS derniere_note
    FROM op_contacts c
    WHERE ${where}
      AND c.a_dispatcher = 0
      -- Les fiches à identité incertaine sortent de la file tant qu'un manager
      -- ne les a pas vérifiées : les appeler est le pire démarrage possible.
      AND NOT (c.a_verifier = 1 AND c.verifie IS NULL)
    ORDER BY c.nom, c.prenom
  `).all(R.moisCourant(), ...params);

  const maintenant = new Date();

  // Les fiches signalées restent dans la file, en fin de liste : l'agent les
  // voit, avec leur avertissement, et décide. Un refus ferme ou un décès, en
  // revanche, clôt le dossier — ce n'est plus un avertissement, c'est une
  // conversation terminée.
  const ouverts = lignes.filter(l => !R.ISSUES_TERMINALES.has(l.derniere_issue));
  const plafonnes = ouverts.filter(l => l.appels_ce_mois >= R.PLAFOND_MENSUEL).length;
  const opposes = ouverts.filter(l => l.stop_telephone).length;

  const rappelsDus = ouverts.filter(l => l.derniere_issue === 'A_RAPPELER'
    && R.rappelDu(l.rappel_le, maintenant));
  const reste = ouverts.filter(l => !rappelsDus.includes(l));

  // Ordre alphabétique simple pour les fiches jamais appelées (arbitrage du
  // 20 octobre). Les fiches sans adresse valide n'ont aucune contrainte de
  // temps : les servir en premier faisait démarrer la journée par les appels
  // les plus difficiles, et donnait à croire que l'adresse était l'objectif.
  const jamaisAppeles = reste.filter(l => !l.appels_total);

  // Relance : 48 h, et à une autre tranche horaire que la dernière tentative.
  const il48h = maintenant.getTime() - 48 * 3600 * 1000;
  const aRelancer = reste.filter(l => {
    if (!l.appels_total || !['PAS_DE_REPONSE', 'REPONDEUR'].includes(l.derniere_issue)) return false;
    const dernier = R.depuisSqlite(l.dernier_appel_le);
    return dernier && dernier.getTime() < il48h && !R.memeTranche(dernier, maintenant);
  });

  // Les fiches à signalement grave passent en queue : on ne les cache pas,
  // mais on ne les met pas non plus sous la main en premier.
  const ordonnee = [...rappelsDus, ...jamaisAppeles, ...aRelancer];
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
      // L'alerte « adresse d'un conseiller » doit suivre la fiche partout :
      // elle se découvre au moment d'envoyer le courrier, pas avant.
      avertissements_mail: R.avertissementsMail(l),
    }));

  res.json({
    plage: R.plageAppelOk(maintenant),
    file,
    groupes: {
      rappels_dus: rappelsDus.length,
      jamais_appeles: jamaisAppeles.length,
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

// --- Rechercher quelqu'un pendant la session -------------------------------
//
// Un client rappelle : l'agent doit le retrouver sans quitter sa session. La
// recherche porte sur son propre portefeuille — et sur tout le fichier pour un
// manager, puisqu'un client peut tomber sur n'importe qui.
router.get('/recherche', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const { where, params } = perimetre(moi, 'c');
  // Les numéros sont saisis avec des espaces, des points ou un indicatif : on
  // compare chiffre à chiffre plutôt que caractère à caractère.
  const chiffres = q.replace(/\D/g, '');
  const motif = `%${q.toLowerCase()}%`;

  const lignes = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM op_appels a WHERE a.id_modelo = c.id_modelo
        AND strftime('%Y-%m', a.horodatage) = ?) AS appels_ce_mois
    FROM op_contacts c
    WHERE ${where} AND (
      LOWER(c.nom) LIKE ? OR LOWER(c.prenom) LIKE ?
      OR LOWER(COALESCE(c.nom,'') || ' ' || COALESCE(c.prenom,'')) LIKE ?
      OR LOWER(COALESCE(c.email,'')) LIKE ?
      ${chiffres.length >= 4
        ? `OR REPLACE(REPLACE(REPLACE(COALESCE(c.tel_portable,''),' ',''),'.',''),'-','') LIKE '%${chiffres}%'
           OR REPLACE(REPLACE(REPLACE(COALESCE(c.tel_fixe,''),' ',''),'.',''),'-','') LIKE '%${chiffres}%'`
        : ''}
    )
    ORDER BY c.nom, c.prenom LIMIT 8
  `).all(R.moisCourant(), ...params, motif, motif, motif, motif);

  const maintenant = new Date();
  res.json(lignes.map(l => ({
    ...l,
    entete: S.enTete(l),
    avertissements: R.avertissementsAppel(l, l.appels_ce_mois, maintenant),
    avertissements_mail: R.avertissementsMail(l),
  })));
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
    'REFUS_FERME', 'ERREUR_IDENTITE', 'DECEDE'];
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
  'adresse_maj', 'complement_maj', 'code_postal_maj', 'commune_maj', 'email_maj',
  'courrier_renvoye', 'date_renvoi', 'npai', 'fiche_confirmee', 'toujours_proprietaire', 'revendu_quand',
  'revendu_par_qui', 'statut_actuel', 'projet', 'projet_echeance',
  'actualisation', 'date_rdv', 'soiree', 'panneau',
  'recommandation_nom', 'recommandation_tel', 'recommandation_email',
  'recommandation_motif', 'recommandation_mode', 'consentement_tel', 'date_consentement',
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
  // « Rien n'a changé » se date aussi : c'est ce qui permet de dire qu'une
  // fiche a été vérifiée, et quand.
  if (valeurs.fiche_confirmee) valeurs.confirmee_le = new Date().toISOString().slice(0, 10);

  // L'appel qui produit cette saisie : le dernier de cet agent sur cette fiche.
  // Sert au récapitulatif, qui ne doit proposer de corriger que le bon.
  const appel = db.prepare(`SELECT id FROM op_appels WHERE id_modelo = ?
    ORDER BY horodatage DESC, id DESC LIMIT 1`).get(c.id_modelo);

  const avant = db.prepare('SELECT * FROM op_resultats WHERE id_modelo = ?').get(c.id_modelo);

  const cles = Object.keys(valeurs);
  const ecrire = db.transaction(() => {
    db.prepare(`
      INSERT INTO op_resultats (id_modelo, appel_id, saisi_par, ${cles.join(', ')})
      VALUES (@id_modelo, @appel_id, @saisi_par, ${cles.map(k => '@' + k).join(', ')})
      ON CONFLICT(id_modelo) DO UPDATE SET
        ${cles.map(k => `${k} = excluded.${k}`).join(', ')},
        appel_id = excluded.appel_id,
        saisi_par = excluded.saisi_par,
        updated_at = datetime('now')
    `).run({ id_modelo: c.id_modelo, appel_id: appel?.id || null, saisi_par: moi.nom_complet, ...valeurs });

    // Journal : ce qui change, et par rapport à quoi. Une correction ne doit
    // pas effacer sans laisser de trace.
    const modifs = {};
    for (const k of cles) {
      const ancien = avant ? avant[k] : null;
      if (String(ancien ?? '') !== String(valeurs[k] ?? '')) modifs[k] = { avant: ancien, apres: valeurs[k] };
    }
    if (Object.keys(modifs).length) {
      db.prepare(`INSERT INTO op_resultats_journal (id_modelo, appel_id, auteur, champs)
        VALUES (?,?,?,?)`).run(c.id_modelo, appel?.id || null, moi.nom_complet, JSON.stringify(modifs));
    }
  });
  ecrire();

  res.json({ ok: true, resultat: db.prepare('SELECT * FROM op_resultats WHERE id_modelo = ?').get(c.id_modelo) });
});

// Rattacher une fiche à l'agence de son conseiller.
//
// Sert aux cas où l'agence venue de Modelo ne correspond plus à qui travaille
// la fiche — le manager d'agence ne verrait alors jamais ce que son conseiller
// y fait.
router.post('/contacts/:id/agence', pilotage, (req, res) => {
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });

  // Sans agence fournie, on prend celle du conseiller qui suit la fiche.
  let agence = typeof req.body?.agence === 'string' ? req.body.agence.trim() : null;
  if (!agence && c.conseiller) {
    const u = db.prepare(
      "SELECT agence FROM users WHERE LOWER(TRIM(prenom || ' ' || nom)) = LOWER(?)").get(c.conseiller);
    agence = u?.agence || null;
  }
  if (!agence) return res.status(400).json({ error: 'Aucune agence à appliquer' });

  db.prepare("UPDATE op_contacts SET agence = ?, updated_at = datetime('now') WHERE id_modelo = ?")
    .run(agence, c.id_modelo);
  res.json({ ok: true, avant: c.agence, apres: agence });
});

// --- Les fiches à vérifier avant d'appeler ---------------------------------
//
// 46 contacts dont on n'est pas certain qu'ils aient vendu chez nous : appariés
// sur un seul mot du nom, ou sans correspondance au registre des 663 ventes.
// Le champ `partie_au_registre` porte le nom exact tel qu'il y figure — c'est
// lui qui permet de trancher, à l'œil, sans appeler.
router.get('/a-verifier', pilotage, (req, res) => {
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });
  const { where, params } = perimetre(moi, 'c');
  const lignes = db.prepare(`
    SELECT c.id_modelo, c.civilite, c.nom, c.prenom, c.commune, c.conseiller,
           c.partie_au_registre, c.bien_concerne, c.courrier_motif, c.script, c.a_verifier,
           c.tel_portable, c.tel_fixe, c.verifie, c.verifie_par
    FROM op_contacts c
    WHERE ${where} AND c.a_verifier = 1
    ORDER BY c.verifie IS NOT NULL, c.nom`).all(...params);
  res.json({
    lignes,
    restantes: lignes.filter(l => !l.verifie).length,
  });
});

// Trancher : « c'est bien la bonne personne » ou « ce n'est pas elle ».
router.post('/contacts/:id/verifier', pilotage, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });

  const verdict = req.body?.verdict;
  if (!['CONFIRME', 'ECARTE'].includes(verdict))
    return res.status(400).json({ error: 'Verdict attendu : CONFIRME ou ECARTE' });

  db.transaction(() => {
    db.prepare(`UPDATE op_contacts SET verifie = ?, verifie_par = ?, updated_at = datetime('now')
      WHERE id_modelo = ?`).run(verdict, moi.nom_complet, c.id_modelo);

    // Écartée : on ne l'appellera pas. On la sort de toute file en posant
    // l'opposition, et on trace pourquoi.
    if (verdict === 'ECARTE') {
      db.prepare(`INSERT INTO op_journal_opposition (id_modelo, canal, origine, agent, nom, prenom, telephone)
        VALUES (?, 'TELEPHONE', 'IDENTITE_NON_ETABLIE', ?, ?, ?, ?)`)
        .run(c.id_modelo, moi.nom_complet, c.nom, c.prenom, c.tel_portable || c.tel_fixe);
      db.prepare("UPDATE op_contacts SET stop_telephone = 1 WHERE id_modelo = ?").run(c.id_modelo);
    }
  })();

  res.json({ ok: true, verdict });
});

// --- Démonstration -----------------------------------------------------
//
// Montrer les quatre scripts devant quinze personnes sans toucher aux vraies
// fiches. Réservé au compte qui anime la présentation : un onglet de plus sur
// les écrans de tout le monde serait un onglet de trop.
const ANIMATEUR = 'performance@lequai-immobilier.com';
const estAnimateur = (req) => (req.user?.email || '').toLowerCase() === ANIMATEUR;

router.get('/demo', requireRole('admin'), (req, res) => {
  if (!estAnimateur(req)) return res.status(403).json({ error: 'Réservé à l\'animateur' });
  const moi = identite(req);
  const fiches = D.fichesDemo(moi?.nom_complet || 'Démonstration', moi?.agence || null)
    .map(c => ({ ...c, entete: S.enTete(c), avertissements: [] }));
  res.json({ demo: true, total: fiches.length, fiches });
});

// --- Corriger l'attribution d'une fiche ------------------------------------
//
// Sert aux écarts constatés avec Modelo : un conseiller qui n'est pas le bon,
// un conseiller précédent inconnu de l'application, une fiche à renvoyer au
// pot commun. Le script n'est jamais recalculé — il dépend de données Modelo
// que l'application n'a pas — mais il peut être corrigé explicitement.
router.put('/contacts/:id/attribution', pilotage, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });

  const b = req.body || {};
  const champs = {};

  // Attribuer, ou renvoyer au pot commun avec la chaîne vide.
  if (b.conseiller !== undefined) {
    const vers = String(b.conseiller).trim();
    if (vers) {
      const compte = db.prepare(
        "SELECT agence FROM users WHERE LOWER(TRIM(prenom || ' ' || nom)) = LOWER(?) AND actif = 1").get(vers);
      if (!compte) return res.status(400).json({ error: `${vers} n'a pas de compte actif` });
      champs.conseiller = vers;
      champs.a_dispatcher = 0;
      if (compte.agence) champs.agence = compte.agence;
    } else {
      champs.conseiller = null;
      champs.a_dispatcher = 1;
    }
  }

  // Le conseiller précédent décide de ce que l'agent prononce à l'ouverture.
  if (b.conseiller_precedent !== undefined) {
    const prec = String(b.conseiller_precedent).trim();
    champs.conseiller_precedent = prec || null;
    // Le prénom à dire en découle, sauf s'il est fourni explicitement.
    if (b.prenom_a_dire === undefined) {
      champs.prenom_a_dire = prec ? prec.split(/\s+/)[0] : null;
    }
  }
  if (b.prenom_a_dire !== undefined) champs.prenom_a_dire = String(b.prenom_a_dire).trim() || null;

  if (b.dossier_repris !== undefined) champs.dossier_repris = b.dossier_repris ? 1 : 0;
  if (b.script !== undefined) {
    const sc = parseInt(b.script, 10);
    if (!(sc >= 1 && sc <= 4)) return res.status(400).json({ error: 'Script attendu entre 1 et 4' });
    champs.script = sc;
  }
  if (b.point_attention !== undefined) champs.point_attention = String(b.point_attention).trim() || null;
  if (b.suggestion_base !== undefined) champs.suggestion_base = String(b.suggestion_base).trim() || null;
  if (b.situation !== undefined) champs.situation = String(b.situation).trim() || null;
  if (b.stop_telephone !== undefined) champs.stop_telephone = b.stop_telephone ? 1 : 0;
  if (b.email !== undefined) champs.email = String(b.email).trim() || null;
  if (b.email_valide !== undefined) champs.email_valide = b.email_valide ? 1 : 0;
  if (b.fiche_a_corriger !== undefined) champs.fiche_a_corriger = b.fiche_a_corriger ? 1 : 0;

  const cles = Object.keys(champs);
  if (!cles.length) return res.status(400).json({ error: 'Rien à corriger' });

  db.prepare(`UPDATE op_contacts SET ${cles.map(k => `${k} = @${k}`).join(', ')},
    updated_at = datetime('now') WHERE id_modelo = @id`).run({ ...champs, id: c.id_modelo });

  res.json({ ok: true, avant: c, apres: getContact(c.id_modelo), champs: cles });
});

// Sortir une fiche de l'opération : elle rejoint la liste noire avec son motif.
router.post('/contacts/:id/exclure', pilotage, (req, res) => {
  const moi = identite(req);
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ error: 'Un motif est requis' });

  db.transaction(() => {
    db.prepare(`INSERT INTO op_exclus (id_modelo, nom, prenom, motif, conseiller)
      VALUES (?,?,?,?,?)
      ON CONFLICT(id_modelo) DO UPDATE SET motif = excluded.motif`)
      .run(c.id_modelo, c.nom, c.prenom, motif, c.conseiller);
    db.prepare('DELETE FROM op_contacts WHERE id_modelo = ?').run(c.id_modelo);
  })();

  res.json({ ok: true, exclu: c.id_modelo, motif });
});

// --- NPAI : le courrier est revenu ----------------------------------------
//
// Saisi par le manager au fil des retours. Bascule la fiche en objectif
// adresse : on sait désormais que l'adresse est fausse, et c'est elle qu'il
// faut récupérer au téléphone.
router.post('/contacts/:id/npai', pilotage, (req, res) => {
  const c = getContact(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable' });
  const npai = req.body?.npai !== false;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO op_resultats (id_modelo, npai, npai_le)
      VALUES (?, ?, ?)
      ON CONFLICT(id_modelo) DO UPDATE SET npai = excluded.npai, npai_le = excluded.npai_le,
        updated_at = datetime('now')`)
      .run(c.id_modelo, npai ? 1 : 0, npai ? new Date().toISOString().slice(0, 10) : null);

    // L'objectif de l'appel change : ce n'est plus l'actualisation, c'est
    // l'adresse. La fiche remonte dans la file du conseiller.
    if (npai) {
      db.prepare(`UPDATE op_contacts
        SET adresse_fiable = 0, updated_at = datetime('now')
        WHERE id_modelo = ?`).run(c.id_modelo);
    }
  })();

  res.json({ ok: true, contact: enrichir(getContact(c.id_modelo)) });
});

// Récapitulatif des appels passés, pour la réunion ou le suivi personnel.
// Un conseiller voit les siens, un manager ceux de son périmètre.
router.get('/recap', conseillerOuPlus, (req, res) => {
  const moi = identite(req);
  const { where, params } = perimetre(moi, 'c');
  const depuis = String(req.query.depuis || '').trim() || null;

  const lignes = db.prepare(`
    SELECT a.id, a.horodatage, a.issue, a.notes, a.rappel_le, a.hors_cadre, a.conseiller,
      c.id_modelo, c.civilite, c.nom, c.prenom, c.commune, c.script,
      c.tel_portable, c.tel_fixe, c.email,
      r.adresse_maj, r.code_postal_maj, r.commune_maj, r.actualisation, r.date_rdv,
      r.soiree, r.panneau, r.projet, r.projet_echeance,
      r.recommandation_nom, r.recommandation_tel, r.recommandation_motif,
      r.courrier_renvoye, r.toujours_proprietaire
    FROM op_appels a
    JOIN op_contacts c ON c.id_modelo = a.id_modelo
    LEFT JOIN op_resultats r ON r.id_modelo = a.id_modelo
    WHERE ${where} ${depuis ? "AND date(a.horodatage) >= date(?)" : ''}
    ORDER BY a.horodatage DESC
  `).all(...params, ...(depuis ? [depuis] : []));

  res.json({ appels: lignes, total: lignes.length });
});

// --- Dispatch des orphelins (pilotage) --------------------------------------
router.get('/dispatch', pilotage, (req, res) => {
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });

  // Un manager d'agence ne répartit que les fiches de son agence : il voyait
  // les 340 des deux agences, alors que son pilotage était bien restreint.
  const { where, params } = perimetre(moi, 'c');
  const lignes = db.prepare(`
    SELECT c.id_modelo, c.nom, c.prenom, c.commune, c.code_postal, c.courrier_etat, c.script,
           c.bien_concerne, c.situation, c.suggestion_conseiller, c.suggestion_base,
           c.conseiller_precedent, c.point_attention, c.agence,
           -- De quoi filtrer : qui suivait, où est le bien, et de quel type.
           c.bien_type, c.bien_commune
    FROM op_contacts c WHERE ${where} AND c.a_dispatcher = 1
    ORDER BY c.suggestion_base, c.conseiller_precedent, c.nom`).all(...params);

  // Le compteur du contrat : ce que chacun a, ce qu'il recevrait si on suivait
  // toutes les suggestions. La règle géographique indique, elle n'arbitre pas
  // la charge — Tara couvre Grenoble et récupérerait 109 fiches de plus.
  const charge = db.prepare(`
    SELECT c.conseiller AS nom, COUNT(*) n FROM op_contacts c
    WHERE ${where} AND c.a_dispatcher = 0 AND c.conseiller IS NOT NULL
    GROUP BY c.conseiller`).all(...params);
  const suggere = db.prepare(`
    SELECT c.suggestion_conseiller AS nom, COUNT(*) n FROM op_contacts c
    WHERE ${where} AND c.a_dispatcher = 1 AND c.suggestion_conseiller IS NOT NULL
    GROUP BY c.suggestion_conseiller`).all(...params);

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
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });
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

  // L'agence de la fiche suit son conseiller : une orpheline attribuée à
  // Saint-Égrève bascule en Saint-Égrève. Sans cela, les 363 orphelines
  // resteraient comptées à Meylan quel qu'en soit l'attributaire, et le
  // manager de Saint-Égrève ne verrait jamais le travail de ses conseillers
  // sur ces fiches.
  const compte = db.prepare(
    "SELECT agence FROM users WHERE LOWER(TRIM(prenom || ' ' || nom)) = LOWER(?) AND actif = 1").get(vers);
  const agenceCible = compte?.agence || null;

  const maj = db.prepare(`UPDATE op_contacts
     SET conseiller = ?, a_dispatcher = 0,
         agence = COALESCE(?, agence),
         updated_at = datetime('now')
     WHERE id_modelo = ? AND a_dispatcher = 1`);
  let n = 0;
  db.transaction(() => { for (const id of ids) n += maj.run(vers, agenceCible, id).changes; })();

  const { where: w2, params: p2 } = perimetre(moi, 'c');
  const restantes = db.prepare(
    `SELECT COUNT(*) n FROM op_contacts c WHERE ${w2} AND c.a_dispatcher = 1`).get(...p2).n;
  res.json({ ok: true, attribuees: n, restantes });
});

// --- Listing : toutes les fiches, avec leur état ---------------------------
//
// La vue d'ensemble du manager : qui a été appelé, par qui, avec quel résultat.
// Le pilotage donne des totaux ; ici on descend à la fiche, pour répondre à
// « où en est Untel sur son portefeuille » et « qu'est-ce qu'il a obtenu ».
router.get('/listing', pilotage, (req, res) => {
  const moi = identite(req);
  if (!moi) return res.status(401).json({ error: 'Compte introuvable' });
  const { where, params } = perimetre(moi, 'c');

  const lignes = db.prepare(`
    SELECT
      c.id_modelo, c.civilite, c.nom, c.prenom, c.commune, c.conseiller, c.agence,
      c.script, c.courrier_etat, c.a_dispatcher, c.a_verifier, c.verifie,
      c.stop_telephone, c.stop_mail, c.email, c.tel_portable, c.tel_fixe,
      c.bien_type, c.bien_commune, c.adresse_fiable, c.point_attention,
      c.conseiller_precedent, c.prenom_a_dire, c.dossier_repris,

      (SELECT COUNT(*) FROM op_appels a WHERE a.id_modelo = c.id_modelo)        AS appels,
      (SELECT MAX(a.horodatage) FROM op_appels a WHERE a.id_modelo = c.id_modelo) AS dernier_le,
      (SELECT a.issue FROM op_appels a WHERE a.id_modelo = c.id_modelo
        ORDER BY a.horodatage DESC LIMIT 1)                                     AS derniere_issue,
      (SELECT a.conseiller FROM op_appels a WHERE a.id_modelo = c.id_modelo
        ORDER BY a.horodatage DESC LIMIT 1)                                     AS dernier_par,
      (SELECT a.notes FROM op_appels a WHERE a.id_modelo = c.id_modelo
        AND a.notes IS NOT NULL ORDER BY a.horodatage DESC LIMIT 1)             AS derniere_note,
      (SELECT a.rappel_le FROM op_appels a WHERE a.id_modelo = c.id_modelo
        AND a.issue = 'A_RAPPELER' ORDER BY a.horodatage DESC LIMIT 1)          AS rappel_le,

      r.actualisation, r.date_rdv, r.soiree, r.panneau, r.fiche_confirmee,
      r.adresse_maj, r.projet, r.projet_echeance, r.courrier_renvoye,
      r.recommandation_nom, r.toujours_proprietaire
    FROM op_contacts c
    LEFT JOIN op_resultats r ON r.id_modelo = c.id_modelo
    WHERE ${where}
    ORDER BY c.conseiller, c.nom, c.prenom`).all(...params);

  // L'état d'une fiche en un mot : c'est ce qu'on lit en premier dans un
  // tableau de 1 088 lignes.
  const etat = (l) => {
    if (l.a_dispatcher) return 'A_DISPATCHER';
    if (l.a_verifier && !l.verifie) return 'A_VERIFIER';
    if (!l.appels) return 'JAMAIS_APPELE';
    if (['REFUS_FERME', 'DECEDE'].includes(l.derniere_issue)) return 'CLOS';
    if (l.derniere_issue === 'A_RAPPELER') return 'A_RAPPELER';
    if (l.derniere_issue === 'JOINT') return 'JOINT';
    return 'A_RELANCER';
  };

  const avecEtat = lignes.map(l => ({ ...l, etat: etat(l) }));
  const compte = {};
  avecEtat.forEach(l => { compte[l.etat] = (compte[l.etat] || 0) + 1; });

  // De quoi réattribuer sans quitter l'écran. Le périmètre d'un manager borne
  // la liste comme il borne les fiches : on ne donne pas à l'autre agence.
  const conseillers = db.prepare(`
    SELECT TRIM(prenom || ' ' || nom) AS nom, agence FROM users
    WHERE actif = 1 AND role IN ('conseiller', 'manager', 'admin')
    ${moi.role === 'manager' && moi.agence ? 'AND (agence = ? OR agence IS NULL)' : ''}
    ORDER BY prenom`).all(...(moi.role === 'manager' && moi.agence ? [moi.agence] : []));

  res.json({ lignes: avecEtat, total: avecEtat.length, par_etat: compte, conseillers });
});

// --- Contrôle des adresses mail -------------------------------------------
//
// Une fiche client ne doit jamais porter l'adresse d'un conseiller, de
// l'agence ou d'un confrère : le « renvoyer le courrier » enverrait le pli à
// l'agent plutôt qu'au client, et le mail serait compté comme envoyé.
router.get('/controle-mails', pilotage, (req, res) => {
  const SUSPECTS = ['lequai-immobilier', 'kwfrance', 'keller', 'orpi', 'century21',
    'laforet', 'guyhoquet', 'guy-hoquet', 'iadfrance', 'safti', 'optimhome',
    'nestenn', 'stephaneplaza', 'capifrance', 'era-immobilier', 'foncia', 'citya'];

  const clauses = SUSPECTS.map(() => "LOWER(COALESCE(email,'')) LIKE ?").join(' OR ');
  const motifs = SUSPECTS.map(d => `%@%${d}%`);

  const suspectes = db.prepare(`
    SELECT id_modelo, nom, prenom, email, conseiller, a_dispatcher, fiche_a_corriger
    FROM op_contacts WHERE email IS NOT NULL AND (${clauses})
    ORDER BY email`).all(...motifs);

  // Une même adresse sur plusieurs fiches : souvent celle d'un agent, ou un
  // couple dont les deux fiches portent le même mail.
  const partagees = db.prepare(`
    SELECT LOWER(email) AS email, COUNT(*) n,
           GROUP_CONCAT(id_modelo || ' ' || nom, ' | ') AS fiches
    FROM op_contacts WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY LOWER(email) HAVING n > 1 ORDER BY n DESC, email`).all();

  res.json({ suspectes, partagees, total: db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n });
});

// --- Import du fichier Modelo ----------------------------------------------
//
// Réservé à l'admin. La simulation est le comportement par défaut : on ne
// touche pas à 1 088 fiches sans avoir vu le compte rendu d'abord.
// Liste noire : à charger avant ou après les contacts, l'ordre est indifférent.
router.post('/import-exclus', requireRole('admin'), (req, res) => {
  const csv = req.body?.csv;
  if (typeof csv !== 'string' || !csv.trim())
    return res.status(400).json({ error: 'Aucun contenu à importer' });
  const r = I.importerExclus(csv);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

router.post('/import', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (typeof b.csv !== 'string' || !b.csv.trim())
    return res.status(400).json({ error: 'Aucun contenu à importer' });

  const simulation = b.ecrire !== true;
  const r = I.importer(b.csv, {
    simulation,
    motDePasseProvisoire: simulation ? null : (b.mot_de_passe || null),
    userId: req.user.id,
    fichier: b.fichier || null,
  });
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
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

    // « Appelés » comptait les tentatives, répondeurs compris : trois rendez-vous
    // sur dix personnes jointes et trois sur quatre-vingts ne disent pas la même
    // chose. On distingue donc tentés et joints.
    //
    // La durée moyenne et la part d'appels annotés sont les deux signaux qui
    // montrent un conseiller en train de décrocher : un appel qui passe de six
    // minutes à quatre-vingt-dix secondes, c'est quelqu'un qui expédie.
    avancement: joint(`
      SELECT c.conseiller,
        COUNT(*) AS portefeuille,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
                 THEN 1 ELSE 0 END) AS appeles,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo
                              AND a.issue = 'JOINT') THEN 1 ELSE 0 END) AS joints
      FROM op_contacts c WHERE ${where} AND c.a_dispatcher = 0
      GROUP BY c.conseiller ORDER BY portefeuille DESC`, ...params),

    // Signaux de décrochage, par conseiller, sur les sept derniers jours.
    signaux: joint(`
      SELECT a.conseiller,
        COUNT(*) AS appels,
        ROUND(AVG(NULLIF(a.duree_sec, 0))) AS duree_moyenne_sec,
        SUM(CASE WHEN a.notes IS NOT NULL AND TRIM(a.notes) <> '' THEN 1 ELSE 0 END) AS avec_note,
        SUM(CASE WHEN a.hors_cadre IS NOT NULL THEN 1 ELSE 0 END) AS hors_cadre,
        SUM(CASE WHEN a.issue = 'REFUS_FERME' THEN 1 ELSE 0 END) AS refus
      FROM op_appels a JOIN op_contacts c ON c.id_modelo = a.id_modelo
      WHERE ${where} AND date(a.horodatage) >= date('now','-7 day')
      GROUP BY a.conseiller ORDER BY appels DESC`, ...params),

    // Les fiches dont l'identité n'est pas établie : elles ne devraient pas
    // être appelées avant vérification.
    a_verifier: db.prepare(`SELECT COUNT(*) n FROM op_contacts c
      WHERE ${where} AND c.a_verifier = 1 AND c.verifie IS NULL`).get(...params).n,

    // Les quatre objectifs, au même rang (arbitrage du 20 octobre).
    // « Fiches à jour » est le quatrième : il ne se propose pas au client, il
    // se recueille — mais il se compte comme les autres, et il concerne les
    // 1 088, pas seulement les fiches sans adresse.
    resultats: db.prepare(`
      SELECT
        SUM(CASE WHEN r.actualisation = 'ACCEPTEE' THEN 1 ELSE 0 END) AS estimations,
        SUM(CASE WHEN r.soiree = 1 THEN 1 ELSE 0 END)                 AS soiree,
        SUM(CASE WHEN r.panneau = 1 THEN 1 ELSE 0 END)                AS panneau,
        SUM(CASE WHEN r.adresse_maj IS NOT NULL OR r.statut_actuel IS NOT NULL
                   OR r.projet IS NOT NULL OR r.toujours_proprietaire IS NOT NULL
                   OR r.fiche_confirmee = 1
                 THEN 1 ELSE 0 END)                                   AS fiches_a_jour,
        SUM(CASE WHEN r.adresse_maj IS NOT NULL THEN 1 ELSE 0 END)    AS adresses_maj,
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
