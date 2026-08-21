import { useState, lazy, Suspense } from 'react'
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
      <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
        <ChangePasswordGate />
      </Suspense>
    )
  }

  // Rôle courtage : espace dédié cloisonné, sans le Layout/nav de l'agence.
  if (user.role === 'courtage') {
    return (
      <Suspense fallback={<div className="min-h-screen flex"><ChargementPage /></div>}>
        <CourtagePage />
      </Suspense>
    )
  }

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
    <Layout page={page} onNavigate={setPage}>
      <Suspense fallback={<ChargementPage />}>
        {renderPage()}
      </Suspense>
    </Layout>
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
