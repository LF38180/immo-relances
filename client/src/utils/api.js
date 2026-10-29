import axios from 'axios'

// Quinze secondes : au-delà, le réseau est mort, pas lent. Sans limite, une
// requête partie dans un ascenseur restait pendante une à deux minutes avec le
// bouton figé sur « Enregistrement… », et l'agent qui s'impatientait cliquait
// « Passer » — et perdait sa saisie.
const api = axios.create({ baseURL: '/api', timeout: 15000 })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Un message que l'agent peut lire, selon ce qui s'est vraiment passé. Tout
// finissait en « Enregistrement impossible », sans dire s'il fallait attendre
// le réseau ou prévenir quelqu'un.
function messageLisible(err) {
  if (err.code === 'ECONNABORTED') return 'Le réseau ne répond pas. Votre saisie est conservée : réessayez dans un instant.'
  if (err.code === 'ERR_NETWORK' || !err.response) return 'Pas de réseau. Votre saisie est conservée : réessayez dès que vous captez.'
  const s = err.response.status
  const texte = err.response.data?.error
  if (texte) return texte
  if (s === 401) return 'Session expirée. Reconnectez-vous.'
  if (s === 403) return 'Accès refusé.'
  if (s === 404) return 'Introuvable.'
  if (s >= 500) return 'Le serveur a rencontré une erreur. Réessayez ; si cela recommence, prévenez Loïck.'
  return 'Erreur inattendue.'
}

api.interceptors.response.use(
  r => r,
  err => {
    err.messageLisible = messageLisible(err)
    // Un 401 sur la connexion elle-même est un mauvais mot de passe : la page
    // ne doit pas se recharger, sinon l'erreur disparaît avant d'être lue et
    // l'agent recommence sans comprendre. Les autres 401 sont une session
    // expirée : on retourne au login.
    const url = String(err.config?.url || '')
    if (err.response?.status === 401 && !url.startsWith('/auth/')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
