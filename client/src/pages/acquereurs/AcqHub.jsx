import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'

const AcqFile = lazy(() => import('./AcqFile'))
const AcqSuivi = lazy(() => import('./AcqSuivi'))
const AcqAdmin = lazy(() => import('./AcqAdmin'))

// Espace « Fichier Acquéreurs » (cahier des charges du 18/11/2026).
// Cloisonné comme l'opération anciens clients : il ne mène nulle part ailleurs.
export default function AcqHub({ onRetour }) {
  const { user, logout } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [onglet, setOnglet] = useState('file')
  const [acces, setAcces] = useState(null)
  useEffect(() => { api.get('/acquereurs/mon-acces').then(r => setAcces(r.data)).catch(() => {}) }, [])

  const onglets = [
    { id: 'file', label: 'Mes appels', icon: 'phone' },
    { id: 'suivi', label: 'Suivi', icon: 'layout-dashboard' },
    ...(estAdmin ? [{ id: 'admin', label: 'Administration', icon: 'settings' }] : []),
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
            <Icon name="arrow-left" size="sm" /> Mon espace
          </button>
        )}
        <button onClick={logout} className="text-white/60 hover:text-white p-2 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center" aria-label="Déconnexion">
          <Icon name="log-out" size="sm" />
        </button>
      </header>
      <nav className="bg-white border-b border-quai-border flex gap-0.5 px-2 pt-1 shrink-0 overflow-x-auto scrollbar-none">
        {onglets.map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 border-b-2 transition-colors ${
              onglet === o.id ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted'}`}>
            <Icon name={o.icon} size="sm" /> {o.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
            {onglet === 'file' && <AcqFile />}
            {onglet === 'suivi' && <AcqSuivi />}
            {onglet === 'admin' && estAdmin && <AcqAdmin />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
