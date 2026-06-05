import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import SessionPage from './pages/SessionPage'
import ContactsPage from './pages/ContactsPage'
import ScriptsPage from './pages/ScriptsPage'
import SupervisionPage from './pages/SupervisionPage'
import AdminPage from './pages/AdminPage'

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
      {renderPage()}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{
        style: { borderRadius: '12px', background: '#080432', color: '#fff', fontSize: '14px' },
        success: { iconTheme: { primary: '#B6A997', secondary: '#080432' }, style: { background: '#080432', color: '#fff' } },
        error: { style: { background: '#7f1d1d', color: '#fff' } },
        duration: 3500,
      }} />
      <AppInner />
    </AuthProvider>
  )
}
