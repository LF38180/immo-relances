import { useState, lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'

// Pages chargées à la demande (chunks séparés) — allège le bundle initial.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SessionPage = lazy(() => import('./pages/SessionPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const ScriptsPage = lazy(() => import('./pages/ScriptsPage'))
const SupervisionPage = lazy(() => import('./pages/SupervisionPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

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

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={setPage} />
      case 'session': return <SessionPage />
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
