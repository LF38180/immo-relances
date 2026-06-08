// Détecte le format d'un export Modelo d'après ses en-têtes.
export function detecterFormat(headers) {
  const h = headers.map(x => String(x).toLowerCase().trim())
  const has = (s) => h.some(x => x === s.toLowerCase())
  if (has('Référence') && has('Prix de vente')) return 'bien'
  return 'contact'
}

// "M. Michaël MERCYANO" -> { prenom: 'Michaël', nom: 'MERCYANO' }
export function splitNomComplet(s) {
  const clean = String(s || '').trim().replace(/^(M\.|Mme|Mlle|Mr|M)\s+/i, '').trim()
  if (!clean) return { prenom: '', nom: '' }
  const parts = clean.split(/\s+/)
  if (parts.length === 1) return { prenom: '', nom: parts[0] }
  return { prenom: parts[0], nom: parts.slice(1).join(' ') }
}

// Mappe le libellé "Type" Modelo vers une catégorie app.
export function categorieModelo(type) {
  const t = String(type || '').toLowerCase().trim()
  if (t.includes('acqu')) return 'acquereur'
  if (t.includes('vendeur')) return 'vendeur'
  if (t.includes('ancien')) return 'ancien_client'
  if (t.includes('chaud')) return 'prospect_chaud'
  if (t.includes('froid') || t.includes('prospect')) return 'prospect_froid'
  return 'autre'
}
