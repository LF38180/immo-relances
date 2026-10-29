import { useState, useEffect, lazy, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import api from './utils/api'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'

// Pages chargées à la demande (chunks séparés) — allège le bundle initial.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SessionHub = lazy(() => import('./pages/SessionHub'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const ScriptsPage = lazy(() => import('./pages/ScriptsPage'))
const SupervisionPage = lazy(() => import('./pages/SupervisionPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const CourtagePage = lazy(() => import('./pages/CourtagePage'))
const ChangePasswordGate = lazy(() => import('./pages/ChangePasswordGate'))
const OperationHub = lazy(() => import('./pages/operation/OperationHub'))
const ChoixEspace = lazy(() => import('./pages/operation/ChoixEspace'))

function ChargementPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-quai-light">
      <div className="animate-pulse text-quai-muted text-sm">Chargement…</div>
    </div>
  )
}

function AppInner() {
  const { user } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (!user) return <LoginPage />

  // Changement de mot de passe obligatoire : écran bloquant avant tout accès.
  if (user.must_change_password) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
          <ChangePasswordGate />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return <AppConnecte user={user} page={page} setPage={setPage} />
}

// Aiguillage vers l'espace de travail.
//
// Principe : qui ne participe pas à l'opération anciens clients ne voit aucun
// changement. Les écrans de Chrystelle et de Marine ne sont pas modifiés —
// l'écran de choix se place AVANT, il ne touche pas à ce qui existe.
function AppConnecte({ user, page, setPage }) {
  const [acces, setAcces] = useState(null)      // null = on ne sait pas encore
  const [espace, setEspace] = useState(null)    // null = pas encore choisi

  useEffect(() => {
    api.get('/operation/mon-acces')
      .then(r => setAcces(r.data))
      .catch(() => setAcces({ participe: false }))   // en cas d'erreur : comportement d'origine
  }, [])

  // Tant qu'on ne sait pas, on n'affiche rien plutôt qu'un écran qui sauterait.
  if (!acces) return <div className="min-h-screen flex"><ChargementPage /></div>

  const espaceHabituel = user.role === 'courtage' ? 'courtage' : 'agence'

  // Un conseiller recruté pour l'opération et qui n'a (pas encore) de fiche
  // à son nom atterrissait sur le tableau de bord des relances, vide, sans
  // menu ni explication. Il doit savoir que ce n'est pas lui.
  if (!acces.participe && user.role === 'conseiller') {
    return <SansFiche prenom={user.prenom} />
  }

  // Ne participe pas : strictement le comportement d'avant.
  if (!acces.participe) {
    return espaceHabituel === 'courtage' ? <EspaceCourtage /> : <EspaceAgence page={page} setPage={setPage} />
  }

  // Qui a un second espace ?
  //
  // Un conseiller recruté pour l'opération n'a qu'elle : lui montrer un choix
  // l'enverrait sur un écran vide. Tous les autres ont deux endroits où
  // travailler — Marine son courtage, Chrystelle ses relances, un manager son
  // pilotage, un admin l'application entière.
  const aUnAutreEspace = user.role !== 'conseiller'
  if (!aUnAutreEspace) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
          <OperationHub />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Le second espace, selon qui on est.
  const second = espaceHabituel === 'courtage'
    ? { id: 'courtage', titre: 'Mon espace courtage',
        aide: 'Vos fiches de courtage, comme d’habitude', icon: 'table' }
    : user.role === 'admin'
      ? { id: 'agence', titre: 'Immo Relances',
          aide: 'Tableau de bord, contacts, supervision, administration', icon: 'layout-dashboard' }
      : user.role === 'manager'
        ? { id: 'agence', titre: 'Immo Relances',
            aide: 'Tableau de bord et supervision de l’agence', icon: 'layout-dashboard' }
        : { id: 'agence', titre: 'Mes relances',
            aide: 'Vos sessions d’appels habituelles', icon: 'phone-call' }

  // Ce que l'opération propose dépend de ce qu'on y fait : un manager qui a
  // aussi des fiches voit les deux, pas seulement le pilotage.
  const aideOperation = acces.pilote && acces.fiches > 0
    ? `${acces.fiches} personne${acces.fiches > 1 ? 's' : ''} à rappeler, et le suivi de l’équipe`
    : acces.pilote
      ? 'Suivi, répartition des fiches et vérifications'
      : `${acces.fiches} personne${acces.fiches > 1 ? 's' : ''} à rappeler`

  // Deux espaces : on demande, une fois par session.
  if (!espace) {
    return (
      <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
        <ChoixEspace
          prenom={user.prenom}
          onChoisir={setEspace}
          espaces={[
            { id: 'operation', titre: 'Opération anciens clients',
              aide: aideOperation, image: '/operation/sceau-badge.png' },
            second,
          ]}
        />
      </Suspense>
    )
  }

  if (espace === 'operation') {
    return (
      <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
        <OperationHub onRetour={() => setEspace(null)} />
      </Suspense>
    )
  }
  return espace === 'courtage'
    ? <EspaceCourtage onRetour={() => setEspace(null)} />
    : <EspaceAgence page={page} setPage={setPage} onRetour={() => setEspace(null)} />
}

// L'espace courtage de Marine. La page elle-même n'est pas touchée : le bouton
// de retour vers l'opération est posé au-dessus, en surimpression.
function EspaceCourtage({ onRetour }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
      {onRetour && <RetourOperation onRetour={onRetour} />}
      <CourtagePage />
    </Suspense>
  )
}

// L'espace habituel de l'agence, inchangé lui aussi.
function EspaceAgence({ page, setPage, onRetour }) {

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={setPage} />
      case 'session': return <SessionHub />
      case 'contacts': return <ContactsPage />
      case 'scripts': return <ScriptsPage />
      case 'supervision': return <SupervisionPage />
      case 'admin': return <AdminPage />
      default: return <DashboardPage onNavigate={setPage} />
    }
  }

  return (
    <>
      {onRetour && <RetourOperation onRetour={onRetour} />}
      <Layout page={page} onNavigate={setPage}>
        <Suspense fallback={<ChargementPage />}>
          {renderPage()}
        </Suspense>
      </Layout>
    </>
  )
}

// Petit bouton flottant pour revenir à l'opération. Posé par-dessus l'écran
// existant plutôt qu'inséré dedans : aucune ligne des pages de Chrystelle et
// de Marine n'est modifiée.
function RetourOperation({ onRetour }) {
  return (
    <button onClick={onRetour}
      className="fixed bottom-20 md:bottom-4 right-3 z-[1200] bg-quai-navy text-white
                 rounded-full shadow-lg pl-3 pr-4 py-2.5 text-xs font-medium
                 inline-flex items-center gap-1.5 hover:bg-quai-navymd transition-colors">
      <img src="/operation/sceau-badge.png" alt="" className="w-5 h-5 rounded-sm" />
      Anciens clients
    </button>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{
        style: { borderRadius: '12px', background: '#0D0D2B', color: '#fff', fontSize: '14px' },
        success: { iconTheme: { primary: '#C9A96E', secondary: '#0D0D2B' }, style: { background: '#0D0D2B', color: '#fff' } },
        error: { style: { background: '#7f1d1d', color: '#fff' } },
        duration: 3500,
      }} />
      <AppInner />
    </AuthProvider>
  )
}

// Conseiller sans fiche attribuée : dire pourquoi l'écran est vide.
function SansFiche({ prenom }) {
  const { logout } = useAuth()
  return (
    <div className="min-h-screen bg-quai-light flex items-center justify-center p-4">
      <div className="bg-white border border-quai-border rounded-xl p-6 max-w-md w-full text-center">
        <img src="/operation/sceau-badge.png" alt="" className="w-16 h-16 rounded mx-auto mb-3" />
        <h1 className="text-xl font-display font-bold text-quai-navy">Bonjour {prenom}</h1>
        <p className="text-sm text-quai-muted mt-2 leading-snug">
          Aucune fiche ne t’est attribuée pour l’instant. Ce n’est pas une erreur de ta part :
          la répartition est en cours. Vois avec Loïck, puis reviens ici.
        </p>
        <div className="flex gap-2 justify-center mt-5">
          <button onClick={() => window.location.reload()} className="btn-primary min-h-[3rem] px-5">Réessayer</button>
          <button onClick={logout} className="btn-secondary min-h-[3rem] px-5">Se déconnecter</button>
        </div>
      </div>
    </div>
  )
}
