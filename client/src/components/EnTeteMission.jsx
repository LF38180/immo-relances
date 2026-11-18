import Icon from './ui/Icon'

// La personne connectée, discrètement : ses initiales et son nom. La même
// pastille dans tous les espaces (missions, menu de l'agence), pour que
// chacun retrouve son nom au même endroit.
export function Personne({ user, sombre = false, className = '' }) {
  if (!user) return null
  return (
    <span className={`items-center gap-2 text-xs min-w-0 ${sombre ? 'text-quai-muted' : 'text-white/70'} ${className || 'inline-flex'}`}>
      <span className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold shrink-0 ${sombre ? 'bg-quai-light border border-quai-border text-quai-navy' : 'bg-white/10 text-quai-taupe'}`}>
        {`${user.prenom?.[0] || ''}${user.nom?.[0] || ''}`.toUpperCase()}
      </span>
      <span className="truncate">{user.prenom} {user.nom}</span>
    </span>
  )
}

// L'en-tête d'un espace de mission : le logo de la mission à gauche, la
// personne à droite, puis le retour et la déconnexion. Le même pour toutes
// les missions, et pour chaque personne qui en recevra une.
// `children` et `actions` sont facultatifs : sans eux, l'en-tête est inchangé.
const NOMS = { estimes: 'Mission Estimés', acquereurs: 'Mission Acquéreurs', courtage: 'Mission Courtage' }
export default function EnTeteMission({ mission, user, onRetour, libelleRetour = 'Mon espace', logout, collant = false, largeur = '', children = null, actions = null }) {
  return (
    <header className={`bg-quai-navy text-white shrink-0 ${collant ? 'sticky top-0 z-30' : ''}`} style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      <div className={`px-3 pb-2 flex items-center gap-2 ${largeur}`}>
        <img src={`/marque/mission-${mission}-long-clair.png`} alt={NOMS[mission]} className="h-8 w-auto shrink-0" />
        <h1 className="sr-only">{NOMS[mission]}</h1>
        {/* `children` : une mention à côté du logo (la pastille « Démonstration »). */}
        {children}
        <div className="flex-1" />
        <Personne user={user} className="hidden sm:inline-flex" />
        {onRetour && (
          <button onClick={onRetour} className="text-white/80 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-2">
            <Icon name="arrow-left" size="sm" /> {libelleRetour}
          </button>
        )}
        {logout && (
          <button onClick={logout} className="text-white/60 hover:text-white p-2 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center" aria-label="Déconnexion" title="Déconnexion">
            <Icon name="log-out" size="sm" />
          </button>
        )}
        {/* `actions` : un bouton propre à l'écran, tout à droite (« Quitter »). */}
        {actions}
      </div>
    </header>
  )
}
