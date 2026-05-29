import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Icon from './ui/Icon'

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Tableau de bord', icon: 'layout-dashboard', roles: ['agent', 'manager', 'admin'] },
  { id: 'session',    label: 'Session relance', icon: 'phone',            roles: ['agent', 'manager', 'admin'] },
  { id: 'contacts',   label: 'Contacts',        icon: 'users',            roles: ['agent', 'manager', 'admin'] },
  { id: 'scripts',    label: "Scripts d'appel", icon: 'file-text',        roles: ['agent', 'manager', 'admin'] },
  { id: 'supervision',label: 'Supervision',     icon: 'eye',              roles: ['manager', 'admin'] },
  { id: 'admin',      label: 'Administration',  icon: 'settings',         roles: ['admin'] },
]

export default function Layout({ page, onNavigate, children }) {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(user?.role))

  return (
    <div className="flex h-screen bg-quai-light overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-quai-navy flex flex-col transition-all duration-200`}>

        {/* Logo */}
        <div className={`flex items-center justify-between border-b border-white/10 ${collapsed ? 'p-3' : 'p-4'}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <img
                src="https://img.netty.fr/logo/company55382byt/2/logo_web.png"
                alt="Le Quai de l'Immobilier"
                className="h-10 w-auto object-contain"
              />
            </div>
          ) : (
            <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center text-white font-bold text-xs">LQ</div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="text-white/40 hover:text-white p-1 rounded transition-colors ml-auto focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size="sm" />
          </button>
        </div>

        {/* Utilisateur */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Connecté en tant que</div>
            <div className="text-white font-semibold text-sm">{user?.prenom} {user?.nom}</div>
            <div className="text-quai-gold text-xs capitalize">{user?.role}</div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {visibleNav.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : ''}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                page === item.id
                  ? 'bg-quai-gold text-quai-navy shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon name={item.icon} size="md" className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Déconnexion */}
        <div className="p-2 border-t border-white/10">
          <button
            onClick={logout}
            aria-label="Déconnexion"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name="log-out" size="md" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Topbar */}
        <div className="bg-white border-b border-quai-border px-6 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-lg font-semibold text-quai-navy">
            {NAV_ITEMS.find(n => n.id === page)?.label || 'ImmoRelances'}
          </h1>
          <div className="text-xs text-quai-muted">
            Le Quai de l'Immobilier — Gestion des relances
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
