const express = require('express');
const { db, recalculerScore } = require('../database');
const { normaliserDate, resoudreConseiller } = require('../utils/import-helpers');
const { requireAuth, requireRole } = require('../auth');

const CHAMPS_UPDATE = ['nom','prenom','telephone','telephone2','email','adresse','code_postal',
  'ville','categorie','tags','notes','potentiel','statut','prochain_contact',
  'source_import','assigned_to','date_estimation','photo_url','suivi_par_origine','civilite'];

const router = express.Router();
router.use(requireAuth);

// Liste avec filtres et pagination
router.get('/', (req, res) => {
  const {
    page = 1, limit = 50, search = '', categorie = '', statut = '',
    sort = 'score_priorite', order = 'DESC', tag = '',
    assigned_to = '', source = '', ville = ''
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const params = [];

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
  const validSorts = ['score_priorite', 'nom', 'date_dernier_contact', 'prochain_contact', 'created_at', 'categorie', 'statut'];
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
    ORDER BY contacts.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  res.json({ contacts, total, page: parseInt(page), limit: parseInt(limit) });
});

// File de relances du jour (sans limite : tous les contacts joignables aujourd'hui)
router.get('/file-relances', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // À appeler = jamais contactés OU dont le prochain_contact est échu (sans-réponse repoussés,
  // rappels planifiés, à recontacter). Les sans-réponse du jour ont prochain_contact dans le
  // futur (délai paramétrable) donc ne remontent pas le jour même.
  // Ordre : jamais-appelés (groupe 0) d'abord, puis les échéances dues (groupe 1), par score.
  const contacts = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom,
      CASE WHEN contacts.statut = 'a_contacter' THEN 0 ELSE 1 END AS priorite_groupe
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.statut NOT IN ('pas_interesse', 'inactif')
    AND (
      contacts.statut = 'a_contacter'
      OR (contacts.statut IN ('tente_sans_reponse', 'rappel_planifie', 'a_recontacter') AND contacts.prochain_contact IS NOT NULL AND contacts.prochain_contact <= ?)
    )
    ORDER BY priorite_groupe ASC, contacts.score_priorite DESC, contacts.prochain_contact ASC
  `).all(today);

  res.json({ contacts, total: contacts.length });
});

// Valeurs distinctes pour les filtres (sources, villes)
router.get('/filtres', (req, res) => {
  const sources = db.prepare("SELECT DISTINCT source_import AS v FROM contacts WHERE source_import IS NOT NULL AND source_import != '' ORDER BY v").all().map(r => r.v);
  const villes = db.prepare("SELECT DISTINCT ville AS v FROM contacts WHERE ville IS NOT NULL AND ville != '' ORDER BY v").all().map(r => r.v);
  res.json({ sources, villes });
});

// Un contact
router.get('/:id', (req, res) => {
  const contact = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.id = ?
  `).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });

  const relances = db.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM relances r JOIN users u ON r.agent_id = u.id
    WHERE r.contact_id = ? ORDER BY r.created_at DESC
  `).all(contact.id);

  res.json({ ...contact, relances });
});

// Créer
router.post('/', (req, res) => {
  const {
    nom, prenom, telephone, telephone2, email, adresse, code_postal, ville,
    categorie = 'autre', tags = '[]', notes, potentiel = 3, source_import,
    assigned_to, date_estimation, photo_url, suivi_par_origine, civilite
  } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const result = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, tags, notes, potentiel, source_import, assigned_to, date_estimation, photo_url, suivi_par_origine, civilite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie,
    typeof tags === 'string' ? tags : JSON.stringify(tags), notes, potentiel, source_import,
    assigned_to ? parseInt(assigned_to, 10) : null, date_estimation || null, photo_url || null,
    suivi_par_origine || null, civilite || null);

  recalculerScore(result.lastInsertRowid);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Modifier (mise à jour partielle : seules les clés présentes dans le body sont modifiées)
router.put('/:id', (req, res) => {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });

  const CHAMPS = CHAMPS_UPDATE;

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
    sets.push(`${champ} = ?`);
    params.push(val);
  }
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);

  db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  recalculerScore(req.params.id);
  res.json({ ok: true });
});

// Effacer TOUS les contacts (admin uniquement) — doit être déclaré AVANT /:id
router.delete('/all', requireRole('admin'), (req, res) => {
  const avant = db.prepare('SELECT COUNT(*) AS c FROM contacts').get().c;
  db.prepare('DELETE FROM contacts').run();
  res.json({ ok: true, supprimes: avant });
});

// Supprimer
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Logique d'import factorée (testable sans HTTP).
function importerContacts(contacts, users, importeur, assignedToChoisi) {
  const insert = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, notes, potentiel, statut, prochain_contact, source_import, assigned_to, date_estimation, photo_url, suivi_par_origine, civilite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  // Recherche un contact existant par téléphone (port/fixe) ou email.
  const trouverExistant = (c) => {
    const tels = [normTel(c.telephone), normTel(c.telephone2)].filter(t => t.length >= 6);
    const mail = normMail(c.email);
    // Email exact (insensible casse)
    if (mail) {
      const parMail = db.prepare("SELECT * FROM contacts WHERE lower(email) = ? LIMIT 1").get(mail);
      if (parMail) return parMail;
    }
    // Téléphone (compare chiffres seuls)
    for (const t of tels) {
      const parTel = db.prepare(
        "SELECT * FROM contacts WHERE replace(replace(replace(replace(telephone,' ',''),'.',''),'-',''),'+','') = ? " +
        "OR replace(replace(replace(replace(telephone2,' ',''),'.',''),'-',''),'+','') = ? LIMIT 1"
      ).get(t, t);
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
    civilite=COALESCE(NULLIF(civilite,''), @civilite), notes=@notes, updated_at=datetime('now')
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
            dateEstim, c.photo_url || null, suiviParOrigine, (c.civilite || null)
          );
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
  const users = db.prepare('SELECT id, nom, prenom, email FROM users WHERE actif = 1').all();
  res.json(importerContacts(contacts, users, req.user, assigned_to));
});

// Export
router.get('/export/csv', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY nom').all();
  const header = 'id,nom,prenom,telephone,telephone2,email,adresse,code_postal,ville,categorie,statut,score_priorite,potentiel,date_dernier_contact,prochain_contact,nombre_tentatives,notes,tags,created_at\n';
  const rows = contacts.map(c =>
    [c.id, c.nom, c.prenom, c.telephone, c.telephone2, c.email, c.adresse, c.code_postal, c.ville,
     c.categorie, c.statut, c.score_priorite, c.potentiel, c.date_dernier_contact, c.prochain_contact,
     c.nombre_tentatives, (c.notes || '').replace(/,/g, ';').replace(/\n/g, ' '), c.tags, c.created_at]
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
