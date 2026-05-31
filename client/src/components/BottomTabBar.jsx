import { useRef, useEffect, useState, useCallback } from 'react'
import Icon from './ui/Icon'

/**
 * Barre d'onglets basse (mobile uniquement). Onglets à largeur fixe, défilables
 * horizontalement, avec dégradés de fondu sur les bords pour signaler qu'il y a
 * d'autres onglets. L'onglet actif est recentré automatiquement au changement de page.
 *
 * items : [{ id, label, icon }]  · active : id courant · onSelect(id)
 */
export default function BottomTabBar({ items, active, onSelect }) {
  const scrollerRef = useRef(null)
  const activeRef = useRef(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  // Met à jour la visibilité des fondus selon la position de défilement.
  const updateFades = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setFadeLeft(el.scrollLeft > 1)
    setFadeRight(el.scrollLeft < maxScroll - 1)
  }, [])

  // Recentre l'onglet actif quand il change.
  useEffect(() => {
    const btn = activeRef.current
    if (btn) btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    // recalcul des fondus après l'animation de centrage
    const t = setTimeout(updateFades, 350)
    return () => clearTimeout(t)
  }, [active, updateFades])

  // Recalcule les fondus au montage et au redimensionnement.
  useEffect(() => {
    updateFades()
    window.addEventListener('resize', updateFades)
    return () => window.removeEventListener('resize', updateFades)
  }, [updateFades])

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1300] bg-quai-navy border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="relative">
        {/* Fondu gauche */}
        <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-quai-navy to-transparent transition-opacity z-10 ${fadeLeft ? 'opacity-100' : 'opacity-0'}`} />
        {/* Fondu droit */}
        <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-quai-navy to-transparent transition-opacity z-10 ${fadeRight ? 'opacity-100' : 'opacity-0'}`} />

        <div ref={scrollerRef} onScroll={updateFades}
          className="flex items-stretch overflow-x-auto no-scrollbar scroll-smooth">
          {items.map(item => {
            const isActive = active === item.id
            return (
              <button key={item.id} ref={isActive ? activeRef : null}
                onClick={() => onSelect(item.id)} aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-shrink-0 w-[5.25rem] flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] transition ${isActive ? 'text-quai-gold font-semibold' : 'text-white/70'}`}>
                <Icon name={item.icon} size="md" />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
