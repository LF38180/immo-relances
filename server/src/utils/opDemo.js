// Quatre contacts fictifs, pour montrer l'outil sans toucher aux vrais.
//
// La démo du 3 novembre doit dérouler les quatre scripts devant quinze
// personnes. Prendre de vraies fiches poserait deux problèmes : les appels de
// démonstration compteraient dans les statistiques de l'agent, et un numéro
// affiché au tableau est un numéro composé par erreur.
//
// Ces fiches ne sont donc pas en base. Elles vivent ici, en dur, et la session
// de démonstration les sert telles quelles. Rien de ce qui y est saisi n'est
// enregistré — c'est le point : on peut tout essayer, deux fois, devant tout
// le monde.
//
// Les numéros sont en 0639 98 xx xx, la plage que l'ARCEP réserve à la fiction
// (aucun abonné ne peut l'obtenir). Un agent qui compose par réflexe ne
// dérangera personne.

const CONTACTS = [
  {
    id_modelo: 'DEMO-1', script: 1, courrier_etat: 'ENVOYE',
    civilite: 'M. et Mme.', nom: 'EXEMPLE', prenom: 'Paul & Sophie',
    adresse: '12 Rue des Alpes', code_postal: '38000', commune: 'Grenoble',
    adresse_fiable: 1, tel_portable: '0639980001', email: 'paul.exemple@example.com',
    email_valide: 1, conseiller_precedent: null, prenom_a_dire: null,
    bien_concerne: 'DEMO-1 Appartement, 12 Rue des Alpes 38000 Grenoble',
    bien_type: "l'appartement", bien_voie: '12 Rue des Alpes', bien_commune: 'Grenoble',
    situation: 'Vendu en 2023, achat dans la foulée',
  },
  {
    id_modelo: 'DEMO-2', script: 2, courrier_etat: 'NON_IMPRIME',
    civilite: 'Mme.', nom: 'DEMONSTRATION', prenom: 'Claire',
    adresse: '4 Allée du Lac', code_postal: '38240', commune: 'Meylan',
    adresse_fiable: 1, tel_portable: '0639980002', email: 'claire.demo@example.com',
    email_valide: 1, conseiller_precedent: null, prenom_a_dire: null,
    bien_concerne: 'DEMO-2 Maison, 4 Allée du Lac 38240 Meylan',
    bien_type: 'la maison', bien_voie: '4 Allée du Lac', bien_commune: 'Meylan',
    situation: "Pas de courrier envoyé : l'ouverture change",
  },
  {
    id_modelo: 'DEMO-3', script: 3, courrier_etat: 'ENVOYE',
    civilite: 'M.', nom: 'ESSAI', prenom: 'Marc',
    adresse: '27 Avenue de la Gare', code_postal: '38600', commune: 'Fontaine',
    adresse_fiable: 1, tel_portable: '0639980003', email: 'marc.essai@example.com',
    email_valide: 1, conseiller_precedent: 'Charlotte SOLER', prenom_a_dire: 'Charlotte',
    bien_concerne: 'DEMO-3 Appartement, 27 Avenue de la Gare 38600 Fontaine',
    bien_type: "l'appartement", bien_voie: '27 Avenue de la Gare', bien_commune: 'Fontaine',
    situation: 'Dossier repris : le prénom à dire apparaît en tête',
  },
  {
    id_modelo: 'DEMO-4', script: 4, courrier_etat: 'A_APPELER',
    civilite: 'M. et Mme.', nom: 'MODELE', prenom: 'Jean & Lucie',
    adresse: '9 Chemin des Vignes', code_postal: '38700', commune: 'Corenc',
    adresse_fiable: 0, tel_portable: '0639980004', email: 'jean.modele@example.com',
    email_valide: 1, conseiller_precedent: 'Corinne MARTIN', prenom_a_dire: 'Corinne',
    bien_concerne: 'DEMO-4 Maison, 9 Chemin des Vignes 38700 Corenc',
    bien_type: 'la maison', bien_voie: '9 Chemin des Vignes', bien_commune: 'Corenc',
    situation: "Adresse fausse et dossier repris : le cas le plus difficile",
  },
];

// Les champs qu'une vraie fiche porte et qu'on laisse à zéro : la démo ne doit
// déclencher ni avertissement ni compteur.
const NEUTRE = {
  a_dispatcher: 0, dossier_repris: 0, stop_telephone: 0, stop_mail: 0,
  a_verifier: 0, verifie: null, verifie_par: null, fiche_a_corriger: 0,
  point_attention: null, complement: null, tel_fixe: null, secteur: null,
  partie_au_registre: null, courrier_motif: null, suggestion_conseiller: null,
  suggestion_base: null, objectif_principal: null, role: 'VENDEUR',
  appels_ce_mois: 0, appels_total: 0, dernier_appel_le: null,
  derniere_issue: null, rappel_le: null, dernier_par: null, derniere_note: null,
};

// Les quatre fiches, prêtes à servir comme une file d'appel ordinaire.
function fichesDemo(conseiller, agence) {
  return CONTACTS.map(c => ({ ...NEUTRE, ...c, conseiller, agence }));
}

module.exports = { fichesDemo, CONTACTS };
