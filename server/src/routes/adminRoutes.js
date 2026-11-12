const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const { journaliser } = require('../utils/journal');

// 'conseiller' manquait : on ne pouvait ni en créer un, ni modifier le rôle
// de l'un des quinze créés par l'import de l'opération.
const ROLES_VALIDES = ['agent', 'manager', 'admin', 'courtage', 'conseiller'];

const router = express.Router();
router.use(requireAuth, requireRole('manager', 'admin'));

// Utilisateurs — la liste des comptes est réservée à l'admin.
//
// Un manager pilote une équipe, il n'administre pas les accès : la route
// n'était gardée que par `requireRole('manager','admin')` au niveau du
// routeur, si bien qu'un manager pouvait lire, modifier et désactiver
// n'importe quel compte, y compris celui d'un admin.
// Sauvegarde de la base — admin seulement.
//
// `GET /sauvegarde` produit une copie fraîche et la livre en téléchargement :
// c'est le seul filet contre la perte du volume, et il tient en un clic chaque
// soir. `GET /sauvegardes` liste celles que le serveur écrit toutes les six
// heures, pour vérifier qu'il le fait.
router.get('/sauvegarde', requireRole('admin'), async (req, res) => {
  const S = require('../sauvegarde');
  try {
    const f = await S.sauvegarder();
    res.download(f, require('path').basename(f));
  } catch (e) {
    console.error('[sauvegarde] téléchargement —', e);
    res.status(500).json({ error: 'La sauvegarde a échoué.' });
  }
});

router.get('/sauvegardes', requireRole('admin'), (req, res) => {
  const S = require('../sauvegarde');
  res.json({ dossier: require('path').basename(S.DOSSIER), fichiers: S.lister() });
});

router.get('/users', requireRole('admin'), (req, res) => {
  // `agence` restreint un manager à son agence : sans elle à l'écran, on ne
  // voyait pas qui était rattaché à quoi.
  res.json(db.prepare(`SELECT id, nom, prenom, email, role, agence, actif,
    must_change_password, created_at, last_login FROM users`).all());
});

router.post('/users', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, password, role, agence } = req.body;
  if (!ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (!nom || !prenom || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    // Le mot de passe saisi ici est provisoire : la personne en choisit un
    // autre à sa première connexion, comme pour les comptes importés. Sans ce
    // drapeau, celui tapé par l'admin restait définitif — et connu de lui.
    const result = db.prepare(`INSERT INTO users (nom, prenom, email, password, role, agence, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .run(nom.trim(), prenom.trim(), email.toLowerCase().trim(), bcrypt.hashSync(String(password).trim(), 10), role, agence || null);
    journaliser(req.user, 'COMPTE_CREE', { details: { compte: `${prenom.trim()} ${nom.trim()}`, email: email.toLowerCase().trim(), role, agence: agence || null } });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

router.put('/users/:id', requireRole('admin'), (req, res) => {
  const { nom, prenom, email, role, actif, password, must_change_password, agence } = req.body;
  if (role !== undefined && !ROLES_VALIDES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (password) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  // Forcer (1) ou lever (0) le changement de mot de passe a la prochaine connexion :
  // utile quand on confie un mot de passe provisoire a un nouvel utilisateur.
  if (must_change_password !== undefined) {
    db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?')
      .run(must_change_password ? 1 : 0, req.params.id);
  }
  // `agence` accepte la chaîne vide pour détacher quelqu'un de son agence :
  // COALESCE ne suffirait pas, il faut distinguer « non fourni » de « vidé ».
  if (agence !== undefined) {
    db.prepare('UPDATE users SET agence = ? WHERE id = ?').run(agence || null, req.params.id);
  }
  // L'email est normalisé comme à la création et au login : une majuscule
  // saisie ici rendait le compte impossible à ouvrir, sans message.
  const emailNorm = email == null ? null : String(email).toLowerCase().trim();
  db.prepare(`UPDATE users SET nom = COALESCE(?, nom), prenom = COALESCE(?, prenom),
    email = COALESCE(?, email), role = COALESCE(?, role), actif = COALESCE(?, actif) WHERE id = ?`)
    .run(nom, prenom, emailNorm, role, actif, req.params.id);
  {
    const cible = db.prepare('SELECT prenom, nom FROM users WHERE id = ?').get(req.params.id);
    const champs = {};
    if (nom != null) champs.nom = nom; if (prenom != null) champs.prenom = prenom;
    if (emailNorm != null) champs.email = emailNorm; if (role != null) champs.role = role;
    if (actif != null) champs.actif = actif; if (agence !== undefined) champs.agence = agence;
    if (password) champs.mot_de_passe = 'réinitialisé';
    if (must_change_password !== undefined) champs.changement_impose = !!must_change_password;
    journaliser(req.user, 'COMPTE_MODIFIE', { details: { compte: cible ? `${cible.prenom} ${cible.nom}` : `#${req.params.id}`, ...champs } });
  }
  res.json({ ok: true });
});

// Activité — admin seulement.
//
// Tout ce qui s'est passé, par qui, quand : le journal (connexions, comptes,
// NPAI, exclusions, vérifications, agence, appels effacés, imports) réuni en
// lecture aux tables qui existaient déjà (appels, mises à jour de fiche,
// attributions, oppositions). Filtres : période, personne, type. Les dates
// sont en UTC comme partout ; l'écran les affiche en heure française.
router.get('/activite', requireRole('admin'), (req, res) => {
  const depuis = /^\d{4}-\d{2}-\d{2}$/.test(req.query.depuis || '') ? req.query.depuis : null;
  const jusqua = /^\d{4}-\d{2}-\d{2}$/.test(req.query.jusqua || '') ? req.query.jusqua : null;
  const personne = String(req.query.personne || '').trim();
  const type = String(req.query.type || '').trim();
  const limite = Math.min(parseInt(req.query.limite, 10) || 2000, 10000);

  const union = `
    SELECT j.le AS le, j.auteur AS auteur, j.action AS type, j.id_modelo AS id_modelo, j.details AS details
      FROM op_journal j
    UNION ALL
    SELECT a.horodatage, a.conseiller, 'APPEL', a.id_modelo,
           json_object('issue', CASE WHEN a.canal = 'SMS' THEN 'SMS' ELSE a.issue END, 'rappel_le', a.rappel_le, 'duree_sec', a.duree_sec, 'hors_cadre', a.hors_cadre)
      FROM op_appels a
    UNION ALL
    SELECT r.horodatage, r.auteur, 'MAJ_FICHE', r.id_modelo, r.champs
      FROM op_resultats_journal r
    UNION ALL
    SELECT t.le, t.par, 'ATTRIBUTION', t.id_modelo,
           json_object('de', t.de, 'vers', t.vers, 'source', t.source, 'reprise', t.reprise)
      FROM op_attributions t
    UNION ALL
    SELECT o.horodatage, o.agent, 'OPPOSITION', o.id_modelo,
           json_object('canal', o.canal, 'origine', o.origine)
      FROM op_journal_opposition o`;

  const conditions = []; const params = [];
  if (depuis) { conditions.push("date(e.le, 'localtime') >= ?"); params.push(depuis); }
  if (jusqua) { conditions.push("date(e.le, 'localtime') <= ?"); params.push(jusqua); }
  if (personne) { conditions.push('sans_casse(e.auteur) = sans_casse(?)'); params.push(personne); }
  if (type) { conditions.push('e.type = ?'); params.push(type); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const lignes = db.prepare(`
    SELECT e.le, e.auteur, e.type, e.id_modelo, e.details, c.nom, c.prenom, c.conseiller
    FROM (${union}) e
    LEFT JOIN op_contacts c ON c.id_modelo = e.id_modelo
    ${where}
    ORDER BY e.le DESC
    LIMIT ?`).all(...params, limite);

  const personnes = db.prepare(`SELECT DISTINCT auteur FROM (${union}) WHERE auteur IS NOT NULL ORDER BY auteur`).all().map(r => r.auteur);
  const types = db.prepare(`SELECT type, COUNT(*) n FROM (${union}) GROUP BY type ORDER BY type`).all();

  res.json({ lignes, total: lignes.length, personnes, types });
});

// Les personnes qu'un manager ou un admin peut suivre (sélecteurs de Supervision
// et de la vue « par-dessus l'épaule »). La liste complète des comptes reste
// réservée à l'admin : faute de cette route, l'écran Supervision d'un manager
// restait bloqué sur « Chargement… ».
router.get('/agents', (req, res) => {
  // `?courtage=1` : le sélecteur « Vue » de la session propose aussi le courtage.
  const roles = req.query.courtage === '1' ? "'agent','manager','admin','courtage'" : "'agent','manager','admin'";
  res.json(db.prepare(`SELECT id, nom, prenom, role, agence, actif FROM users WHERE actif = 1 AND role IN (${roles}) ORDER BY nom, prenom`).all());
});

// --- Fichiers (« blocs ») : qui travaille sur quoi -------------------------
// Réservé à l'admin. Créer un fichier, régler ses délais, dire qui y a accès.
// Le fichier 1 (historique) ne peut pas être désactivé.
const B = require('../blocs');
const lireChamps = (t) => { try { const v = JSON.parse(t || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

router.get('/blocs', requireRole('admin'), (req, res) => {
  const blocs = db.prepare('SELECT * FROM blocs ORDER BY actif DESC, id').all().map(b => ({
    ...b, champs: lireChamps(b.champs),
    nb_contacts: db.prepare('SELECT COUNT(*) n FROM contacts WHERE bloc_id = ? AND supprime_le IS NULL').get(b.id).n,
    acces: db.prepare('SELECT user_id FROM bloc_acces WHERE bloc_id = ?').all(b.id).map(r => r.user_id),
  }));
  const agents = db.prepare("SELECT id, nom, prenom, role, agence FROM users WHERE actif = 1 AND role = 'agent' ORDER BY nom, prenom").all();
  res.json({ blocs, agents });
});

function champsDuBloc(body) {
  const delai = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
  const d1 = delai(body.delai_sans_reponse_jours), d2 = delai(body.relance_sans_projet_jours);
  if ((d1 !== null && !(d1 >= 1 && d1 <= 365)) || (d2 !== null && !(d2 >= 1 && d2 <= 3650))) return { erreur: 'Délai invalide' };
  const champs = Array.isArray(body.champs)
    ? body.champs.filter(c => c && c.cle && c.libelle).map(c => ({ cle: String(c.cle).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40), libelle: String(c.libelle).trim().slice(0, 60), type: ['texte', 'nombre', 'date'].includes(c.type) ? c.type : 'texte' }))
    : undefined;
  return { d1, d2, champs };
}

// La même personne présente dans plusieurs fichiers : à signaler à la direction,
// qui tranche. Lecture seule, rien n'est modifié.
router.get('/doublons-fichiers', requireRole('admin'), (req, res) => {
  res.json(B.doublonsEntreFichiers());
});

router.post('/blocs', requireRole('admin'), (req, res) => {
  const libelle = String(req.body?.libelle || '').trim();
  if (!libelle) return res.status(400).json({ error: 'Nom du fichier requis' });
  const code = String(req.body?.code || libelle).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'fichier';
  const proprietaire = req.body?.proprietaire_id ? parseInt(req.body.proprietaire_id, 10) : null;
  const parent = req.body?.parent_id ? parseInt(req.body.parent_id, 10) : null;
  if (proprietaire && !db.prepare("SELECT 1 FROM users WHERE id = ? AND actif = 1").get(proprietaire)) return res.status(400).json({ error: 'Propriétaire inconnu' });
  if (parent && !db.prepare('SELECT 1 FROM blocs WHERE id = ?').get(parent)) return res.status(400).json({ error: 'Fichier parent inconnu' });
  // Un double clic sur « Créer » ne fait pas deux fichiers du même nom pour la même personne.
  const jumeau = db.prepare('SELECT id FROM blocs WHERE sans_casse(libelle) = sans_casse(?) AND COALESCE(proprietaire_id, 0) = ? AND actif = 1').get(libelle, proprietaire || 0);
  if (jumeau) return res.status(409).json({ error: 'Un fichier porte déjà ce nom', id: jumeau.id });
  const c = champsDuBloc(req.body || {});
  if (c.erreur) return res.status(400).json({ error: c.erreur });
  const r = db.prepare(`INSERT INTO blocs (code, libelle, proprietaire_id, parent_id, agence, delai_sans_reponse_jours, relance_sans_projet_jours, champs)
    VALUES (?,?,?,?,?,?,?,?)`).run(code, libelle, proprietaire, parent, String(req.body?.agence || '').trim() || null, c.d1, c.d2, JSON.stringify(c.champs || []));
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/blocs/:id', requireRole('admin'), (req, res) => {
  const bloc = db.prepare('SELECT * FROM blocs WHERE id = ?').get(req.params.id);
  if (!bloc) return res.status(404).json({ error: 'Fichier inconnu' });
  const body = req.body || {};
  const c = champsDuBloc(body);
  if (c.erreur) return res.status(400).json({ error: c.erreur });
  if (body.actif === false && bloc.id === B.BLOC_HISTORIQUE) return res.status(400).json({ error: 'Le fichier historique ne peut pas être désactivé' });
  if (body.libelle !== undefined && !String(body.libelle).trim()) return res.status(400).json({ error: 'Nom du fichier requis' });
  db.transaction(() => {
    if (body.libelle !== undefined) {
      db.prepare('UPDATE blocs SET libelle = ? WHERE id = ?').run(String(body.libelle).trim(), bloc.id);
    }
    if ('delai_sans_reponse_jours' in body) db.prepare('UPDATE blocs SET delai_sans_reponse_jours = ? WHERE id = ?').run(c.d1, bloc.id);
    if ('relance_sans_projet_jours' in body) db.prepare('UPDATE blocs SET relance_sans_projet_jours = ? WHERE id = ?').run(c.d2, bloc.id);
    if (c.champs !== undefined) db.prepare('UPDATE blocs SET champs = ? WHERE id = ?').run(JSON.stringify(c.champs), bloc.id);
    if (typeof body.actif === 'boolean') db.prepare('UPDATE blocs SET actif = ? WHERE id = ?').run(body.actif ? 1 : 0, bloc.id);
    // Accès : la liste envoyée REMPLACE celle du fichier. Rien d'autre n'est touché :
    // retirer un accès masque le fichier à la personne, ses fiches et ses appels restent.
    if (Array.isArray(body.acces)) {
      const ids = [...new Set(body.acces.map(x => parseInt(x, 10)).filter(Boolean))];
      db.prepare('DELETE FROM bloc_acces WHERE bloc_id = ?').run(bloc.id);
      const ouvrir = db.prepare('INSERT OR IGNORE INTO bloc_acces (bloc_id, user_id) VALUES (?, ?)');
      for (const id of ids) ouvrir.run(bloc.id, id);
    }
  })();
  res.json({ ok: true });
});

// Paramètres
router.get('/parametres', (req, res) => {
  const rows = db.prepare('SELECT * FROM parametres').all();
  const params = {};
  rows.forEach(r => params[r.cle] = r.valeur);
  res.json(params);
});

// L'écran renvoyait TOUT ce qu'il avait chargé : une page ouverte depuis une
// heure réécrivait le modèle de mail de Marine avec son ancienne version, et les
// marqueurs de clôture de session des agents. Désormais : écriture réservée à
// l'admin, l'écran n'envoie que ce qui a changé, et les clés tenues par
// l'application (clôtures de session) ne s'écrivent pas par ici.
const CLES_RESERVEES = /^(session_cloturee_|blocs_acces_initialises$)/;
router.put('/parametres', requireRole('admin'), (req, res) => {
  const update = db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)');
  let ecrites = 0;
  const updateAll = db.transaction((params) => {
    Object.entries(params || {}).forEach(([k, v]) => {
      if (CLES_RESERVEES.test(k) || v === null || v === undefined) return;
      update.run(k, String(v)); ecrites++;
    });
  });
  updateAll(req.body);
  res.json({ ok: true, ecrites });
});

// Supervision temps réel
// « Aujourd'hui » est la journée de Paris, et seuls les appels comptent : une note
// libre ajoutée à une fiche gonflait « Relances » et « Contactés ».
const P = require('../utils/paris');
router.get('/supervision', (req, res) => {
  const today = P.aujourdhuiParis();
  const activite = db.prepare(`
    SELECT u.id, u.nom, u.prenom,
      COUNT(r.id) as relances_total,
      SUM(CASE WHEN r.statut = 'rdv_obtenu' THEN 1 ELSE 0 END) as rdv,
      SUM(CASE WHEN r.statut = 'tente_sans_reponse' THEN 1 ELSE 0 END) as sans_reponse,
      SUM(CASE WHEN r.statut = 'contacte' THEN 1 ELSE 0 END) as contactes,
      MAX(r.created_at) as derniere_relance
    FROM users u LEFT JOIN relances r ON r.agent_id = u.id AND r.type = 'appel'
      AND r.created_at >= ? AND r.created_at < ?
    WHERE u.role = 'agent' AND u.actif = 1 GROUP BY u.id
  `).all(P.debutJourUtc(today), P.debutJourUtc(P.plusJours(today, 1)));

  res.json({ activite, date: today });
});

// Décalage Europe/Paris -> UTC en minutes pour une date donnée (60 hiver, 120 été).
// Déduit du rendu de la date à midi dans le fuseau Paris vs UTC.
function parisOffsetMinutes(dateYmd) {
  const midi = new Date(`${dateYmd}T12:00:00Z`);
  const parisStr = midi.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' });
  const parisHeure = parseInt(parisStr, 10); // 13 (hiver) ou 14 (été) pour 12h UTC
  return (parisHeure - 12) * 60;
}

// Soustrait `min` minutes à un datetime local "YYYY-MM-DDTHH:MM:SS" et renvoie
// la chaîne UTC "YYYY-MM-DD HH:MM:SS" (format created_at SQLite).
function isoUtcMoins(localIso, min) {
  const [d, t] = localIso.split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  // Date UTC construite à partir des composantes locales, puis on retire l'offset.
  const ms = Date.UTC(Y, M - 1, D, h, mi, s) - min * 60000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// Récap des relances d'un agent pour une journée donnée (regénère un récap de
// session perdu : l'agent a fermé l'onglet avant d'éditer/exporter sa fiche).
// Les relances sont persistées à chaque appel, donc reconstructibles ici.
// date = 'YYYY-MM-DD' (défaut : aujourd'hui, fuseau Europe/Paris). Filtre sur la
// date locale Paris pour éviter le décalage UTC en soirée.
router.get('/relances-jour', (req, res) => {
  const agentId = parseInt(req.query.agent_id, 10);
  if (!agentId) return res.status(400).json({ error: 'agent_id requis' });
  // date demandée (YYYY-MM-DD), sinon aujourd'hui en heure de Paris
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date invalide (YYYY-MM-DD)' });

  const agent = db.prepare('SELECT id, nom, prenom FROM users WHERE id = ?').get(agentId);
  if (!agent) return res.status(404).json({ error: 'agent introuvable' });

  // created_at est stocké en UTC. On compare à la journée locale Paris en bornant
  // sur [début, fin[ exprimés en UTC (calculés en JS qui connaît Europe/Paris),
  // pour éviter tout décalage de date en soirée — indépendant du fuseau serveur.
  const offsetMin = parisOffsetMinutes(date); // décalage Paris→UTC ce jour-là (60 ou 120)
  const debutUtc = isoUtcMoins(`${date}T00:00:00`, offsetMin);
  const finUtc = isoUtcMoins(`${date}T24:00:00`, offsetMin);

  const relances = db.prepare(`
    SELECT r.id, r.statut, r.notes, r.prochain_contact, r.created_at,
           c.nom, c.prenom, c.telephone
    FROM relances r
    JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ?
      AND r.created_at >= ? AND r.created_at < ?
    ORDER BY r.created_at ASC
  `).all(agentId, debutUtc, finUtc);

  const stats = {
    total: relances.length,
    rdv: relances.filter(r => r.statut === 'rdv_obtenu').length,
    contactes: relances.filter(r => r.statut === 'contacte').length,
    pasRep: relances.filter(r => r.statut === 'tente_sans_reponse').length,
  };

  res.json({ agent, date, relances, stats });
});

// Vue "par-dessus l'epaule" d'un agent classique (Chrystelle & co), en lecture seule.
// Renvoie ce qu'il/elle a devant les yeux aujourd'hui : sa file d'appel du moment,
// ses rappels planifies et son activite du jour. Aucune ecriture, aucun effet de bord
// sur sa session : on ne fait que lire les memes tables que SessionPage.
router.get('/vue-agent/:id', (req, res) => {
  const agentId = parseInt(req.params.id, 10);
  const agent = db.prepare('SELECT id, nom, prenom, role FROM users WHERE id = ?').get(agentId);
  if (!agent) return res.status(404).json({ error: 'agent introuvable' });

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

  // Meme requete que GET /contacts/file-relances, sur les fichiers ouverts a CET agent.
  const blocsAgent = B.blocsVisibles(agent).map(b => b.id);
  const file = db.prepare(`
    SELECT contacts.id, contacts.nom, contacts.prenom, contacts.telephone, contacts.ville,
           contacts.statut, contacts.score_priorite, contacts.prochain_contact, contacts.categorie,
           CASE WHEN contacts.statut = 'a_contacter' THEN 0 ELSE 1 END AS priorite_groupe
    FROM contacts
    WHERE contacts.statut NOT IN ('pas_interesse', 'inactif')
      AND contacts.supprime_le IS NULL AND ${B.clauseBlocs(blocsAgent)}
      AND (contacts.statut = 'a_contacter'
        OR (contacts.statut IN ('tente_sans_reponse','rappel_planifie','a_recontacter')
            AND contacts.prochain_contact IS NOT NULL AND contacts.prochain_contact <= ?))
    ORDER BY priorite_groupe ASC, contacts.score_priorite DESC, contacts.prochain_contact ASC
    LIMIT 100
  `).all(...blocsAgent, today);

  // Ses rappels a elle : ceux qu'elle a planifies et qui lui restent a traiter.
  const rappels = db.prepare(`
    SELECT c.id, c.nom, c.prenom, c.telephone, c.prochain_contact, c.statut
    FROM contacts c
    WHERE c.prochain_contact IS NOT NULL AND c.supprime_le IS NULL AND ${B.clauseBlocs(blocsAgent, 'c.bloc_id')}
      AND c.statut IN ('rappel_planifie','a_recontacter','tente_sans_reponse')
      AND EXISTS (SELECT 1 FROM relances r WHERE r.contact_id = c.id AND r.agent_id = ?)
    ORDER BY c.prochain_contact ASC LIMIT 100
  `).all(...blocsAgent, agentId);

  // Son activite du jour (heure de Paris), pour savoir ou elle en est.
  const offsetMin = parisOffsetMinutes(today);
  const debutUtc = isoUtcMoins(`${today}T00:00:00`, offsetMin);
  const finUtc = isoUtcMoins(`${today}T24:00:00`, offsetMin);
  const dujour = db.prepare(`
    SELECT r.id, r.statut, r.notes, r.prochain_contact, r.created_at,
           c.nom, c.prenom, c.telephone
    FROM relances r JOIN contacts c ON c.id = r.contact_id
    WHERE r.agent_id = ? AND r.created_at >= ? AND r.created_at < ?
    ORDER BY r.created_at DESC
  `).all(agentId, debutUtc, finUtc);

  res.json({ agent, date: today, file, rappels, dujour });
});

module.exports = router;
