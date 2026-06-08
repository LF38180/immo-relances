// Détecte le format d'un export Modelo d'après ses en-têtes.
export function detecterFormat(headers) {
  const h = headers.map(x => String(x).toLowerCase().trim())
  const has = (s) => h.some(x => x === s.toLowerCase())
  if (has('Référence') && has('Prix de vente')) return 'bien'
  return 'contact'
}

// Tokens de tête à retirer : civilités + conjonctions de couple.
// "M. Michaël MERCYANO" -> { prenom: 'Michaël', nom: 'MERCYANO' }
// "M. et Mme. GRIS"     -> { prenom: '', nom: 'GRIS' } (couple : pas de prénom)
const TITRES = new Set(['m.', 'm', 'mr', 'mme', 'mme.', 'mlle', 'mlle.', 'mr.', 'et', '&', 'ses', 'consorts'])
export function splitNomComplet(s) {
  let parts = String(s || '').trim().split(/\s+/).filter(Boolean)
  // Retire tous les titres/conjonctions en tête (gère "M. et Mme.", "M et Mme", etc.)
  while (parts.length && TITRES.has(parts[0].toLowerCase())) parts = parts.slice(1)
  if (parts.length === 0) return { prenom: '', nom: '' }
  if (parts.length === 1) return { prenom: '', nom: parts[0] }
  return { prenom: parts[0], nom: parts.slice(1).join(' ') }
}

// Retire les titres/conjonctions en tête d'un nom, sans séparer prénom.
// "et Mme. GRIS" -> "GRIS" ; "M. et Mme. DURAND" -> "DURAND" ; "MERCYANO" -> "MERCYANO"
export function nettoyerNomContact(s) {
  let parts = String(s || '').trim().split(/\s+/).filter(Boolean)
  while (parts.length > 1 && TITRES.has(parts[0].toLowerCase())) parts = parts.slice(1)
  return parts.join(' ')
}

// Nettoie un montant Modelo "250 000  €" -> "250 000 €" ; "0  €" / vide -> null
function prixPropre(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const chiffres = s.replace(/[^\d]/g, '')
  if (!chiffres || parseInt(chiffres, 10) === 0) return null
  return s
}

// Transforme une ligne d'export BIEN en objet contact (propriétaire vendeur).
export function bienVersContact(row) {
  const { prenom, nom } = splitNomComplet(row['Nom, Prenom'])
  const ref = String(row['Référence'] || '').trim()

  const bits = []
  if (ref) bits.push('Réf ' + ref)
  const mandat = String(row['Type de mandat'] || '').trim()
  if (mandat) bits.push('Mandat ' + mandat)
  const prix = prixPropre(row['Prix de vente'])
  if (prix) bits.push('Prix ' + prix)
  const surface = String(row['Surface'] || '').trim()
  if (surface && surface !== '0') bits.push(surface)
  const dpe = String(row['Classe DPE'] || '').trim()
  if (dpe) bits.push('DPE ' + dpe)

  // Collecte toutes les photos non vides (principale + n°1..99)
  const photos = []
  const principale = String(row['Photo principale'] || '').trim()
  if (principale) photos.push(principale)
  for (let i = 1; i <= 99; i++) {
    const p = String(row['Photo n°' + i] || '').trim()
    if (p) photos.push(p)
  }

  return {
    prenom, nom,
    email: row['E-mail'] || '',
    telephone: row['Tél. port.'] || '',
    telephone2: row['Tél. fixe'] || '',
    adresse: row['Adresse_1'] || '',
    code_postal: row['Code postal_1'] || '',
    ville: row['Commune_1'] || '',
    suivi_par_origine: row['Suivi par'] || '',
    date_estimation: row['Création'] || '',
    photo_url: photos.length ? JSON.stringify(photos) : '',
    categorie: 'vendeur',
    source: ref ? `Mandat ${ref}` : 'Mandat',
    notes: bits.join(' · '),
  }
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
