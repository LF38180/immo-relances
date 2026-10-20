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
    titre: s.titre,
    pdf: s.pdf,
    client: nomComplet,
    // Affiché seulement quand il sert : un prénom isolé sur un script 1 ferait
    // croire à l'agent qu'il doit le prononcer.
    prenom_a_dire: s.prenomADire ? (contact.prenom_a_dire || null) : null,
    bien: contact.bien_concerne || null,
    // Le millésime est en tête de la référence du bien (« JP-4793 T5… »), pas
    // dans une colonne propre : on ne l'invente pas s'il n'y est pas.
    commune: contact.commune || null,
    // Pourquoi cet appel, en une ligne, pour que l'agent sache où il met les
    // pieds avant la première seconde.
    contexte: contexteAppel(contact),
  };
}

// Les 307 fiches « objectif adresse » ne sont PAS des courriers revenus : les
// plis sont partis la semaine dernière et les NPAI mettront des semaines à
// nous parvenir. Ce sont des personnes à qui on a renoncé à écrire — 261 dont
// l'adresse était fausse (souvent un vendeur encore fiché à l'adresse du bien
// qu'il a vendu), 46 dont l'identité n'a pas pu être établie. La nuance change
// la phrase de l'agent : il n'appelle pas après un échec d'envoi, il appelle
// quelqu'un à qui on n'a jamais écrit.
function contexteAppel(c) {
  if (c.objectif_principal === 'ADRESSE') {
    return c.courrier_etat === 'A_TRANCHER'
      ? "Identité incertaine : vérifier d'abord que c'est la bonne personne. Le courrier n'a pas été envoyé."
      : "Adresse inconnue ou erronée : le courrier n'a pas été envoyé. Objectif premier de l'appel : récupérer l'adresse.";
  }
  if (c.courrier_etat === 'NON_IMPRIME')
    return "Le courrier n'a pas été envoyé, mais l'adresse est bonne : proposer de le renvoyer par mail.";
  return 'Le courrier du président lui a été envoyé la semaine dernière.';
}

module.exports = { SCRIPTS, enTete, contexteAppel };
