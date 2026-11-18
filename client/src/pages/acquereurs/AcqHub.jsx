import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'

const AcqFile = lazy(() => import('./AcqFile'))
const AcqAccueil = lazy(() => import('./AcqAccueil'))
const AcqDemo = lazy(() => import('./AcqDemo'))
const AcqListing = lazy(() => import('./AcqListing'))
const AcqSuivi = lazy(() => import('./AcqSuivi'))
const AcqAdmin = lazy(() => import('./AcqAdmin'))

// Espace « Fichier Acquéreurs » (cahier des charges du 18/11/2026).
// Cloisonné comme l'opération anciens clients : il ne mène nulle part ailleurs.
export default function AcqHub({ onRetour, libelleRetour = 'Mon espace', ongletInitial = 'accueil' }) {
  const { user, logout } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [onglet, setOnglet] = useState(ongletInitial)
  // Une case du Suivi cliquée : le Listing s'ouvre filtré (comme l'opération).
  const [filtre, setFiltre] = useState('')
  const voir = (f) => { setFiltre(f); setOnglet('listing') }

  const onglets = [
    { id: 'accueil', label: 'Accueil', icon: 'file-text' },
    { id: 'file', label: 'Mes appels', icon: 'phone' },
    { id: 'suivi', label: 'Suivi', icon: 'layout-dashboard' },
    ...(estAdmin ? [{ id: 'listing', label: 'Listing', icon: 'table' }, { id: 'admin', label: 'Administration', icon: 'settings' }, { id: 'demo', label: 'Démonstration', icon: 'play' }] : []),
  ]
  return (
    <div className="h-ecran flex flex-col bg-quai-light">
      <header className="bg-quai-navy text-white px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <img src="/marque/mission-acquereurs-long-clair.png" alt="Mission Acquéreurs" className="h-8 w-auto shrink-0" />
        <h1 className="sr-only">Mission Acquéreurs</h1>
        <div className="flex-1" />
        {/* Qui est connecté, discrètement, à droite — comme dans le menu des
            autres espaces. Le nombre de personnes est sur l'accueil. */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/70 min-w-0">
          <span className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-[10px] font-semibold text-quai-taupe shrink-0">
            {`${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase()}
          </span>
          <span className="truncate">{user?.prenom} {user?.nom}</span>
        </div>
        {onRetour && (
          <button onClick={onRetour} className="text-white/80 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-2">
            <Icon name="arrow-left" size="sm" /> {libelleRetour}
          </button>
        )}
        <button onClick={logout} className="text-white/60 hover:text-white p-2 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center" aria-label="Déconnexion">
          <Icon name="log-out" size="sm" />
        </button>
      </header>
      <nav className="bg-white border-b border-quai-border flex gap-0.5 px-2 pt-1 shrink-0 overflow-x-auto no-scrollbar">
        {onglets.map(o => (
          <button key={o.id} onClick={() => { setFiltre(''); setOnglet(o.id) }}
            className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 border-b-2 transition-colors ${
              onglet === o.id ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted'}`}>
            <Icon name={o.icon} size="sm" /> {o.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
            {onglet === 'accueil' && <AcqAccueil estAdmin={estAdmin} onCommencer={() => setOnglet('file')} onAdmin={() => setOnglet('admin')} />}
            {onglet === 'file' && <AcqFile />}
            {onglet === 'suivi' && <AcqSuivi onVoir={estAdmin ? voir : null} />}
            {onglet === 'listing' && estAdmin && <AcqListing filtreInitial={filtre} />}
            {onglet === 'admin' && estAdmin && <AcqAdmin />}
            {onglet === 'demo' && estAdmin && <AcqDemo />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
