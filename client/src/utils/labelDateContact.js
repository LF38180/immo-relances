// Libellé contextuel du champ date (prochain_contact) selon le statut du contact.
export function labelDateContact(statut) {
  if (statut === 'rdv_obtenu') return 'Date du rendez-vous'
  if (statut === 'rappel_planifie' || statut === 'a_recontacter') return 'Date de rappel'
  return 'Prochain contact'
}
