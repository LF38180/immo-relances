import DOMPurify from 'dompurify'

// Balises de mise en forme autorisées : gras, italique, souligné + structure minimale.
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'p']
const BALISES = /<(b|strong|i|em|u|br|div|p)(\s|>|\/)/i

// Vrai si le contenu contient une de nos balises connues (sinon = texte brut hérité).
export function contientHtml(contenu) {
  if (!contenu) return false
  return BALISES.test(contenu)
}

// Nettoie le HTML : ne garde que G/I/U + sauts/paragraphes, aucun attribut.
export function sanitizeContenu(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}
