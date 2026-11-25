// Mission Acquéreurs → Mission Courtage.
//
// Décision de Loïck (25/11/2026) : quand l'appelante acquéreurs enregistre
// l'accord du client pour être rappelé par Marine, la fiche arrive toute seule
// chez Marine, en tête de sa file, dans la catégorie « Transmis par Lilas -
// Mission Acquéreurs » (priorité 0, avant « CI Facile »).
//
//  - la personne a déjà une fiche chez Marine (même téléphone ou même mail) :
//    pas de doublon, la fiche existante est remontée en tête, avec une ligne
//    d'historique ;
//  - elle est sur la liste noire du courtage, ou sa fiche est « ne plus
//    contacter » : rien n'est créé, et l'appelante le lit ;
//  - rien ne part dans Modelo.
const { db } = require('../database');
const CI = require('./courtageImport');

const CATEGORIE = 'acquereurs';
const PRIORITE = 0;
const SOURCE = 'Mission Acquéreurs';
const LIB_STATUT = { a_qualifier: 'à qualifier', en_relance: 'en relance', simulation_faite: 'simulation faite', dossier_en_cours: 'dossier en cours',
  gagne: 'gagné', perdu: 'perdu', injoignable: 'injoignable', ne_plus_contacter: 'ne plus contacter', faux_numero: 'faux numéro' };
const LIB_ACTION = { creation: 'fiche créée', relance: 'relance', pas_de_reponse: 'pas de réponse', trop_tot: 'trop tôt', mail_propose: 'mail proposé', statut: 'changement de statut' };

const normMail = (m) => (m || '').trim().toLowerCase() || null;
const aujourdhui = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const jj = (s) => String(s || '').slice(0, 10).split('-').reverse().join('/');
const euros = (n) => Number(n) > 0 ? Math.round(Number(n)).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €' : '';
const json = (t) => { try { return JSON.parse(t || '{}') || {}; } catch { return {}; } };

// Le projet d'achat, en une ligne, d'après les recherches gardées.
function resumeProjet(fiches) {
  return fiches.filter(f => f.decision === 'GARDER').map((f) => {
    const p = json(f.requalif);
    const bien = /^(maison ou appartement|appartement\s*\/\s*maison)$/i.test(p.type_bien || '') ? 'maison ou appartement' : (p.type_bien || f.type_bien || '');
    const secteurs = Array.isArray(p.secteurs) ? p.secteurs.join(', ') : (p.secteurs || '');
    return [bien, euros(p.budget_max) && `budget ${euros(p.budget_max)}`, secteurs && `secteur ${secteurs}`,
      p.mode_financement && `financement ${String(p.mode_financement).toLowerCase()}`, euros(p.apport) && `apport ${euros(p.apport)}`,
      p.banque_ou_courtier && `déjà vu : ${p.banque_ou_courtier}`].filter(Boolean).join(', ');
  }).filter(Boolean);
}

function dejaTransmis(id_contact) {
  return db.prepare("SELECT * FROM acq_transmissions WHERE id_contact = ? AND type = 'MARINE' AND courtage_fiche_id IS NOT NULL ORDER BY id DESC LIMIT 1").get(String(id_contact)) || null;
}

// Envoi chez Marine. Sans effet si c'est déjà fait pour cette personne.
function transmettre(id_contact, { par = null, note = null } = {}) {
  const c = db.prepare('SELECT * FROM acq_contacts WHERE id_contact = ?').get(String(id_contact));
  if (!c) return { ok: false, motif: 'Contact introuvable' };
  const deja = dejaTransmis(c.id_contact);
  if (deja) return { ok: true, deja: true, fiche_id: deja.courtage_fiche_id };
  const tel = c.tel_portable || c.tel_fixe || null;
  const telN = CI.normaliserTelephone(tel), mailN = normMail(c.email);
  if (!telN && !mailN) return { ok: false, motif: 'Ni téléphone ni e-mail : Marine ne pourrait pas la joindre' };
  const noire = db.prepare(`SELECT 1 FROM courtage_blacklist WHERE (telephone_norm IS NOT NULL AND telephone_norm = ?)
    OR (mail_norm IS NOT NULL AND mail_norm = ?)`).get(telN, mailN);
  if (noire) return { ok: false, motif: 'Cette personne a demandé à Marine de ne plus être contactée' };

  const fiches = db.prepare('SELECT * FROM acq_fiches WHERE id_contact = ? ORDER BY id_fiche').all(c.id_contact);
  const projets = resumeProjet(fiches);
  const budget = fiches.filter(f => f.decision === 'GARDER').map(f => Number(json(f.requalif).budget_max) || 0).sort((a, b) => b - a)[0];
  const qui = par || 'l’appelante';
  const texte = [`Transmis par ${qui} (Mission Acquéreurs) le ${jj(aujourdhui())} : le client est d’accord pour être rappelé.`,
    projets.length ? `Projet : ${projets.join(' ; ')}.` : null, note ? `Note : ${note}` : null].filter(Boolean).join(' ');

  const existante = db.prepare(`SELECT * FROM courtage_fiches WHERE (telephone_norm IS NOT NULL AND telephone_norm = ?)
    OR (mail_norm IS NOT NULL AND mail_norm = ?) ORDER BY id DESC LIMIT 1`).get(telN, mailN);
  if (existante && existante.statut === 'ne_plus_contacter') return { ok: false, motif: 'Sa fiche chez Marine est « ne plus contacter »' };

  const noterAction = db.prepare(`INSERT INTO courtage_actions (fiche_id, type, commentaire, prochaine_relance, statut_avant, statut_apres)
    VALUES (?, ?, ?, ?, ?, ?)`);
  return db.transaction(() => {
    let ficheId, existait = false;
    if (existante) {
      existait = true; ficheId = existante.id;
      // Une fiche fermée sans suite se rouvre : le client vient de redire oui.
      const rouvrir = ['perdu', 'injoignable', 'faux_numero'].includes(existante.statut);
      const statut = rouvrir ? 'en_relance' : existante.statut;
      db.prepare(`UPDATE courtage_fiches SET categorie = ?, priorite = ?, statut = ?, prochaine_relance = ?,
          tentatives_sans_reponse = CASE WHEN ? THEN 0 ELSE tentatives_sans_reponse END, updated_at = datetime('now') WHERE id = ?`)
        .run(CATEGORIE, PRIORITE, statut, aujourdhui(), rouvrir ? 1 : 0, ficheId);
      noterAction.run(ficheId, 'statut', texte, aujourdhui(), existante.statut, statut);
    } else {
      ficheId = db.prepare(`INSERT INTO courtage_fiches (nom, prenom, telephone, telephone_norm, mail, mail_norm, date_contact,
          montant_projet, source, categorie, priorite, statut, prochaine_relance, commentaire)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_relance', ?, ?)`).run(c.nom || 'Sans nom', c.prenom || null, tel, telN, c.email || null, mailN,
        aujourdhui(), budget ? String(budget) : null, SOURCE, CATEGORIE, PRIORITE, aujourdhui(), texte).lastInsertRowid;
      noterAction.run(ficheId, 'creation', texte, aujourdhui(), null, null);
    }
    db.prepare("INSERT INTO acq_transmissions (id_contact, type, par, courtage_fiche_id) VALUES (?, 'MARINE', ?, ?)").run(c.id_contact, par, ficheId);
    return { ok: true, fiche_id: ficheId, existait };
  })();
}

// Le retour pour l'appelante : où en est Marine. Lecture seule.
function retour(id_contact) {
  const t = dejaTransmis(id_contact);
  if (!t) return null;
  const f = db.prepare('SELECT id, statut, prochaine_relance FROM courtage_fiches WHERE id = ?').get(t.courtage_fiche_id);
  if (!f) return { transmis_le: t.le, statut: null };
  // La dernière action de Marine elle-même, pas la ligne posée par la transmission.
  const a = db.prepare(`SELECT type, created_at FROM courtage_actions WHERE fiche_id = ?
      AND id > COALESCE((SELECT MAX(id) FROM courtage_actions WHERE fiche_id = ? AND commentaire LIKE 'Transmis par %(Mission Acquéreurs)%'), 0)
    ORDER BY id DESC LIMIT 1`).get(f.id, f.id);
  return { transmis_le: t.le, statut: f.statut, statut_libelle: LIB_STATUT[f.statut] || f.statut, prochaine_relance: f.prochaine_relance,
    derniere_action: a ? { type: a.type, libelle: LIB_ACTION[a.type] || a.type, le: a.created_at } : null };
}

module.exports = { transmettre, retour, dejaTransmis, CATEGORIE, PRIORITE, SOURCE };
