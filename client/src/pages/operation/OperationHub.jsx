import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'

const SessionOperation = lazy(() => import('./SessionOperation'))
const AccueilOperation = lazy(() => import('./AccueilOperation'))
const AideOperation = lazy(() => import('../../components/AideOperation'))
const ListingPage = lazy(() => import('./ListingPage'))
const DispatchPage = lazy(() => import('./DispatchPage'))
const PilotagePage = lazy(() => import('./PilotagePage'))

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
  // La page d'accueil s'affiche d'abord : elle se lit une fois, le premier
  // matin, et donne le pourquoi avant le comment.
  const [onglet, setOnglet] = useState('accueil')
  const [acces, setAcces] = useState(null)
  const [aide, setAide] = useState(null)   // rubrique ouverte, ou null

  useEffect(() => {
    api.get('/operation/mon-acces').then(r => setAcces(r.data)).catch(() => {})
  }, [onglet === 'accueil'])

  const onglets = [
    { id: 'accueil', label: 'Repères', icon: 'file-text' },
    { id: 'file', label: 'Mes appels', icon: 'phone' },
    ...(estPilote ? [
      { id: 'pilotage', label: 'Suivi', icon: 'layout-dashboard' },
      { id: 'dispatch', label: 'Répartir', icon: 'users' },
      { id: 'listing', label: 'Listing', icon: 'table' },
    ] : []),
  ]

  return (
    <div className="h-screen flex flex-col bg-quai-light">
      <header className="bg-quai-navy text-white px-3 py-2 flex items-center gap-2 shrink-0">
        <img src="/operation/sceau-badge.png" alt="" className="w-8 h-8 rounded shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm leading-tight">Anciens clients</div>
          <div className="text-[11px] text-white/60 truncate">{user?.prenom} {user?.nom}</div>
        </div>
        {/* L'aide suit l'écran : pendant un appel ce sont les objections,
            ailleurs la façon de lire sa liste. */}
        <button onClick={() => setAide(onglet === 'file' ? 'appel' : 'liste')}
          className="text-white/80 hover:text-white p-2" aria-label="Aide">
          <Icon name="aide" size="sm" />
        </button>
        {onRetour && (
          <button onClick={onRetour}
            className="text-white/80 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-2">
            <Icon name="arrow-left" size="sm" /> Mon espace
          </button>
        )}
        <button onClick={logout} className="text-white/60 hover:text-white p-2" aria-label="Déconnexion">
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

      <Suspense fallback={<div className="p-6 text-quai-muted">Chargement…</div>}>
        {onglet === 'accueil' && (
          <AccueilOperation acces={acces} bilan={acces?.bilan} estPilote={estPilote}
            onCommencer={() => setOnglet('file')} />
        )}
        {onglet === 'file' && <SessionOperation />}
        {onglet === 'pilotage' && <PilotagePage />}
        {onglet === 'dispatch' && <DispatchPage />}
        {onglet === 'listing' && <ListingPage />}
      </Suspense>

      {aide && (
        <Suspense fallback={null}>
          <AideOperation rubrique={aide} onFermer={() => setAide(null)} />
        </Suspense>
      )}
    </div>
  )
}
