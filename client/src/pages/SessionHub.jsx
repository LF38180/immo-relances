import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { useAuth } from '../hooks/useAuth'

const SessionPage = lazy(() => import('./SessionPage'))

// Enveloppe de "Session relance". Par defaut : la session de l'utilisateur, strictement
// inchangee (SessionPage est rendue telle quelle). Pour un manager/admin, un selecteur
// permet en plus d'observer l'ecran d'un autre utilisateur — en LECTURE SEULE, chacun
// avec son architecture propre : file d'appel classique pour les agents, boites
// mensuelles pour le courtage. Aucune action n'est possible depuis ces vues.
export default function SessionHub() {
  const { user } = useAuth()
  const peutObserver = user?.role === 'manager' || user?.role === 'admin'

  const [vue, setVue] = useState('moi')      // 'moi' | 'agent:<id>' | 'courtage'
  const [utilisateurs, setUtilisateurs] = useState([])

  useEffect(() => {
    if (!peutObserver) return
    api.get('/admin/users')
      .then(r => setUtilisateurs(r.data.filter(u => u.actif && u.id !== user.id)))
      .catch(() => {})
  }, [peutObserver, user?.id])

  // Utilisateur simple : comportement d'origine, aucun ajout a l'ecran.
  if (!peutObserver) {
    return <Suspense fallback={<Chargement />}><SessionPage /></Suspense>
  }

  const agents = utilisateurs.filter(u => u.role === 'agent')
  const courtiers = utilisateurs.filter(u => u.role === 'courtage')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-quai-muted inline-flex items-center gap-1.5">
          <Icon name="eye" size="sm" /> Vue
        </span>
        <select className="input w-auto" value={vue} onChange={e => setVue(e.target.value)}
          aria-label="Choisir la vue à afficher">
          <option value="moi">Ma session</option>
          {agents.length > 0 && (
            <optgroup label="Agents — file d'appel">
              {agents.map(a => <option key={a.id} value={`agent:${a.id}`}>{a.prenom} {a.nom}</option>)}
            </optgroup>
          )}
          {courtiers.length > 0 && (
            <optgroup label="Courtage — boîtes mensuelles">
              {courtiers.map(c => <option key={c.id} value="courtage">{c.prenom} {c.nom}</option>)}
            </optgroup>
          )}
        </select>
        {vue !== 'moi' && (
          <span className="text-xs bg-quai-light border border-quai-border rounded-full px-3 py-1 text-quai-muted">
            Lecture seule
          </span>
        )}
      </div>

      {vue === 'moi' && <Suspense fallback={<Chargement />}><SessionPage /></Suspense>}
      {vue.startsWith('agent:') && <VueAgent id={vue.slice(6)} />}
      {vue === 'courtage' && <VueCourtage />}
    </div>
  )
}

function Chargement() {
  return <div className="text-sm text-quai-muted py-8">Chargement…</div>
}

const LIB_STATUT_CONTACT = {
  a_contacter: 'À contacter', tente_sans_reponse: 'Sans réponse',
  rappel_planifie: 'Rappel planifié', a_recontacter: 'À recontacter',
  contacte: 'Contacté', rdv_obtenu: 'RDV obtenu',
}

// Vue d'un agent classique : sa file d'appel du moment, ses rappels, son activite du jour.
function VueAgent({ id }) {
  const [data, setData] = useState(null)
  const [onglet, setOnglet] = useState('file')

  useEffect(() => {
    setData(null)
    api.get(`/admin/vue-agent/${id}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Impossible de charger cette vue'))
  }, [id])

  if (!data) return <Chargement />

  const { agent, file, rappels, dujour } = data
  const ONGLETS = [
    ['file', `File d'appel (${file.length})`],
    ['rappels', `Ses rappels (${rappels.length})`],
    ['jour', `Aujourd'hui (${dujour.length})`],
  ]

  return (
    <div>
      <h2 className="font-semibold text-quai-navy mb-3">
        Session de {agent.prenom} {agent.nom}
      </h2>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-quai-border">
        {ONGLETS.map(([k, lbl]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${onglet === k ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {onglet === 'file' && (
        <Liste vide="Sa file d'appel est vide.">
          {file.map((c, i) => (
            <Ligne key={c.id}
              titre={`${i + 1}. ${(c.nom || '').toUpperCase()} ${c.prenom || ''}`}
              sous={[c.telephone, c.ville].filter(Boolean).join(' · ')}
              badge={LIB_STATUT_CONTACT[c.statut] || c.statut}
              extra={c.prochain_contact ? `prévu le ${formatJour(c.prochain_contact)}` : null} />
          ))}
        </Liste>
      )}

      {onglet === 'rappels' && (
        <Liste vide="Aucun rappel planifié.">
          {rappels.map(c => (
            <Ligne key={c.id}
              titre={`${(c.nom || '').toUpperCase()} ${c.prenom || ''}`}
              sous={c.telephone}
              badge={LIB_STATUT_CONTACT[c.statut] || c.statut}
              extra={c.prochain_contact ? `le ${formatJour(c.prochain_contact)}` : null} />
          ))}
        </Liste>
      )}

      {onglet === 'jour' && (
        <Liste vide="Aucun appel enregistré aujourd'hui.">
          {dujour.map(r => (
            <Ligne key={r.id}
              titre={`${(r.nom || '').toUpperCase()} ${r.prenom || ''}`}
              sous={r.telephone}
              badge={LIB_STATUT_CONTACT[r.statut] || r.statut}
              extra={formatHeure(r.created_at)}
              notes={r.notes} />
          ))}
        </Liste>
      )}
    </div>
  )
}

const LIB_STATUT_COURTAGE = {
  en_relance: 'En relance', injoignable: 'Injoignable', simulation_faite: 'Simulation faite',
  dossier_en_cours: 'Dossier en cours', gagne: 'Gagné', perdu: 'Perdu',
  faux_numero: 'Faux numéro', ne_plus_contacter: 'Ne plus contacter',
}

// Vue courtage : l'architecture propre a Marine — ses boites mensuelles, puis le
// contenu de la boite ouverte. Reprend les memes routes que son ecran a elle.
function VueCourtage() {
  const [boites, setBoites] = useState(null)
  const [boite, setBoite] = useState(null)
  const [fiches, setFiches] = useState([])
  const [chargement, setChargement] = useState(false)

  useEffect(() => {
    api.get('/courtage/fiches/boites')
      .then(r => setBoites(r.data))
      .catch(() => toast.error('Impossible de charger les boîtes'))
  }, [])

  useEffect(() => {
    if (!boite) return
    setChargement(true)
    api.get(`/courtage/fiches/relances-jour?boite=${boite}`)
      .then(r => setFiches(r.data))
      .catch(() => toast.error('Impossible de charger cette boîte'))
      .finally(() => setChargement(false))
  }, [boite])

  if (!boites) return <Chargement />

  if (!boite) {
    return (
      <div>
        <h2 className="font-semibold text-quai-navy mb-3">Courtage — boîtes de relance</h2>
        <button onClick={() => setBoite('relances')}
          className="text-left card w-full mb-3 border-quai-gold hover:shadow-md transition-all">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-quai-navy">Relances prévues</div>
              <div className="text-xs text-quai-muted">Contacts déjà appelés ou planifiés</div>
            </div>
            <div className="text-2xl font-bold text-quai-navy">{boites.relancesPrevues}</div>
          </div>
        </button>

        <div className="text-xs font-medium text-quai-muted uppercase tracking-wide mb-2">
          Cahier des messages — leads jamais appelés
        </div>
        {boites.mois.length === 0 && <div className="text-sm text-quai-muted">Aucun lead en attente.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boites.mois.map(m => (
            <button key={m.cle} onClick={() => setBoite(m.cle)}
              className="text-left card hover:border-quai-gold hover:shadow-md transition-all">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-quai-navy capitalize">{m.libelle}</div>
                <div className="text-2xl font-bold text-quai-navy">{m.total}</div>
              </div>
              <div className="text-xs text-quai-muted mt-0.5">contact{m.total > 1 ? 's' : ''} à appeler</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const libelle = boite === 'relances'
    ? 'Relances prévues'
    : (boites.mois.find(m => m.cle === boite)?.libelle || boite)

  return (
    <div>
      <button onClick={() => setBoite(null)}
        className="text-sm text-quai-muted hover:text-quai-navy inline-flex items-center gap-1.5 mb-3">
        <Icon name="arrow-left" size="sm" /> Retour aux boîtes
      </button>
      <h2 className="font-semibold text-quai-navy mb-3 capitalize">{libelle}</h2>
      {chargement ? <Chargement /> : (
        <Liste vide="Aucune fiche dans cette boîte.">
          {fiches.map(f => (
            <Ligne key={f.id}
              titre={`${(f.nom || '').toUpperCase()} ${f.prenom || ''}`}
              sous={f.telephone_norm}
              badge={LIB_STATUT_COURTAGE[f.statut] || f.statut}
              extra={f.date_contact ? `cahier du ${formatJour(f.date_contact)}` : null}
              notes={f.dernier_commentaire} />
          ))}
        </Liste>
      )}
    </div>
  )
}

// --- Presentation commune ---------------------------------------------------

function Liste({ children, vide }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  if (!items || items.length === 0) return <p className="text-sm text-quai-muted">{vide}</p>
  return <div className="space-y-2">{items}</div>
}

function Ligne({ titre, sous, badge, extra, notes }) {
  return (
    <div className="bg-white border border-quai-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-quai-navy truncate">{titre}</div>
          {(sous || extra) && (
            <div className="text-xs text-quai-muted mt-0.5">
              {[sous, extra].filter(Boolean).join(' · ')}
            </div>
          )}
          {notes && <div className="text-sm text-quai-navy mt-1.5 whitespace-pre-wrap">{notes}</div>}
        </div>
        {badge && (
          <span className="shrink-0 text-xs bg-quai-light border border-quai-border rounded-full px-2 py-0.5 text-quai-muted">
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

function formatJour(iso) {
  if (!iso) return ''
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR')
}

// created_at SQLite ("AAAA-MM-JJ HH:MM:SS", UTC) -> heure de Paris.
function formatHeure(iso) {
  if (!iso) return ''
  return new Date(iso.replace(' ', 'T') + 'Z')
    .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
}
