import api from '../utils/api'

// Mode démonstration des missions Estimés et Courtage.
//
// Les écrans de Chrystelle et de Marine ne sont pas modifiés : on les affiche
// tels quels, et c'est la couche réseau qui est remplacée le temps de la
// démonstration. Toute LECTURE reçoit une réponse fictive, capturée une fois
// sur de faux contacts (numéros en 0639 98, adresses @example.com). Toute
// ÉCRITURE est acquittée sans jamais partir vers le serveur : rien de ce qui
// est saisi en démonstration n'est enregistré.
//
// La garantie tient en une règle : tant que la démonstration est active,
// AUCUNE requête ne sort de cette page.

// Les dates capturées sont décalées pour rester « aujourd'hui » le jour de la démo.
const DATE = /^(\d{4}-\d{2}-\d{2})([ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/
function decaler(v, jours) {
  if (typeof v === 'string') {
    const m = v.match(DATE)
    if (!m) return v
    const d = new Date(m[1] + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + jours)
    return d.toISOString().slice(0, 10) + (m[2] || '')
  }
  if (Array.isArray(v)) return v.map(x => decaler(x, jours))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decaler(x, jours)]))
  return v
}

const reponse = (config, data, status = 200) => Promise.resolve({ data, status, statusText: 'OK', headers: {}, config, request: {} })

export function activerDemo(jeu) {
  const jours = Math.round((Date.now() - new Date(jeu.capture + 'T12:00:00Z').getTime()) / 86400000)
  const routes = decaler(jeu.routes, jours)
  const traitees = new Set()   // fiches « traitées » pendant la démo : elles quittent la liste, comme en vrai
  const avant = api.defaults.adapter

  api.defaults.adapter = (config) => {
    const url = new URL(config.url, 'http://demo')
    for (const [k, v] of Object.entries(config.params || {})) if (v != null) url.searchParams.set(k, v)
    const chemin = url.pathname, q = url.searchParams
    const methode = (config.method || 'get').toLowerCase()

    if (methode !== 'get') {
      // Écriture : acquittée, jamais envoyée.
      const m = chemin.match(/^\/courtage\/fiches\/(\d+)\/(relance|trop-tot|pas-de-reponse|mail-propose)$/)
      if (m) traitees.add(Number(m[1]))
      if (m && m[2] === 'pas-de-reponse') return reponse(config, { tentatives: 1, statut: 'en_relance' })
      if (chemin === '/courtage/modele-mail') return reponse(config, typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data || {}))
      return reponse(config, { ok: true, id: 9000 + Math.floor(Math.random() * 900), demo: true }, methode === 'post' ? 201 : 200)
    }

    const sansTraitees = (l) => Array.isArray(l) ? l.filter(f => !traitees.has(f.id)) : l
    const complet = chemin + (url.search || '')
    if (routes[complet] !== undefined) return reponse(config, sansTraitees(routes[complet]))

    // Recherche dans le Fichier Estimés : on filtre la file fictive.
    if (chemin === '/contacts' && q.get('search')) {
      const s = q.get('search').toLowerCase()
      const contacts = (routes['/contacts/file-relances']?.contacts || []).filter(c => `${c.nom} ${c.prenom} ${c.telephone}`.toLowerCase().includes(s))
      return reponse(config, { contacts, total: contacts.length, page: 1, limit: 8 })
    }
    // Courtage : relances du jour, par boîte ; recherche et liste des fiches.
    if (chemin === '/courtage/fiches/relances-jour') {
      const b = q.get('boite') || ''
      const cle = b === 'relances' ? '/courtage/fiches/relances-jour?tri=recent&qualification=&boite=relances'
        : b ? `/courtage/fiches/relances-jour?boite=${b}` : '/courtage/fiches/relances-jour?tri=recent&qualification=&boite='
      let l = sansTraitees(routes[cle] || [])
      const qual = q.get('qualification')
      if (qual === 'a_qualifier') l = l.filter(f => f.categorie === 'a_qualifier')
      if (qual === 'qualifie') l = l.filter(f => f.categorie !== 'a_qualifier')
      return reponse(config, l)
    }
    if (chemin === '/courtage/fiches') {
      let l = routes['/courtage/fiches'] || []
      const s = (q.get('q') || '').toLowerCase()
      if (s) l = l.filter(f => `${f.nom} ${f.prenom} ${f.telephone} ${f.mail}`.toLowerCase().includes(s))
      if (q.get('statut')) l = l.filter(f => f.statut === q.get('statut'))
      if (q.get('categorie')) l = l.filter(f => f.categorie === q.get('categorie'))
      return reponse(config, l)
    }
    if (routes[chemin] !== undefined) return reponse(config, sansTraitees(routes[chemin]))
    // Lecture inconnue : une liste vide, jamais le vrai serveur.
    return reponse(config, [])
  }
  return () => { api.defaults.adapter = avant }
}
