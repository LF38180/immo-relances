// Soirée des anciens clients du 3 décembre : qui inviter, et comment.
//
// Les invitations partent hors de l'appli (Emma et Loïck), par vagues. Ici on
// trie, on exporte ceux qui n'ont rien reçu, puis on réimporte ce qui est
// parti. Le tri est recalculé à chaque lecture : un appel enregistré entre
// deux exports change la liste suivante, jamais ce qui a déjà été envoyé.
//
// Règles arrêtées avec Loïck le 20/11/2026 :
//  - joint + soirée = oui            → invitation personnalisée ;
//  - jamais joint, ou jamais appelé  → invitation générique ;
//  - joint sans « oui »              → pas d'invitation. Le champ soirée ne
//    distingue pas « non » de « pas abordé » : les 53 fiches douteuses
//    comptent en non ;
//  - portefeuille de Céline Evrard, identités non établies, oppositions,
//    décès, erreurs de personne : jamais d'invitation ;
//  - une seule invitation par adresse e-mail (un couple = un envoi).
const { db } = require('../database');

const TYPES = ['PERSONNALISEE', 'GENERIQUE'];
const CANAUX_MAIN = ['SMS', 'TELEPHONE'];
// Conseillers dont le portefeuille est sorti de la soirée (ils appellent pour
// les estimations seulement).
const HORS_SOIREE = ['celine evrard'];

// Casse, accents et espaces ignorés : « Céline EVRARD » = « celine evrard ».
const plier = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const emailPropre = (s) => String(s || '').trim().toLowerCase();
const emailPlausible = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const MOTIFS = {
  OPPOSITION: 'Opposition ou refus ferme',
  DECEDE: 'Décédé',
  ERREUR_IDENTITE: 'Erreur de personne',
  IDENTITE_NON_ETABLIE: 'Identité non établie (fiche sortie)',
  PORTEFEUILLE_HORS_SOIREE: 'Portefeuille de Céline',
  A_DIT_NON: 'Joint, n’a pas dit oui',
};

function lire() {
  const fiches = db.prepare(`
    SELECT c.id_modelo, c.civilite, c.nom, c.prenom, c.conseiller, c.a_dispatcher,
           c.email, c.email_valide, c.stop_mail, c.a_verifier, c.verifie,
           r.email_maj, COALESCE(r.soiree, 0) AS soiree,
      EXISTS (SELECT 1 FROM op_journal_opposition o WHERE o.id_modelo = c.id_modelo) AS oppose,
      (SELECT GROUP_CONCAT(DISTINCT a.issue) FROM op_appels a WHERE a.id_modelo = c.id_modelo) AS issues,
      (SELECT a.conseiller FROM op_appels a WHERE a.id_modelo = c.id_modelo AND a.issue = 'JOINT'
        ORDER BY a.horodatage DESC, a.id DESC LIMIT 1) AS appele_par
    FROM op_contacts c LEFT JOIN op_resultats r ON r.id_modelo = c.id_modelo
    ORDER BY c.nom, c.prenom, c.id_modelo`).all();
  const invitations = db.prepare(`SELECT id, id_modelo, type, email, envoye_le, vague, canal, par
    FROM op_invitations WHERE annulee_le IS NULL ORDER BY id`).all();
  return { fiches, invitations };
}

// Le tri complet. Chaque fiche reçoit un `statut` et un seul :
//   A_INVITER      dans le prochain export (type PERSONNALISEE ou GENERIQUE)
//   INVITE         invitation déjà partie (ou adresse déjà servie par une autre fiche)
//   MEME_EMAIL     même adresse qu'une autre fiche à inviter : un seul envoi
//   STOP_MAIL      à inviter, mais pas par mail
//   SANS_EMAIL     à inviter, mais pas d'adresse utilisable
//   EXCLU          jamais d'invitation, avec son motif
function trier() {
  const { fiches, invitations } = lire();
  const parFiche = new Map(), parEmail = new Map();
  for (const i of invitations) {
    if (!parFiche.has(i.id_modelo)) parFiche.set(i.id_modelo, i);
    const e = emailPropre(i.email);
    if (e && !parEmail.has(e)) parEmail.set(e, i);
  }

  const lignes = fiches.map((f) => {
    const issues = new Set(String(f.issues || '').split(',').filter(Boolean));
    const joint = issues.has('JOINT');
    // L'adresse recueillie au téléphone prime sur celle de la fiche.
    const maj = emailPropre(f.email_maj);
    const email = emailPlausible(maj) ? maj
      : (f.email_valide && emailPlausible(emailPropre(f.email)) ? emailPropre(f.email) : '');
    const l = {
      id_modelo: f.id_modelo, civilite: f.civilite || '', nom: f.nom || '', prenom: f.prenom || '',
      email, conseiller: (joint && f.appele_par) || f.conseiller || '',
      joint, oui: joint && f.soiree === 1,
      type: joint && f.soiree === 1 ? 'PERSONNALISEE' : 'GENERIQUE',
      statut: null, motif: null, invitation: null, a_confirmer: false,
    };

    let motif = null;
    if (f.oppose || issues.has('REFUS_FERME')) motif = 'OPPOSITION';
    else if (issues.has('DECEDE')) motif = 'DECEDE';
    else if (issues.has('ERREUR_IDENTITE')) motif = 'ERREUR_IDENTITE';
    else if (f.a_verifier && (f.verifie == null || f.verifie === 'ECARTE')) motif = 'IDENTITE_NON_ETABLIE';
    else if (HORS_SOIREE.includes(plier(f.conseiller))) motif = 'PORTEFEUILLE_HORS_SOIREE';
    else if (joint && f.soiree !== 1) motif = 'A_DIT_NON';

    const inv = parFiche.get(f.id_modelo) || (email && parEmail.get(email)) || null;
    if (inv) {
      // Ce qui est parti est parti : on le dit, même si la fiche est exclue depuis.
      l.statut = 'INVITE';
      l.invitation = { type: inv.type, vague: inv.vague, envoye_le: inv.envoye_le, canal: inv.canal, par: inv.par,
        via: inv.id_modelo === f.id_modelo ? null : inv.id_modelo };
      l.motif = motif;
      // Bascule : générique reçue, puis « oui » au téléphone. Rien de plus à
      // envoyer, mais son conseiller doit enregistrer sa réponse.
      l.a_confirmer = inv.type === 'GENERIQUE' && l.oui && !motif;
      return l;
    }
    if (motif) { l.statut = 'EXCLU'; l.motif = motif; return l; }
    if (f.stop_mail) { l.statut = 'STOP_MAIL'; return l; }
    if (!email) { l.statut = 'SANS_EMAIL'; return l; }
    l.statut = 'A_INVITER';
    return l;
  });

  // Une invitation par adresse : la personnalisée l'emporte, puis l'ordre du fichier.
  const garde = new Map();
  for (const l of lignes) {
    if (l.statut !== 'A_INVITER') continue;
    const g = garde.get(l.email);
    if (!g || (g.type === 'GENERIQUE' && l.type === 'PERSONNALISEE')) garde.set(l.email, l);
  }
  for (const l of lignes) {
    if (l.statut !== 'A_INVITER') continue;
    const g = garde.get(l.email);
    if (g !== l) { l.statut = 'MEME_EMAIL'; l.meme_que = g.id_modelo; }
  }
  return lignes;
}

function compter(lignes) {
  const n = (f) => lignes.filter(f).length;
  const exclus = {};
  for (const l of lignes) if (l.statut === 'EXCLU') exclus[l.motif] = (exclus[l.motif] || 0) + 1;
  const vagues = db.prepare(`SELECT vague, MIN(envoye_le) AS envoye_le, COUNT(*) AS n,
      SUM(type = 'PERSONNALISEE') AS personnalisees, SUM(type = 'GENERIQUE') AS generiques,
      MAX(par) AS par, MAX(fichier) AS fichier, MAX(annulee_le) AS annulee_le
    FROM op_invitations WHERE vague > 0 GROUP BY vague ORDER BY vague`).all();
  return {
    total: lignes.length,
    a_inviter: {
      personnalisee: n(l => l.statut === 'A_INVITER' && l.type === 'PERSONNALISEE'),
      generique: n(l => l.statut === 'A_INVITER' && l.type === 'GENERIQUE'),
    },
    invites: {
      total: n(l => l.statut === 'INVITE'),
      personnalisee: n(l => l.statut === 'INVITE' && l.invitation.type === 'PERSONNALISEE'),
      generique: n(l => l.statut === 'INVITE' && l.invitation.type === 'GENERIQUE'),
      // Fiches couvertes par l'envoi fait à une autre fiche de même adresse.
      meme_adresse: n(l => l.statut === 'INVITE' && l.invitation.via),
      par_sms: n(l => l.statut === 'INVITE' && l.invitation.canal === 'SMS'),
      par_telephone: n(l => l.statut === 'INVITE' && l.invitation.canal === 'TELEPHONE'),
    },
    a_confirmer: n(l => l.a_confirmer),
    meme_email: n(l => l.statut === 'MEME_EMAIL'),
    stop_mail: n(l => l.statut === 'STOP_MAIL'),
    sans_email: n(l => l.statut === 'SANS_EMAIL'),
    exclus: { total: n(l => l.statut === 'EXCLU'), ...exclus },
    vagues,
  };
}

// Retour d'une vague : le fichier exporté, tel quel, ou avec une colonne
// « envoye » à « non » pour ce qui n'est pas parti. En simulation, rien n'est
// écrit : on rend ce qui serait fait, ligne par ligne.
function importerEnvoi({ lignes, envoye_le, fichier, par, simulation }) {
  const tri = new Map(trier().map(l => [l.id_modelo, l]));
  const vague = (db.prepare('SELECT COALESCE(MAX(vague), 0) AS v FROM op_invitations').get().v) + 1;
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(envoye_le || '')) ? envoye_le : new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const acceptees = [], rejetees = [], non_envoyees = [], alertes = [];
  const vus = new Set(), emailsVague = new Set();

  for (const [i, brut] of lignes.entries()) {
    const id = String(brut.id_modelo || '').trim();
    const rejet = (motif) => rejetees.push({ ligne: i + 2, id_modelo: id, nom: brut.nom || '', prenom: brut.prenom || '', motif });
    if (!id) { rejet('identifiant Modelo manquant'); continue; }
    const l = tri.get(id);
    if (!l) { rejet('identifiant inconnu dans l’opération'); continue; }
    if (plier(brut.nom) !== plier(l.nom) || plier(brut.prenom) !== plier(l.prenom)) {
      rejet(`le nom ne correspond pas (fiche : ${l.nom} ${l.prenom})`); continue;
    }
    if (vus.has(id)) { rejet('ligne en double dans le fichier'); continue; }
    vus.add(id);
    if (/^(non|n|0|faux|false)$/i.test(String(brut.envoye ?? '').trim())) { non_envoyees.push(id); continue; }
    if (l.statut === 'INVITE') {
      rejet(`déjà invitée (vague ${l.invitation.vague}${l.invitation.via ? ', même adresse qu’une autre fiche' : ''})`); continue;
    }
    const t = plier(brut.type || brut['type d invitation'] || brut.type_invitation || '');
    const type = t.startsWith('perso') ? 'PERSONNALISEE' : t.startsWith('gener') ? 'GENERIQUE' : l.type;
    const email = emailPropre(brut.email || brut['e-mail'] || '') || l.email;
    if (email && emailsVague.has(email)) { rejet('même adresse e-mail qu’une autre ligne du fichier'); continue; }
    if (email) emailsVague.add(email);
    // Parti malgré une exclusion survenue depuis l'export : on enregistre ce
    // qui s'est réellement passé, et on le signale.
    if (l.statut === 'EXCLU') alertes.push({ id_modelo: id, nom: l.nom, prenom: l.prenom, motif: MOTIFS[l.motif] });
    acceptees.push({ id_modelo: id, type, email });
  }

  if (!simulation && acceptees.length) {
    const ins = db.prepare(`INSERT INTO op_invitations (id_modelo, type, email, envoye_le, vague, par, fichier)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    db.transaction(() => { for (const a of acceptees) ins.run(a.id_modelo, a.type, a.email || null, jour, vague, par || null, fichier || null); })();
  }
  return {
    simulation: !!simulation, vague: acceptees.length ? vague : null, envoye_le: jour,
    acceptees: acceptees.length,
    personnalisees: acceptees.filter(a => a.type === 'PERSONNALISEE').length,
    generiques: acceptees.filter(a => a.type === 'GENERIQUE').length,
    non_envoyees: non_envoyees.length, rejetees, alertes,
  };
}

// Invitation faite autrement que par mail (SMS, téléphone) : notée à la main,
// une fiche à la fois. Refusée pour une fiche exclue ou déjà invitée.
function noterInvitation({ id_modelo, canal, envoye_le, par }) {
  if (!CANAUX_MAIN.includes(canal)) return { erreur: 'Moyen attendu : SMS ou téléphone' };
  const l = trier().find(x => x.id_modelo === id_modelo);
  if (!l) return { erreur: 'Fiche introuvable', statut: 404 };
  if (l.statut === 'INVITE') return { erreur: 'Cette personne est déjà notée comme invitée' };
  if (l.statut === 'EXCLU') return { erreur: `Pas d’invitation pour cette fiche : ${MOTIFS[l.motif]}` };
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(envoye_le || '')) ? envoye_le : new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  db.prepare(`INSERT INTO op_invitations (id_modelo, type, email, envoye_le, vague, par, canal)
    VALUES (?, ?, ?, ?, 0, ?, ?)`).run(id_modelo, l.type, l.email || null, jour, par || null, canal);
  return { ok: true, type: l.type, canal, envoye_le: jour };
}

// Un clic de trop : on annule, la ligne reste en base. Les envois par mail
// s'annulent par vague, pas ici.
function annulerInvitationManuelle({ id_modelo, par }) {
  const r = db.prepare(`UPDATE op_invitations SET annulee_le = datetime('now'), annulee_par = ?
    WHERE id_modelo = ? AND vague = 0 AND annulee_le IS NULL`).run(par || null, id_modelo);
  return r.changes;
}

module.exports = { trier, compter, importerEnvoi, noterInvitation, annulerInvitationManuelle, MOTIFS, TYPES, plier };
