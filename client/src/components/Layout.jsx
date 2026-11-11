import { useState, useEffect } from 'react'
import api from '../utils/api'
import { blocCourant, choisirBloc } from '../utils/blocCourant'
import { useAuth } from '../hooks/useAuth'
import Icon from './ui/Icon'
import BottomTabBar from './BottomTabBar'

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
  // Les fichiers ouverts à la personne. Avec un seul (le cas de toujours), rien ne
  // s'affiche et rien ne change. Avec plusieurs, un sélecteur dit sur lequel on
  // travaille : la file d'appels, les contacts, l'import et le suivi le suivent.
  const [blocs, setBlocs] = useState([])
  const [bloc, setBloc] = useState(blocCourant())
  useEffect(() => {
    api.get('/contacts/blocs').then(r => {
      setBlocs(r.data)
      // Un choix resté d'une autre session, sur un fichier qui n'est plus ouvert : on l'oublie.
      if (bloc && !r.data.some(b => b.id === bloc)) { choisirBloc(null); setBloc(null) }
    }).catch(() => { setBlocs([]); choisirBloc(null); setBloc(null) })   // pas de liste, pas de filtre caché
  }, [])
  const changerBloc = (v) => {
    // Changer de fichier recharge l'écran : en pleine session d'appels, la note en
    // cours de saisie serait perdue. On prévient.
    if (page === 'session' && !window.confirm("Changer de fichier recharge la session d'appels. Une note en cours de saisie serait perdue. Continuer ?")) return
    const id = v ? Number(v) : null; choisirBloc(id); setBloc(id)
  }

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(user?.role))

  return (
    <div className="flex h-screen bg-quai-light overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} hidden md:flex flex-shrink-0 bg-quai-navy flex-col transition-all duration-200`}>

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
        <div className="bg-white border-b border-quai-border px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-lg font-semibold text-quai-navy truncate min-w-0">
            {NAV_ITEMS.find(n => n.id === page)?.label || 'ImmoRelances'}
          </h1>
          <div className="flex items-center gap-3 flex-shrink-0">
            {blocs.length > 1 && (
              <select value={bloc || ''} onChange={e => changerBloc(e.target.value)} aria-label="Fichier de travail"
                className="input w-auto text-sm max-w-[9rem] md:max-w-none">
                <option value="">Tous mes fichiers</option>
                {blocs.map(b => <option key={b.id} value={b.id}>{b.libelle}</option>)}
              </select>
            )}
            <span className={`text-xs text-quai-muted hidden ${blocs.length > 1 ? 'lg:inline' : 'md:inline'}`}>Le Quai de l'Immobilier — Gestion des relances</span>
            <button onClick={logout} aria-label="Déconnexion"
              className="md:hidden text-quai-muted hover:text-quai-navy p-1.5">
              <Icon name="log-out" size="md" />
            </button>
          </div>
        </div>
        {/* Changer de fichier recharge l'écran courant sur le nouveau fichier. */}
        <div key={bloc || 'tous'} className="contents">{children}</div>

        {/* Barre d'onglets basse défilable : MOBILE uniquement */}
        <BottomTabBar items={visibleNav} active={page} onSelect={onNavigate} />
      </main>
    </div>
  )
}
