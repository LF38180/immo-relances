// Logique pure partagée (testable sous node). Pas d'import DOM ici.
const BALISES = /<(b|strong|i|em|u|br|div|p)(\s|>|\/|$)/i

// Vrai si le contenu contient une de nos balises de mise en forme connues.
// Un "<" isolé (ex: "x < 3") ne déclenche pas la détection.
function contientHtml(contenu) {
  if (!contenu) return false
  return BALISES.test(contenu)
}

module.exports = { contientHtml, BALISES }
