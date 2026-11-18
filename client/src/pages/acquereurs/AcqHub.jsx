import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'
import EnTeteMission from '../../components/EnTeteMission'

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
      <EnTeteMission mission="acquereurs" user={user} onRetour={onRetour} libelleRetour={libelleRetour} logout={logout} />
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
