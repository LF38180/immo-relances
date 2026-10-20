// Import du fichier Modelo de l'opération anciens clients.
//
// Le fichier fait foi : le script, le rôle et l'état du courrier sont calculés
// en amont à partir de données Modelo que l'application n'a pas (le conseiller
// qui suivait la fiche avant). On importe, on ne recalcule jamais.
//
// L'import est rejouable : une seconde passe met à jour les fiches existantes
// sans toucher aux appels déjà passés ni aux résultats recueillis.

const bcrypt = require('bcryptjs');
const { db } = require('../database');

const COLONNES_ATTENDUES = [
  'id_modelo', 'a_dispatcher', 'conseiller', 'email_conseiller',
  'suggestion_conseiller', 'email_suggestion', 'suggestion_base', 'situation',
  'conseiller_precedent', 'prenom_a_dire', 'dossier_repris', 'script',
  'courrier_etat', 'courrier_motif', 'role', 'civilite', 'nom', 'prenom',
  'adresse', 'complement', 'code_postal', 'commune', 'adresse_fiable',
  'tel_portable', 'tel_fixe', 'email', 'email_valide', 'stop_telephone',
  'stop_mail', 'bien_concerne', 'partie_au_registre', 'agence', 'secteur',
  'objectif_principal', 'fiche_a_corriger',
];

// Découpage CSV tolérant aux guillemets et aux points-virgules dans un champ.
function decouper(ligne, sep = ';') {
  const out = []; let cur = ''; let guillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (guillemets && ligne[i + 1] === '"') { cur += '"'; i++; }
      else guillemets = !guillemets;
    } else if (c === sep && !guillemets) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim());
}

// Le fichier peut arriver avec un BOM (Excel) et des fins de ligne Windows.
function lignesDe(texte) {
  // Découper sur les sauts de ligne ne suffit pas : un champ entre guillemets
  // peut en contenir (cas réel du fichier Modelo, une adresse mail suivie d'un
  // retour chariot). Ce défaut coupait l'enregistrement en deux et décalait
  // toutes les colonnes de la seconde moitié.
  const net = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const out = [];
  let cur = '';
  let guillemets = false;
  for (let i = 0; i < net.length; i++) {
    const c = net[i];
    if (c === '"') {
      if (guillemets && net[i + 1] === '"') { cur += '""'; i++; continue; }
      guillemets = !guillemets;
      cur += c;
    } else if (c === '\n' && !guillemets) {
      if (cur.trim() !== '') out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

const bool = (v) => (String(v).trim() === '1' ? 1 : 0);
const vide = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// Le fichier note le rôle indéterminé '?' ; la base attend 'INCONNU'.
const normRole = (v) => {
  const x = String(v || '').trim().toUpperCase();
  return ['ACQUEREUR', 'VENDEUR'].includes(x) ? x : 'INCONNU';
};

const normCourrier = (v) => {
  const x = String(v || '').trim().toUpperCase();
  return ['ENVOYE', 'NON_IMPRIME', 'A_APPELER', 'A_TRANCHER'].includes(x) ? x : 'A_APPELER';
};

const normObjectif = (v) =>
  (String(v || '').trim().toUpperCase() === 'ADRESSE' ? 'ADRESSE' : 'ACTUALISATION');

// Vérifie la forme du fichier avant d'écrire quoi que ce soit.
function verifier(texte) {
  const lignes = lignesDe(texte);
  if (lignes.length < 2) return { ok: false, erreur: 'Fichier vide ou sans données.' };
  const entete = decouper(lignes[0]);
  const manquantes = COLONNES_ATTENDUES.filter(c => !entete.includes(c));
  if (manquantes.length)
    return { ok: false, erreur: 'Colonnes manquantes : ' + manquantes.join(', ') };
  return { ok: true, entete, lignes };
}

// Transforme une ligne en objet, en ne gardant que les colonnes connues.
function enregistrement(entete, champs) {
  const o = {};
  entete.forEach((nom, i) => { if (COLONNES_ATTENDUES.includes(nom)) o[nom] = champs[i] ?? ''; });
  return o;
}

const INSERT = `
  INSERT INTO op_contacts (
    id_modelo, a_dispatcher, conseiller, suggestion_conseiller, suggestion_base,
    situation, conseiller_precedent, prenom_a_dire, dossier_repris, script,
    courrier_etat, courrier_motif, role, civilite, nom, prenom,
    adresse, complement, code_postal, commune, adresse_fiable,
    tel_portable, tel_fixe, email, email_valide, stop_telephone, stop_mail,
    bien_concerne, partie_au_registre, agence, secteur, objectif_principal,
    fiche_a_corriger
  ) VALUES (
    @id_modelo, @a_dispatcher, @conseiller, @suggestion_conseiller, @suggestion_base,
    @situation, @conseiller_precedent, @prenom_a_dire, @dossier_repris, @script,
    @courrier_etat, @courrier_motif, @role, @civilite, @nom, @prenom,
    @adresse, @complement, @code_postal, @commune, @adresse_fiable,
    @tel_portable, @tel_fixe, @email, @email_valide, @stop_telephone, @stop_mail,
    @bien_concerne, @partie_au_registre, @agence, @secteur, @objectif_principal,
    @fiche_a_corriger
  )
  ON CONFLICT(id_modelo) DO UPDATE SET
    -- Réimport : on rafraîchit les données venues de Modelo, mais on ne touche
    -- pas à l'attribution si elle a été faite depuis l'application.
    suggestion_conseiller = excluded.suggestion_conseiller,
    suggestion_base       = excluded.suggestion_base,
    situation             = excluded.situation,
    conseiller_precedent  = excluded.conseiller_precedent,
    prenom_a_dire         = excluded.prenom_a_dire,
    dossier_repris        = excluded.dossier_repris,
    script                = excluded.script,
    courrier_etat         = excluded.courrier_etat,
    courrier_motif        = excluded.courrier_motif,
    role                  = excluded.role,
    civilite = excluded.civilite, nom = excluded.nom, prenom = excluded.prenom,
    adresse = excluded.adresse, complement = excluded.complement,
    code_postal = excluded.code_postal, commune = excluded.commune,
    adresse_fiable = excluded.adresse_fiable,
    tel_portable = excluded.tel_portable, tel_fixe = excluded.tel_fixe,
    email = excluded.email, email_valide = excluded.email_valide,
    -- Une opposition enregistrée dans l'application ne doit jamais être effacée
    -- par un réimport : on prend le plus restrictif des deux.
    stop_telephone = MAX(op_contacts.stop_telephone, excluded.stop_telephone),
    stop_mail      = MAX(op_contacts.stop_mail,      excluded.stop_mail),
    bien_concerne = excluded.bien_concerne,
    partie_au_registre = excluded.partie_au_registre,
    agence = excluded.agence, secteur = excluded.secteur,
    objectif_principal = excluded.objectif_principal,
    fiche_a_corriger = excluded.fiche_a_corriger,
    updated_at = datetime('now')
`;

// Comptes conseillers : créés à l'import, à partir des adresses du fichier.
// Mot de passe provisoire imposé au premier accès (must_change_password).
function comptesDepuis(enregs) {
  const vus = new Map();
  for (const e of enregs) {
    for (const [nomCle, mailCle] of [['conseiller', 'email_conseiller'], ['suggestion_conseiller', 'email_suggestion']]) {
      const nomComplet = vide(e[nomCle]);
      const mail = vide(e[mailCle]);
      if (!nomComplet || !mail) continue;
      const bas = mail.toLowerCase();
      if (!vus.has(bas)) vus.set(bas, { email: bas, nomComplet, agence: vide(e.agence) });
    }
  }
  return [...vus.values()];
}

// « Tara ZOPPAS » -> prénom Tara, nom ZOPPAS. Les noms composés restent entiers.
function separerNom(nomComplet) {
  const bouts = nomComplet.trim().split(/\s+/);
  if (bouts.length === 1) return { prenom: '', nom: bouts[0] };
  return { prenom: bouts[0], nom: bouts.slice(1).join(' ') };
}

// Crée les comptes manquants, avec un mot de passe provisoire commun et un
// changement imposé à la première connexion.
//
// Un compte qui existe déjà n'est JAMAIS touché : ni son mot de passe, ni son
// rôle, ni son agence. Trois personnes sont dans ce cas — Loïck en admin,
// Marine qui garde son rôle `courtage` et son accès au courtage, Chrystelle
// qui a déjà le sien. Les écraser leur ferait perdre leur mot de passe un
// matin de lancement, et à Marine son espace de travail.
function creerComptes(enregs, motDePasseProvisoire) {
  const existe = db.prepare('SELECT id, role FROM users WHERE LOWER(email) = ?');
  const inserer = db.prepare(`INSERT INTO users (nom, prenom, email, password, role, must_change_password, agence)
    VALUES (?, ?, ?, ?, 'conseiller', 1, ?)`);
  const hash = bcrypt.hashSync(motDePasseProvisoire, 10);
  let crees = 0; const dejaLa = [];
  for (const c of comptesDepuis(enregs)) {
    const deja = existe.get(c.email);
    if (deja) { dejaLa.push({ email: c.email, role: deja.role }); continue; }
    const { prenom, nom } = separerNom(c.nomComplet);
    inserer.run(nom, prenom, c.email, hash, c.agence);
    crees++;
  }
  return { crees, dejaLa };
}

// Importe le contenu d'un CSV. `simulation` : rien n'est écrit, on rend le
// compte rendu — indispensable avant de toucher à la production.
function importer(texte, { simulation = false, motDePasseProvisoire = null, userId = null, fichier = null } = {}) {
  const v = verifier(texte);
  if (!v.ok) return { ok: false, erreur: v.erreur };

  const enregs = [];
  const rejets = [];
  for (let i = 1; i < v.lignes.length; i++) {
    const champs = decouper(v.lignes[i]);
    const e = enregistrement(v.entete, champs);
    if (!vide(e.id_modelo)) { rejets.push({ ligne: i + 1, raison: 'identifiant Modelo absent' }); continue; }
    // Personnes morales : Modelo n'a pas de nom de famille pour une société ou
    // une association, mais la raison sociale figure au registre des ventes.
    // Quatre fiches dans ce cas, dont trois avec un téléphone valide : les
    // rejeter ferait perdre des appels légitimes.
    if (!vide(e.nom) && vide(e.partie_au_registre)) e.nom = e.partie_au_registre;
    if (!vide(e.nom)) { rejets.push({ ligne: i + 1, raison: 'ni nom ni raison sociale', id: e.id_modelo }); continue; }
    const script = parseInt(e.script, 10);
    if (!(script >= 1 && script <= 4)) { rejets.push({ ligne: i + 1, raison: 'script invalide : ' + e.script, id: e.id_modelo }); continue; }
    enregs.push(e);
  }

  const ids = enregs.map(e => vide(e.id_modelo));
  const doublons = ids.filter((x, i) => ids.indexOf(x) !== i);

  const dejaEnBase = new Set(
    db.prepare('SELECT id_modelo FROM op_contacts').all().map(r => r.id_modelo));
  const creees = enregs.filter(e => !dejaEnBase.has(vide(e.id_modelo))).length;
  const majs = enregs.length - creees;

  const compte = {
    lignes_lues: v.lignes.length - 1,
    retenues: enregs.length,
    creees, majs,
    rejets, doublons: [...new Set(doublons)],
    comptes_a_creer: comptesDepuis(enregs).length,
  };

  if (simulation) return { ok: true, simulation: true, ...compte };

  const ecrire = db.transaction(() => {
    const ins = db.prepare(INSERT);
    for (const e of enregs) {
      ins.run({
        id_modelo: vide(e.id_modelo),
        a_dispatcher: bool(e.a_dispatcher),
        conseiller: vide(e.conseiller),
        suggestion_conseiller: vide(e.suggestion_conseiller),
        suggestion_base: vide(e.suggestion_base),
        situation: vide(e.situation),
        conseiller_precedent: vide(e.conseiller_precedent),
        prenom_a_dire: vide(e.prenom_a_dire),
        dossier_repris: bool(e.dossier_repris),
        script: parseInt(e.script, 10),
        courrier_etat: normCourrier(e.courrier_etat),
        courrier_motif: vide(e.courrier_motif),
        role: normRole(e.role),
        civilite: vide(e.civilite), nom: vide(e.nom), prenom: vide(e.prenom),
        adresse: vide(e.adresse), complement: vide(e.complement),
        code_postal: vide(e.code_postal), commune: vide(e.commune),
        adresse_fiable: bool(e.adresse_fiable),
        tel_portable: vide(e.tel_portable), tel_fixe: vide(e.tel_fixe),
        email: vide(e.email), email_valide: bool(e.email_valide),
        stop_telephone: bool(e.stop_telephone), stop_mail: bool(e.stop_mail),
        bien_concerne: vide(e.bien_concerne),
        partie_au_registre: vide(e.partie_au_registre),
        agence: vide(e.agence), secteur: vide(e.secteur),
        objectif_principal: normObjectif(e.objectif_principal),
        fiche_a_corriger: bool(e.fiche_a_corriger),
      });
    }
  });
  ecrire();

  let comptes = { crees: 0, dejaLa: [] };
  if (motDePasseProvisoire) comptes = creerComptes(enregs, motDePasseProvisoire);

  db.prepare(`INSERT INTO op_imports (user_id, fichier, simulation, lignes_lues, creees, majs, ignorees, detail)
    VALUES (?,?,0,?,?,?,?,?)`).run(
    userId, fichier, compte.lignes_lues, creees, majs, rejets.length,
    JSON.stringify({ rejets: rejets.slice(0, 50), doublons: compte.doublons, comptes }));

  return { ok: true, ...compte, comptes };
}

module.exports = { importer, verifier, decouper, lignesDe, comptesDepuis, separerNom, COLONNES_ATTENDUES };
