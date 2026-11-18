// Trois acquéreurs fictifs, pour montrer le Fichier Acquéreurs sans toucher
// aux vrais (même principe que la démonstration de l'opération anciens
// clients) : rien n'est en base, rien de ce qui est saisi n'est enregistré, et
// les numéros sont dans la plage 0639 98 que l'ARCEP réserve à la fiction.
const fiche = (o) => ({ type_recherche: 'Achat', alerte_mail: 1, requalif: null, decision: null, ancien_conseiller: 'Charlotte S.', ...o });
const contact = (o) => ({ civilite: 'Mme', source: 'ORPHELIN', stop_tel: 0, stop_mail: 0, appels_ce_mois: 0, appels_total: 0,
  sans_reponse_de_suite: 0, anciens_conseillers: 'Charlotte S.', ...o });

const CAS = [
  {
    situation: 'Trois recherches ouvertes depuis 2022 : un seul vrai projet aujourd’hui. On garde la bonne, on fusionne le doublon, on archive l’ancienne. Elle est propriétaire et doit vendre : on propose l’estimation.',
    contact: contact({ id_contact: 'DEMO-A1', prenom: 'Claire', nom: 'EXEMPLE', tel_portable: '0639980011', email: 'claire@example.com',
      adresse: '12 rue des Alpes', code_postal: '38240', commune: 'Meylan', type_contact: 'Acquéreur Propriétaire',
      derniere_note_date: '2024-03-12', derniere_note_auteur: 'Charlotte S.', derniere_note_extrait: 'Cherche un T3 avec balcon, budget serré', stop_mail: 1 }),
    fiches: [
      fiche({ id_fiche: 'DEMO-9001', type_bien: 'Appartement', budget_min: 250000, budget_max: 300000, surface_min: 65, pieces_min: 3, chambres_min: 2,
        localisation_mode: 'communes', communes: 'Meylan, Corenc', modifiee_periode: '2024-03', criteres_obligatoires: 'ascenseur', precisions: 'T3 lumineux, proche tram' }),
      fiche({ id_fiche: 'DEMO-9002', type_bien: 'Appartement', budget_max: 290000, surface_min: 60, pieces_min: 3,
        localisation_mode: 'communes', communes: 'Meylan', modifiee_periode: '2023-05', alerte_mail: 0 }),
      fiche({ id_fiche: 'DEMO-9003', type_bien: 'Maison', budget_max: 400000, surface_min: 100, localisation_mode: 'zone dessinée sur la carte',
        modifiee_periode: '2022-01', alerte_mail: 0, criteres_obligatoires: 'jardin' }),
    ],
  },
  {
    situation: 'Jeune couple, premier achat. Le projet est actif mais le financement n’est pas validé : on propose le rendez-vous avec Marine.',
    contact: contact({ id_contact: 'DEMO-A2', civilite: 'M.', prenom: 'Paul', nom: 'MODELE', tel_portable: '0639980012', email: 'paul@example.com',
      commune: 'Grenoble', type_contact: 'Acquéreur', derniere_note_date: '2025-06-02', derniere_note_auteur: 'Jean-Pierre D.',
      derniere_note_extrait: 'A visité deux appartements, attend son CDI', anciens_conseillers: 'Jean-Pierre D.' }),
    fiches: [fiche({ id_fiche: 'DEMO-9004', type_bien: 'Appartement', budget_max: 220000, surface_min: 45, pieces_min: 2,
      localisation_mode: 'communes', communes: 'Grenoble, Saint-Martin-d’Hères', modifiee_periode: '2025-02', ancien_conseiller: 'Jean-Pierre D.', priorite: 'Court terme' })],
  },
  {
    situation: 'Elle a acheté ailleurs il y a six mois. On note chez qui, on archive la fiche (après validation), et on coupe l’alerte.',
    contact: contact({ id_contact: 'DEMO-A3', prenom: 'Julie', nom: 'FICTIF', tel_portable: '0639980013', commune: 'Montbonnot', type_contact: 'Acquéreur',
      appels_ce_mois: 1, appels_total: 1, sans_reponse_de_suite: 1 }),
    fiches: [fiche({ id_fiche: 'DEMO-9005', type_bien: 'Maison', budget_max: 450000, surface_min: 110, localisation_mode: 'zone dessinée sur la carte', modifiee_periode: '2024-09' })],
    appels: [{ id: -1, horodatage: '2026-11-16 09:40:00', canal: 'APPEL', issue: 'REPONDEUR', madame_fichier: 'Lilas FERKOUS' }],
  },
];

function cas(scripts) {
  return CAS.map(c => ({ situation: c.situation, contact: c.contact, fiches: c.fiches, appels: c.appels || [],
    dernier_details: null, scripts, blocages: [], appel_recent: null,
    conseil_tentative: null }));
}

module.exports = { cas };
