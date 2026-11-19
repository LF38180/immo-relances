import { useState, useEffect } from 'react'
import Icon from './ui/Icon'

// Une nouvelle version est en ligne : le dire sur tous les écrans, sans
// recharger de force (un rechargement en pleine saisie la ferait perdre).
// Le signal vient de index.html, qui écoute le service worker.
//
// Le bandeau FLOTTE par-dessus l'écran au lieu de s'y insérer : aucune ligne
// des écrans de Chrystelle et de Marine ne bouge, rien n'est décalé. Dans
// l'opération Anciens clients, qui a déjà son propre bandeau, celui-ci se
// masque (règle .bandeau-maj-flottant dans index.css).
export default function BandeauMiseAJour() {
  const [dispo, setDispo] = useState(false)
  const [masque, setMasque] = useState(false)
  useEffect(() => {
    const h = () => { setDispo(true); setMasque(false) }
    window.addEventListener('nouvelle-version', h)
    if (window.__nouvelleVersion) setDispo(true)
    return () => window.removeEventListener('nouvelle-version', h)
  }, [])
  if (!dispo || masque) return null
  return (
    <div role="status"
      className="bandeau-maj-flottant fixed left-1/2 -translate-x-1/2 z-[1250] top-[calc(0.5rem+env(safe-area-inset-top))]
                 w-[calc(100%-1rem)] max-w-md bg-quai-gold text-quai-navy text-xs rounded-xl shadow-lg
                 pl-3 pr-1 py-1.5 flex items-center gap-2">
      <Icon name="refresh-cw" size="sm" className="shrink-0" />
      <span className="flex-1 leading-snug">Une nouvelle version est disponible. Rechargez dès que votre saisie est finie.</span>
      <button onClick={() => window.location.reload()}
        className="bg-quai-navy text-white rounded-lg px-3 font-medium whitespace-nowrap min-h-[2.5rem]">Recharger</button>
      <button onClick={() => setMasque(true)} aria-label="Plus tard" title="Plus tard"
        className="w-9 h-10 grid place-items-center shrink-0"><Icon name="x" size="sm" /></button>
    </div>
  )
}
