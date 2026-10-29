// Scripts d'appel de l'opération anciens clients.
//
// Le script est importé, jamais recalculé : il dépend du conseiller qui suivait
// la fiche avant, donnée Modelo que l'application n'a pas.
//
// Les PDF mis en page sont affichés tels quels à l'agent. Mais un PDF est
// statique : il ne peut pas substituer le prénom de l'ancien conseiller, et ce
// prénom est renseigné sur les 341 fiches des scripts 3 et 4 — exactement
// celles où l'ouverture en dépend (« je reprends les dossiers qui étaient
// suivis par Charlotte »). D'où le bloc d'en-tête ci-dessous, affiché à côté
// du PDF, qui porte les variables déjà remplacées.

const SCRIPTS = {
  1: { titre: 'Son client · courrier reçu',
       pdf: '/operation/scripts/script-1.pdf',
       prenomADire: false },
  2: { titre: 'Son client · courrier non envoyé',
       pdf: '/operation/scripts/script-2.pdf',
       prenomADire: false },
  3: { titre: 'Dossier repris · courrier reçu',
       pdf: '/operation/scripts/script-3.pdf',
       prenomADire: true },
  4: { titre: 'Dossier repris · courrier non envoyé',
       pdf: '/operation/scripts/script-4.pdf',
       prenomADire: true },
};

// Ce que l'agent doit avoir sous les yeux avant de décrocher. Quatre champs
// pour les scripts 1 et 2, cinq pour les 3 et 4.
function enTete(contact) {
  const s = SCRIPTS[contact.script] || SCRIPTS[1];
  const nomComplet = [contact.civilite, contact.prenom, contact.nom].filter(Boolean).join(' ');
  return {
    script: contact.script,
    // Le numéro et le PDF ne bougent pas pour un NPAI : le script encode qui
    // suivait le dossier, pas le sort du pli, et basculer un script 1 en 2
    // ferait chercher à l'agent un prénom d'ancien conseiller qui n'existe
    // pas. C'est le titre affiché à côté du PDF qui porte l'information.
    titre: contact.npai ? titreNpai(contact.script) : s.titre,
    pdf: s.pdf,
    npai: contact.npai ? 1 : 0,
    client: nomComplet,
    // Affiché seulement quand il sert : un prénom isolé sur un script 1 ferait
    // croire à l'agent qu'il doit le prononcer.
    prenom_a_dire: s.prenomADire ? (contact.prenom_a_dire || null) : null,
    // Le nom complet accompagne le prénom : deux Charlotte sont passées par
    // l'agence, et un client qui demande « Charlotte comment ? » ne doit pas
    // laisser l'agent sans réponse. On prononce le prénom, on garde le nom
    // sous les yeux.
    ancien_conseiller: s.prenomADire ? (contact.conseiller_precedent || null) : null,
    bien: contact.bien_concerne || null,
    // Le millésime est en tête de la référence du bien (« JP-4793 T5… »), pas
    // dans une colonne propre : on ne l'invente pas s'il n'y est pas.
    commune: contact.commune || null,
    // Pourquoi cet appel, en une ligne, pour que l'agent sache où il met les
    // pieds avant la première seconde.
    contexte: contexteAppel(contact),
  };
}

// Une ligne de contexte, pour que l'agent sache où il met les pieds avant la
// première seconde.
//
// Les courriers reviennent désormais : quarante NPAI saisis le 29 octobre, et
// d'autres suivront pendant l'opération. Le NPAI passe donc avant
// courrier_etat — une fiche revenue est marquée ENVOYE, et sans cette priorité
// l'agent lirait qu'un courrier a bien été reçu alors que le pli est sur le
// bureau du manager. Si le client dit « je n'ai rien reçu », l'agent doit
// savoir que c'est normal.
//
// L'identité incertaine reste au-dessus : savoir à qui l'on parle précède tout
// le reste.
function contexteAppel(c) {
  if (c.a_verifier) {
    return "Identité non confirmée : vérifiez que c'est la bonne personne avant de parler du bien.";
  }
  if (c.npai) {
    return "Le courrier lui a été envoyé mais nous est revenu : son adresse est fausse. "
      + "C'est elle qu'il faut récupérer.";
  }
  if (c.courrier_etat === 'A_APPELER') {
    return "Le courrier n'a pas été envoyé : son adresse était fausse ou absente.";
  }
  if (c.courrier_etat === 'NON_IMPRIME') {
    return "Le courrier n'a pas été envoyé, mais l'adresse est bonne.";
  }
  return 'Le courrier du président lui a été envoyé la semaine dernière.';
}

// Le titre d'un script dont le courrier est revenu. « courrier reçu » devient
// faux dès le retour du pli, et c'est la première ligne que l'agent lit.
function titreNpai(script) {
  const repris = script === 3 || script === 4;
  return `${repris ? 'Dossier repris' : 'Son client'} · courrier revenu (NPAI)`;
}

module.exports = { SCRIPTS, enTete, contexteAppel, titreNpai };
