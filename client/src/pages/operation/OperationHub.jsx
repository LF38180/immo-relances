import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'

const SessionOperation = lazy(() => import('./SessionOperation'))
const AccueilOperation = lazy(() => import('./AccueilOperation'))
const AideOperation = lazy(() => import('../../components/AideOperation'))
const ListingPage = lazy(() => import('./ListingPage'))
const DispatchPage = lazy(() => import('./DispatchPage'))
const PilotagePage = lazy(() => import('./PilotagePage'))
const DemoPage = lazy(() => import('./DemoPage'))

// L'espace de l'opération anciens clients. Cloisonné : il ne donne accès à
// rien d'autre, et rien d'autre n'y accède.
//
// `onRetour` n'est fourni qu'aux personnes qui ont aussi un autre espace
// (Marine son courtage, Chrystelle ses relances). Les treize autres
// conseillers n'ont que ça : leur montrer un bouton « retour » les enverrait
// sur un écran vide.
export default function OperationHub({ onRetour }) {
  const { user, logout } = useAuth()
  const estPilote = ['manager', 'admin'].includes(user?.role)
  // La démonstration ne concerne que celui qui la fait : un onglet de plus
  // sur l'écran de tout le monde serait un onglet de trop.
  const estAnimateur = (user?.email || '').toLowerCase() === 'performance@lequai-immobilier.com'
  // La page d'accueil s'affiche d'abord : elle se lit une fois, le premier
  // matin, et donne le pourquoi avant le comment.
  const [onglet, setOnglet] = useState('accueil')
  // Une fiche ouverte depuis le listing ou le suivi : on bascule sur l'écran
  // d'appel sans faire chercher le client dans sa liste. Consommée une fois,
  // puis oubliée — sinon revenir sur l'onglet la rouvrirait.
  const [ficheAOuvrir, setFicheAOuvrir] = useState(null)
  const [acces, setAcces] = useState(null)
  const [aide, setAide] = useState(null)   // rubrique ouverte, ou null

  useEffect(() => {
    api.get('/operation/mon-acces').then(r => setAcces(r.data)).catch(() => {})
  }, [onglet === 'accueil'])

  // Ouvrir une fiche en appel depuis un écran de pilotage : la fiche est mise
  // de côté, puis l'onglet bascule. L'agent arrive directement sur l'appel.
  const ouvrirAppel = (fiche) => {
    setFicheAOuvrir(fiche)
    setOnglet('file')
  }

  const onglets = [
    { id: 'accueil', label: 'Repères', icon: 'file-text' },
    { id: 'file', label: 'Mes appels', icon: 'phone' },
    ...(estPilote ? [
      { id: 'pilotage', label: 'Suivi', icon: 'layout-dashboard' },
      { id: 'dispatch', label: 'Répartir', icon: 'users' },
      { id: 'listing', label: 'Listing', icon: 'table' },
    ] : []),
    ...(estAnimateur ? [
      { id: 'demo', label: 'Démonstration', icon: 'play' },
    ] : []),
  ]

  return (
    <div className="h-ecran flex flex-col bg-quai-light">
      {/* `h-ecran` : 100dvh, la hauteur réellement visible. `h-screen` (100vh)
          ignore la barre d'outils de Safari et de Chrome mobile quand le
          document ne défile pas — ce qui est le cas ici, le défilement est
          interne — et le bas de l'écran, où vit « Enregistrer et suivant »,
          passait sous la barre. Le padding-top protège de la barre de statut
          en PWA plein écran. */}
      <header className="bg-quai-navy text-white px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <img src="/operation/sceau-badge.png" alt="" className="w-8 h-8 rounded shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm leading-tight">Anciens clients</div>
          <div className="text-[11px] text-white/60 truncate">{user?.prenom} {user?.nom}</div>
        </div>
        {/* L'aide suit l'écran : pendant un appel ce sont les objections,
            ailleurs la façon de lire sa liste. */}
        <button onClick={() => setAide(onglet === 'file' ? 'appel' : 'liste')}
          className="text-white/80 hover:text-white p-2 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center" aria-label="Aide">
          <Icon name="aide" size="sm" />
        </button>
        {onRetour && (
          <button onClick={onRetour}
            className="text-white/80 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-2">
            <Icon name="arrow-left" size="sm" /> Mon espace
          </button>
        )}
        <button onClick={logout} className="text-white/60 hover:text-white p-2 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center" aria-label="Déconnexion">
          <Icon name="log-out" size="sm" />
        </button>
      </header>

      {onglets.length > 1 && (
        <nav className="bg-white border-b border-quai-border flex gap-0.5 px-2 pt-1 shrink-0
                        overflow-x-auto scrollbar-none">
          {onglets.map(o => (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap inline-flex items-center
                          gap-1.5 border-b-2 transition-colors ${
                onglet === o.id ? 'border-quai-gold text-quai-navy'
                                : 'border-transparent text-quai-muted'}`}>
              <Icon name={o.icon} size="sm" /> {o.label}
            </button>
          ))}
        </nav>
      )}

      <BandeauMiseAJour />

      <ErrorBoundary>
      <Suspense fallback={<div className="p-6 text-quai-muted">Chargement…</div>}>
        {onglet === 'accueil' && (
          <AccueilOperation acces={acces} bilan={acces?.bilan} estPilote={estPilote}
            onCommencer={() => setOnglet('file')} />
        )}
        {onglet === 'file' && (
          <SessionOperation ficheAOuvrir={ficheAOuvrir}
            onFicheOuverte={() => setFicheAOuvrir(null)} />
        )}
        {onglet === 'pilotage' && <PilotagePage onAppeler={ouvrirAppel} />}
        {onglet === 'dispatch' && <DispatchPage />}
        {onglet === 'listing' && <ListingPage onAppeler={ouvrirAppel} />}
        {onglet === 'demo' && <DemoPage />}
      </Suspense>
      </ErrorBoundary>

      {aide && (
        <Suspense fallback={null}>
          <AideOperation rubrique={aide} onFermer={() => setAide(null)} />
        </Suspense>
      )}
    </div>
  )
}

// Une nouvelle version est en ligne : le dire, sans recharger de force.
//
// Recharger d'autorité en plein appel ferait perdre la saisie. L'agent
// choisit son moment — entre deux fiches. Le signal vient de index.html,
// qui écoute le service worker.
function BandeauMiseAJour() {
  const [dispo, setDispo] = useState(false)
  useEffect(() => {
    const h = () => setDispo(true)
    window.addEventListener('nouvelle-version', h)
    if (window.__nouvelleVersion) setDispo(true)
    return () => window.removeEventListener('nouvelle-version', h)
  }, [])
  if (!dispo) return null
  return (
    <div className="bg-quai-gold text-quai-navy text-xs px-3 py-2 flex items-center gap-2 shrink-0">
      <Icon name="refresh-cw" size="sm" className="shrink-0" />
      <span className="flex-1 leading-snug">Une nouvelle version est disponible. Rechargez entre deux appels.</span>
      <button onClick={() => window.location.reload()}
        className="bg-quai-navy text-white rounded-lg px-3 py-1.5 font-medium whitespace-nowrap min-h-[2.25rem]">
        Recharger
      </button>
    </div>
  )
}
