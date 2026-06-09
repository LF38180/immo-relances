// Jalons "2,7,15,30" -> [2,7,15,30]
export function parseJalons(str) {
  const arr = String(str || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0)
  return arr.length ? arr : [2, 7, 15, 30]
}

// Renvoie l'info cadencier d'un contact, ou null si pas concerné.
// contact: { date_estimation, cadence_etape, mandat_signe, statut }
export function infoCadence(contact, jalons) {
  if (!contact || !contact.date_estimation || contact.mandat_signe) return null
  if (['pas_interesse', 'inactif'].includes(contact.statut)) return null
  const etape = contact.cadence_etape || 0
  if (etape >= jalons.length) return null
  return { jalonJours: jalons[etape], etape, total: jalons.length }
}
