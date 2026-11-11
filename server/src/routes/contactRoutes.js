const express = require('express');
const { db, recalculerScore } = require('../database');
const { normaliserDate, resoudreConseiller } = require('../utils/import-helpers');
const { requireAuth, requireRole } = require('../auth');
const B = require('../blocs');

const CHAMPS_UPDATE = ['nom','prenom','telephone','telephone2','email','adresse','code_postal',
  'ville','categorie','tags','notes','potentiel','statut','prochain_contact',
  'source_import','assigned_to','date_estimation','photo_url','suivi_par_origine','civilite'];

const router = express.Router();
// Le cœur des relances appartient aux agents, managers et admin. Les rôles
// « courtage » et « conseiller » ont leur propre espace : sans cette garde, ils
// pouvaient lire, exporter, modifier et supprimer tous les contacts par l'API.
router.use(requireAuth, requireRole('agent', 'manager', 'admin'));

// Les blocs (fichiers) sur lesquels porte la demande : celui passé en ?bloc_id
// s'il est à la portée de la personne, sinon tous ceux qu'elle voit. Tout
// l'existant est dans le bloc 1, ouvert aux agents en place : sans paramètre,
// chacun retrouve exactement ce qu'il voyait.
function portee(req, res) {
  const ids = B.blocsDeLaDemande(req.user, req.query.bloc_id ?? req.body?.bloc_id);
  if (ids === null) { res.status(403).json({ error: 'Ce fichier ne vous est pas ouvert' }); return null; }
  return ids;
}

// Liste avec filtres et pagination
router.get('/', (req, res) => {
  const {
    page = 1, limit = 50, search = '', categorie = '', statut = '',
    sort = 'score_priorite', order = 'DESC', tag = '',
    assigned_to = '', source = '', ville = ''
  } = req.query;

  const blocs = portee(req, res); if (!blocs) return;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  // Jamais une fiche supprimée, jamais une fiche d'un fichier fermé à la personne.
  const conditions = ['contacts.supprime_le IS NULL', B.clauseBlocs(blocs)];
  const params = [...blocs];

  if (search) {
    conditions.push(`(contacts.nom LIKE ? OR contacts.prenom LIKE ? OR contacts.telephone LIKE ? OR contacts.email LIKE ? OR contacts.ville LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  if (categorie) { conditions.push('contacts.categorie = ?'); params.push(categorie); }
  if (statut) { conditions.push('contacts.statut = ?'); params.push(statut); }
  if (tag) { conditions.push(`contacts.tags LIKE ?`); params.push(`%"${tag}"%`); }
  if (assigned_to) { conditions.push('contacts.assigned_to = ?'); params.push(parseInt(assigned_to, 10)); }
  if (source) { conditions.push('contacts.source_import = ?'); params.push(source); }
  if (ville) { conditions.push('contacts.ville LIKE ?'); params.push(`%${ville}%`); }

const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const validSorts = ['score_priorite', 'nom', 'telephone', 'ville', 'date_dernier_contact', 'prochain_contact', 'created_at', 'categorie', 'statut', 'derniere_relance_date'];
  const sortCol = validSorts.includes(sort) ? sort : 'score_priorite';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM contacts ${where}`).get(...params).cnt;
  const contacts = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom,
      dr.issue AS derniere_issue, dr.notes AS derniere_note, dr.created_at AS derniere_relance_date
    FROM contacts
    LEFT JOIN users u ON u.id = contacts.assigned_to
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ${where}
    ORDER BY ${sortCol === 'derniere_relance_date' ? 'derniere_relance_date' : 'contacts.' + sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  res.json({ contacts, total, page: parseInt(page), limit: parseInt(limit) });
});

// File de relances du jour (sans limite : tous les contacts joignables aujourd'hui)
router.get('/file-relances', (req, res) => {
  const blocs = portee(req, res); if (!blocs) return;
  const today = new Date().toISOString().slice(0, 10);

  // À appeler = jamais contactés OU dont le prochain_contact est échu (sans-réponse repoussés,
  // rappels planifiés, à recontacter). Les sans-réponse du jour ont prochain_contact dans le
  // futur (délai paramétrable) donc ne remontent pas le jour même.
  // Ordre : jamais-appelés (groupe 0) d'abord, puis les échéances dues (groupe 1), par score.
  // derniere_trace : la derniere chose survenue sur le contact, appel OU note libre
  // (saisie depuis la recherche). Sans cela, un message laisse puis note n'apparait
  // nulle part au moment de rappeler.
  const contacts = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom,
      CASE WHEN contacts.statut = 'a_contacter' THEN 0 ELSE 1 END AS priorite_groupe,
      (SELECT r.notes FROM relances r WHERE r.contact_id = contacts.id
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS derniere_trace_notes,
      (SELECT r.created_at FROM relances r WHERE r.contact_id = contacts.id
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS derniere_trace_le,
      (SELECT r.statut FROM relances r WHERE r.contact_id = contacts.id
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS derniere_trace_statut,
      (SELECT r.type FROM relances r WHERE r.contact_id = contacts.id
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS derniere_trace_type
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.statut NOT IN ('pas_interesse', 'inactif')
    AND contacts.supprime_le IS NULL AND ${B.clauseBlocs(blocs)}
    AND (
      contacts.statut = 'a_contacter'
      OR (contacts.statut IN ('tente_sans_reponse', 'rappel_planifie', 'a_recontacter') AND contacts.prochain_contact IS NOT NULL AND contacts.prochain_contact <= ?)
    )
    ORDER BY priorite_groupe ASC, contacts.score_priorite DESC, contacts.prochain_contact ASC
  `).all(...blocs, today);

  res.json({ contacts, total: contacts.length });
});

// Valeurs distinctes pour les filtres (sources, villes)
router.get('/filtres', (req, res) => {
  const blocs = portee(req, res); if (!blocs) return;
  const dans = `supprime_le IS NULL AND ${B.clauseBlocs(blocs, 'bloc_id')}`;
  const sources = db.prepare(`SELECT DISTINCT source_import AS v FROM contacts WHERE ${dans} AND source_import IS NOT NULL AND source_import != '' ORDER BY v`).all(...blocs).map(r => r.v);
  const villes = db.prepare(`SELECT DISTINCT ville AS v FROM contacts WHERE ${dans} AND ville IS NOT NULL AND ville != '' ORDER BY v`).all(...blocs).map(r => r.v);
  res.json({ sources, villes });
});

// Les personnes à qui une fiche peut être attribuée. La liste des comptes
// (/admin/users) est réservée à l'admin : sans cette route, une agente voyait
// « Non attribué » sur une fiche pourtant attribuée.
router.get('/conseillers', (req, res) => {
  res.json(db.prepare("SELECT id, nom, prenom FROM users WHERE actif = 1 AND role IN ('agent','manager','admin') ORDER BY nom, prenom").all());
});

// Les fichiers ouverts à la personne connectée (pour un sélecteur, quand elle en
// a plusieurs). Avec un seul, les écrans n'affichent rien de plus.
router.get('/blocs', (req, res) => {
  res.json(B.blocsVisibles(req.user).map(b => ({
    id: b.id, code: b.code, libelle: b.libelle, proprietaire_id: b.proprietaire_id, parent_id: b.parent_id,
    champs: (() => { try { return JSON.parse(b.champs || '[]'); } catch { return []; } })(),
  })));
});

// Corbeille : les fiches supprimées, que l'admin peut remettre en place.
router.get('/corbeille', requireRole('admin'), (req, res) => {
  res.json(db.prepare(`SELECT c.id, c.nom, c.prenom, c.telephone, c.ville, c.bloc_id, c.supprime_le,
      u.prenom || ' ' || u.nom AS supprime_par_nom,
      (SELECT COUNT(*) FROM relances r WHERE r.contact_id = c.id) AS nb_relances
    FROM contacts c LEFT JOIN users u ON u.id = c.supprime_par
    WHERE c.supprime_le IS NOT NULL ORDER BY c.supprime_le DESC, c.id LIMIT 2000`).all());
});
router.post('/corbeille/restaurer', requireRole('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => parseInt(x, 10)).filter(Boolean) : null;
  const lot = typeof req.body?.supprime_le === 'string' ? req.body.supprime_le : null;
  if (!ids?.length && !lot) return res.status(400).json({ error: 'ids ou supprime_le requis' });
  const cibles = ids?.length
    ? db.prepare(`SELECT id, bloc_id FROM contacts WHERE supprime_le IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare('SELECT id, bloc_id FROM contacts WHERE supprime_le = ?').all(lot);
  db.transaction(() => {
    const remettre = db.prepare('UPDATE contacts SET supprime_le = NULL, supprime_par = NULL WHERE id = ?');
    for (const c of cibles) { remettre.run(c.id); B.journaliser(req.user, c.id, c.bloc_id, 'restauration', null, null); }
  })();
  res.json({ ok: true, restaures: cibles.length });
});

// Un contact
router.get('/:id', (req, res) => {
  const contact = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.id = ?
  `).get(req.params.id);
  if (!contact || !B.contactVisible(req.user, contact.id)) return res.status(404).json({ error: 'Contact non trouvé' });

  const relances = db.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM relances r JOIN users u ON r.agent_id = u.id
    WHERE r.contact_id = ? ORDER BY r.created_at DESC, r.id DESC
  `).all(contact.id);

  // Meme forme que dans /file-relances : le contact ouvert depuis la recherche
  // doit afficher la meme "derniere trace" que s'il venait de la file.
  const dt = relances[0];
  res.json({
    ...contact,
    relances,
    derniere_trace_notes: dt ? dt.notes : null,
    derniere_trace_le: dt ? dt.created_at : null,
    derniere_trace_statut: dt ? dt.statut : null,
    derniere_trace_type: dt ? dt.type : null,
  });
});

// Bloc dans lequel on écrit (création, import). Refus net si rien n'est ouvert.
function blocDEcriture(req, res) {
  const demande = req.body?.bloc_id;
  if (demande !== undefined && demande !== null && demande !== '') {
    const ids = B.blocsDeLaDemande(req.user, demande);
    if (ids === null) { res.status(403).json({ error: 'Ce fichier ne vous est pas ouvert' }); return null; }
    return ids[0];
  }
  const visibles = B.blocsVisibles(req.user);
  if (!visibles.length) { res.status(403).json({ error: "Aucun fichier ne vous est ouvert pour l'instant. Voyez avec l'administrateur." }); return null; }
  // Plusieurs fichiers et aucun de choisi : on ne devine pas. Sans ce refus, un
  // import d'acquéreurs lancé sur « Tous mes fichiers » se versait dans le fichier
  // Estimés et se fondait dans ses fiches.
  if (visibles.length > 1) { res.status(400).json({ error: "Choisissez d'abord le fichier de travail, en haut de l'écran : la fiche y sera rangée." }); return null; }
  return visibles[0].id;
}
// Champs propres au bloc (budget, secteur…) : un objet, gardé en JSON.
function extraEnTexte(extra) {
  if (extra === undefined || extra === null || extra === '') return null;
  if (typeof extra === 'string') { try { JSON.parse(extra); return extra; } catch { return null; } }
  return JSON.stringify(extra);
}

// Créer
router.post('/', (req, res) => {
  const {
    nom, prenom, telephone, telephone2, email, adresse, code_postal, ville,
    categorie = 'autre', tags = '[]', notes, potentiel = 3, source_import,
    assigned_to, date_estimation, photo_url, suivi_par_origine, civilite, extra
  } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  // Le fichier de la nouvelle fiche : celui demandé s'il est ouvert à la personne,
  // sinon son fichier par défaut (le fichier historique pour qui y a accès).
  const blocId = blocDEcriture(req, res); if (!blocId) return;

  const result = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, tags, notes, potentiel, source_import, assigned_to, date_estimation, photo_url, suivi_par_origine, civilite, bloc_id, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie,
    typeof tags === 'string' ? tags : JSON.stringify(tags), notes, potentiel, source_import,
    assigned_to ? parseInt(assigned_to, 10) : null, date_estimation || null, photo_url || null,
    suivi_par_origine || null, civilite || null, blocId, extraEnTexte(extra));

  recalculerScore(result.lastInsertRowid);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Modifier (mise à jour partielle : seules les clés présentes dans le body sont modifiées)
router.put('/:id', (req, res) => {
  const contact = B.contactVisible(req.user, req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });

  // La fenêtre de la fiche renvoie TOUT le contact tel qu'elle l'a chargé. Si un
  // appel a été enregistré entre-temps (rappel planifié, par exemple), ses
  // « statut » et « prochain rappel » sont périmés : les réécrire faisait
  // disparaître le rappel et revenir la fiche comme jamais appelée. Quand la
  // fiche a changé depuis son chargement, on garde ces trois champs tels qu'ils
  // sont en base ; tout le reste (coordonnées, notes…) est enregistré.
  // Une fiche complète porte son numéro de version. Sans lui, la fenêtre a été
  // ouverte à partir d'une fiche partielle (liste « Mes rappels » : neuf champs) :
  // elle renvoyait alors « aucun mot-clé, aucune date d'estimation, personne en
  // charge » et effaçait ces valeurs. Un formulaire incomplet ne peut donc ni
  // changer le statut, ni vider un champ qu'il n'a pas chargé.
  const sansVersion = req.body.version === undefined || req.body.version === null;
  const perime = sansVersion || Number(req.body.version) !== contact.version
    || (req.body.updated_at !== undefined && req.body.updated_at !== contact.updated_at);
  const vide = (v) => v === null || v === undefined || v === '' || v === '[]';
  const PROTEGES = ['statut', 'prochain_contact', 'assigned_to'];
  const CHAMPS = perime ? CHAMPS_UPDATE.filter(c => !PROTEGES.includes(c)) : CHAMPS_UPDATE;

  const sets = [];
  const params = [];
  for (const champ of CHAMPS) {
    if (!(champ in req.body)) continue;
    let val = req.body[champ];
    if (champ === 'tags') val = typeof val === 'string' ? val : JSON.stringify(val);
    if (champ === 'prochain_contact') val = val || null;
    if (champ === 'assigned_to') val = val ? parseInt(val, 10) : null;
    if (champ === 'date_estimation') val = val || null;
    if (champ === 'photo_url') val = val || null;
    if (sansVersion && vide(val) && !vide(contact[champ])) continue;
    sets.push(`${champ} = ?`);
    params.push(val);
  }
  if ('extra' in req.body) { sets.push('extra = ?'); params.push(extraEnTexte(req.body.extra)); }
  // Changer une fiche de fichier : seulement vers un fichier ouvert à la personne.
  if ('bloc_id' in req.body && req.body.bloc_id && parseInt(req.body.bloc_id, 10) !== contact.bloc_id) {
    const cible = B.blocsDeLaDemande(req.user, req.body.bloc_id);
    if (cible === null) return res.status(403).json({ error: 'Ce fichier ne vous est pas ouvert' });
    sets.push('bloc_id = ?'); params.push(cible[0]);
    B.journaliser(req.user, contact.id, cible[0], 'bloc', contact.bloc_id, cible[0]);
  }
  sets.push(`updated_at = datetime('now')`, 'version = version + 1');
  params.push(req.params.id);

  db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  // Trace des changements faits à la main (hors appels) : sans elle, impossible
  // de dire après coup qui a changé un statut ou réattribué une fiche.
  if (!perime) {
    if ('statut' in req.body && req.body.statut !== contact.statut) B.journaliser(req.user, contact.id, contact.bloc_id, 'statut', contact.statut, req.body.statut);
    if ('assigned_to' in req.body && (req.body.assigned_to ? parseInt(req.body.assigned_to, 10) : null) !== contact.assigned_to) {
      B.journaliser(req.user, contact.id, contact.bloc_id, 'attribution', contact.assigned_to, req.body.assigned_to || null);
    }
  }
  recalculerScore(req.params.id);
  res.json({ ok: true, statut_conserve: perime || undefined });
});

// Effacer TOUS les contacts (admin uniquement) — doit être déclaré AVANT /:id
//
// Trois garde-fous qui n'existaient pas :
//  - la confirmation « EFFACER » est exigée par le SERVEUR (elle n'existait que
//    dans l'écran : un simple appel vidait tout) ;
//  - une sauvegarde complète est écrite juste avant ;
//  - rien n'est détruit : les fiches partent à la corbeille avec leur historique
//    d'appels, et l'admin peut les remettre. Avant, la cascade effaçait aussi
//    toutes les relances.
// ?bloc_id limite à un fichier ; sans lui, tous les fichiers sont concernés.
router.delete('/all', requireRole('admin'), async (req, res) => {
  const confirmation = req.body?.confirmation ?? req.query.confirmation;
  if (confirmation !== 'EFFACER') return res.status(400).json({ error: 'Confirmation requise : EFFACER' });
  const blocs = portee(req, res); if (!blocs) return;
  let sauvegarde = null;
  try { sauvegarde = require('path').basename(await require('../sauvegarde').sauvegarder()); }
  catch (e) { return res.status(500).json({ error: 'Sauvegarde impossible, rien n\'a été effacé : ' + e.message }); }
  // Horodaté à la milliseconde : c'est l'étiquette du lot, qui permet de tout
  // remettre d'un coup sans emporter une fiche supprimée à l'unité la même seconde.
  const le = new Date().toISOString().slice(0, 23).replace('T', ' ');
  try {
    const n = db.prepare(`UPDATE contacts SET supprime_le = ?, supprime_par = ? WHERE supprime_le IS NULL AND ${B.clauseBlocs(blocs, 'bloc_id')}`)
      .run(le, req.user.id, ...blocs).changes;
    B.journaliser(req.user, null, blocs.length === 1 ? blocs[0] : null, 'suppression', `${n} fiches`, le);
    res.json({ ok: true, supprimes: n, sauvegarde, supprime_le: le });
  } catch (e) {
    console.error('[contacts] effacement —', e);
    res.status(500).json({ error: 'Effacement impossible. Rien n\'a été modifié.' });
  }
});

// Supprimer une fiche : elle part à la corbeille, son historique d'appels est
// conservé (le suivi d'activité ne change pas rétroactivement).
router.delete('/:id', (req, res) => {
  const contact = B.contactVisible(req.user, req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });
  db.prepare("UPDATE contacts SET supprime_le = datetime('now'), supprime_par = ? WHERE id = ?").run(req.user.id, contact.id);
  B.journaliser(req.user, contact.id, contact.bloc_id, 'suppression', null, null);
  res.json({ ok: true });
});

// Logique d'import factorée (testable sans HTTP).
function importerContacts(contacts, users, importeur, assignedToChoisi, blocId = B.BLOC_HISTORIQUE) {
  const insert = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, notes, potentiel, statut, prochain_contact, source_import, assigned_to, date_estimation, photo_url, suivi_par_origine, civilite, bloc_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const STATUTS_OK = ['a_contacter','tente_sans_reponse','rappel_planifie','rdv_obtenu','pas_interesse','a_recontacter','inactif'];
  let importes = 0, erreurs = 0, dates_ignorees = 0, fusionnes = 0;

  let assignedTo;
  if (importeur && importeur.role === 'agent') {
    assignedTo = importeur.id;
  } else {
    assignedTo = assignedToChoisi ? parseInt(assignedToChoisi, 10) : (importeur ? importeur.id : null);
  }

  // Normalise un téléphone : ne garde que les chiffres (pour comparer 06 12... == 0612...)
  const normTel = (t) => String(t || '').replace(/\D/g, '');
  const normMail = (e) => String(e || '').toLowerCase().trim();

  // Recherche un contact existant par téléphone (port/fixe) ou email, DANS LE MÊME
  // FICHIER et hors corbeille : un import d'acquéreurs ne doit pas se fondre dans
  // les fiches du fichier Estimés (la même personne peut être dans les deux).
  const trouverExistant = (c) => {
    const tels = [normTel(c.telephone), normTel(c.telephone2)].filter(t => t.length >= 6);
    const mail = normMail(c.email);
    // Email exact (insensible casse)
    if (mail) {
      const parMail = db.prepare("SELECT * FROM contacts WHERE lower(email) = ? AND bloc_id = ? AND supprime_le IS NULL LIMIT 1").get(mail, blocId);
      if (parMail) return parMail;
    }
    // Téléphone (compare chiffres seuls)
    for (const t of tels) {
      const parTel = db.prepare(
        "SELECT * FROM contacts WHERE bloc_id = ? AND supprime_le IS NULL AND (replace(replace(replace(replace(telephone,' ',''),'.',''),'-',''),'+','') = ? " +
        "OR replace(replace(replace(replace(telephone2,' ',''),'.',''),'-',''),'+','') = ?) LIMIT 1"
      ).get(blocId, t, t);
      if (parTel) return parTel;
    }
    return null;
  };

  const updateDoux = db.prepare(`UPDATE contacts SET
    prenom=COALESCE(NULLIF(prenom,''), @prenom), telephone=COALESCE(NULLIF(telephone,''), @telephone),
    telephone2=COALESCE(NULLIF(telephone2,''), @telephone2), email=COALESCE(NULLIF(email,''), @email),
    adresse=COALESCE(NULLIF(adresse,''), @adresse), code_postal=COALESCE(NULLIF(code_postal,''), @code_postal),
    ville=COALESCE(NULLIF(ville,''), @ville), date_estimation=COALESCE(date_estimation, @date_estimation),
    photo_url=COALESCE(NULLIF(photo_url,''), @photo_url), suivi_par_origine=COALESCE(NULLIF(suivi_par_origine,''), @suivi_par_origine),
    civilite=COALESCE(NULLIF(civilite,''), @civilite), notes=@notes, updated_at=datetime('now'), version=version+1
    WHERE id=@id`);

  const importMany = db.transaction((rows) => {
    for (const c of rows) {
      if (!c.nom && !c.prenom) { erreurs++; continue; }
      try {
        const statut = STATUTS_OK.includes(c.statut) ? c.statut : 'a_contacter';
        const source = (c.source && String(c.source).trim()) ? String(c.source).trim() : 'import_csv';
        const suiviParOrigine = c.suivi_par_origine || c.conseiller || null;

        let dateEstim = null;
        if (c.date_estimation && String(c.date_estimation).trim()) {
          dateEstim = normaliserDate(c.date_estimation);
          if (dateEstim == null) dates_ignorees++;
        }

        const existant = trouverExistant(c);
        if (existant) {
          // Fusion douce : compléter les champs vides ; cumuler le bien dans les notes si nouveau.
          let notes = existant.notes || '';
          const nouvelleNote = (c.notes || '').trim();
          // Ajoute la note (résumé bien) seulement si non déjà présente (évite doublon de mandat)
          if (nouvelleNote && !notes.includes(nouvelleNote)) {
            notes = notes ? `${notes}\n— ${nouvelleNote}` : nouvelleNote;
          }
          updateDoux.run({
            id: existant.id,
            prenom: c.prenom || '', telephone: c.telephone || '', telephone2: c.telephone2 || '',
            email: c.email || '', adresse: c.adresse || '', code_postal: c.code_postal || '',
            ville: c.ville || '', date_estimation: dateEstim, photo_url: c.photo_url || '',
            suivi_par_origine: suiviParOrigine || '', civilite: c.civilite || '', notes,
          });
          recalculerScore(existant.id);
          fusionnes++;
        } else {
          const result = insert.run(
            c.nom || '', c.prenom || '', c.telephone || '', c.telephone2 || '',
            c.email || '', c.adresse || '', c.code_postal || '', c.ville || '',
            c.categorie || 'autre', c.notes || '', parseInt(c.potentiel) || 3,
            statut, c.prochain_contact || null, source, assignedTo,
            dateEstim, c.photo_url || null, suiviParOrigine, (c.civilite || null), blocId
          );
          // Champs propres au fichier (budget, secteur…), s'ils sont fournis.
          const extra = extraEnTexte(c.extra);
          if (extra) db.prepare('UPDATE contacts SET extra = ? WHERE id = ?').run(extra, result.lastInsertRowid);
          recalculerScore(result.lastInsertRowid);
          importes++;
        }
      } catch (e) { erreurs++; console.error(`[import] échec contact "${c.nom || c.prenom || '?'}" : ${e.message}`); }
    }
  });

  importMany(contacts);
  return { importes, erreurs, dates_ignorees, fusionnes };
}

// Import CSV en masse
router.post('/import', (req, res) => {
  const { contacts, assigned_to } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ error: 'Données invalides' });
  const blocId = blocDEcriture(req, res); if (!blocId) return;
  const users = db.prepare('SELECT id, nom, prenom, email FROM users WHERE actif = 1').all();
  const avant = req.user.role === 'admin' ? B.doublonsEntreFichiers().length : null;
  const bilan = importerContacts(contacts, users, req.user, assigned_to, blocId);
  // Signalé à l'admin seulement : un agent n'a pas à savoir ce que contient le fichier d'un autre.
  const dans_autre_fichier = avant === null ? undefined : Math.max(0, B.doublonsEntreFichiers().length - avant);
  res.json({ ...bilan, bloc_id: blocId, dans_autre_fichier });
});

const ISSUE_LABEL_EXPORT = {
  sans_reponse: 'Sans réponse', projet: 'Projet (estimation/RDV)',
  rappel: 'A recontacter plus tard', demenage: "N'habite plus a l'adresse",
  sans_projet: 'Plus de projet', autre: 'Autre',
};

router.get('/export/csv', (req, res) => {
  const blocs = portee(req, res); if (!blocs) return;
  const contacts = db.prepare(`
    SELECT contacts.*,
      dr.issue AS dernier_suivi_issue, dr.notes AS dernier_suivi_note, dr.created_at AS dernier_suivi_date
    FROM contacts
    LEFT JOIN relances dr ON dr.id = (
      SELECT id FROM relances WHERE contact_id = contacts.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    WHERE contacts.supprime_le IS NULL AND ${B.clauseBlocs(blocs)}
    ORDER BY contacts.nom
  `).all(...blocs);
  const clean = (v) => (v || '').replace(/,/g, ';').replace(/\n/g, ' ');
  const header = 'id,nom,prenom,telephone,telephone2,email,adresse,code_postal,ville,categorie,statut,score_priorite,potentiel,date_dernier_contact,prochain_contact,nombre_tentatives,notes,tags,created_at,dernier_suivi_issue,dernier_suivi_note,dernier_suivi_date\n';
  const rows = contacts.map(c =>
    [c.id, c.nom, c.prenom, c.telephone, c.telephone2, c.email, c.adresse, c.code_postal, c.ville,
     c.categorie, c.statut, c.score_priorite, c.potentiel, c.date_dernier_contact, c.prochain_contact,
     c.nombre_tentatives, clean(c.notes), c.tags, c.created_at,
     c.dernier_suivi_issue ? (ISSUE_LABEL_EXPORT[c.dernier_suivi_issue] || c.dernier_suivi_issue) : '',
     clean(c.dernier_suivi_note), c.dernier_suivi_date || '']
    .map(v => `"${v ?? ''}"`)
    .join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts_export.csv"');
  res.send('﻿' + header + rows);
});

module.exports = router;
module.exports.importerContacts = importerContacts;
module.exports.CHAMPS_UPDATE = CHAMPS_UPDATE;
