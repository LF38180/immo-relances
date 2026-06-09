// Parse "2,7,15,30" -> [2,7,15,30]. Defaut si vide/invalide.
function parseJalons(str) {
  const arr = String(str || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0)
  return arr.length ? arr : [2, 7, 15, 30]
}

// Un contact est-il "du" dans le cadencier aujourd'hui ?
// contact: { date_estimation (AAAA-MM-JJ|null), cadence_etape, mandat_signe, statut }
// jalons: number[]; today: 'AAAA-MM-JJ'
function estDuCadencier(contact, jalons, today) {
  if (!contact.date_estimation) return false
  if (contact.mandat_signe) return false
  if (['pas_interesse', 'inactif'].includes(contact.statut)) return false
  const etape = contact.cadence_etape || 0
  if (etape >= jalons.length) return false
  const base = new Date(contact.date_estimation.slice(0, 10) + 'T00:00:00Z')
  if (isNaN(base.getTime())) return false
  const echeance = new Date(base.getTime() + jalons[etape] * 86400000)
  return echeance.toISOString().slice(0, 10) <= today
}

module.exports = { parseJalons, estDuCadencier }
