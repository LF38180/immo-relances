// Détecte le format d'un export Modelo d'après ses en-têtes.
export function detecterFormat(headers) {
  const h = headers.map(x => String(x).toLowerCase().trim())
  const has = (s) => h.some(x => x === s.toLowerCase())
  if (has('Référence') && has('Prix de vente')) return 'bien'
  return 'contact'
}

// Tokens de tête à retirer du nom. CIVILITES = vrais titres (forment la civilité) ;
// les suffixes 'ses'/'consorts' sont retirés du nom mais ne font PAS partie de la civilité.
const CIVILITES = new Set(['m.', 'm', 'mr', 'mr.', 'mme', 'mme.', 'mlle', 'mlle.', 'et', '&'])
const TITRES = new Set([...CIVILITES, 'ses', 'consorts'])

// Forme d'affichage normalisée d'un token civilité.
function formatCivToken(t) {
  const l = t.toLowerCase()
  if (l === 'm.' || l === 'm' || l === 'mr' || l === 'mr.') return 'M.'
  if (l === 'mme' || l === 'mme.') return 'Mme'
  if (l === 'mlle' || l === 'mlle.') return 'Mlle'
  if (l === 'et') return 'et'
  if (l === '&') return 'et'
  return t
}

// Extrait la civilité de tête d'une chaîne ("M. et Mme. GRIS" -> "M. et Mme", "Mme. RAMSTEINER" -> "Mme").
export function extraireCivilite(s) {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean)
  const civ = []
  for (const p of parts) {
    if (CIVILITES.has(p.toLowerCase())) civ.push(formatCivToken(p))
    else break
  }
  return civ.join(' ')
}

// "M. Michaël MERCYANO" -> { civilite: 'M.', prenom: 'Michaël', nom: 'MERCYANO' }
// "M. et Mme. GRIS"     -> { civilite: 'M. et Mme', prenom: '', nom: 'GRIS' } (couple : pas de prénom)
export function splitNomComplet(s) {
  const civilite = extraireCivilite(s)
  let parts = String(s || '').trim().split(/\s+/).filter(Boolean)
  while (parts.length && TITRES.has(parts[0].toLowerCase())) parts = parts.slice(1)
  if (parts.length === 0) return { civilite, prenom: '', nom: '' }
  if (parts.length === 1) return { civilite, prenom: '', nom: parts[0] }
  return { civilite, prenom: parts[0], nom: parts.slice(1).join(' ') }
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
  const { civilite, prenom, nom } = splitNomComplet(row['Nom, Prenom'])
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
    civilite, prenom, nom,
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
