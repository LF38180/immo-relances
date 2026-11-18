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
export default function AcqHub({ onRetour, libelleRetour = 'Mon espace' }) {
  const { user, logout } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [onglet, setOnglet] = useState('accueil')
  // Une case du Suivi cliquée : le Listing s'ouvre filtré (comme l'opération).
  const [filtre, setFiltre] = useState('')
  const voir = (f) => { setFiltre(f); setOnglet('listing') }
  const [acces, setAcces] = useState(null)
  useEffect(() => { api.get('/acquereurs/mon-acces').then(r => setAcces(r.data)).catch(() => {}) }, [])

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
        <div className="w-8 h-8 rounded bg-quai-gold/20 grid place-items-center shrink-0"><Icon name="users" size="sm" className="text-quai-gold" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm leading-tight truncate">Fichier Acquéreurs</div>
          <div className="text-[11px] text-white/60 truncate">{user?.prenom} {user?.nom}{acces?.contacts != null ? ` · ${acces.contacts} personnes` : ''}</div>
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
      <nav className="bg-white border-b border-quai-border flex gap-0.5 px-2 pt-1 shrink-0 overflow-x-auto scrollbar-none">
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
