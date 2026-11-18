import { useState, useEffect, lazy, Suspense } from 'react'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'
import { activerDemo } from '../../demo/demoApi'

// Démonstration des missions Estimés et Courtage : le VRAI écran de l'agent,
// branché sur de fausses fiches. Rien n'est lu ni écrit sur le serveur tant
// qu'elle est ouverte (voir demo/demoApi.js). Les écrans de Chrystelle et de
// Marine ne sont pas modifiés.
const SessionPage = lazy(() => import('../SessionPage'))
const CourtagePage = lazy(() => import('../CourtagePage'))
const JEUX = { estimes: () => import('../../demo/estimes.json'), courtage: () => import('../../demo/courtage.json') }
const NOMS = { estimes: 'Mission Estimés', courtage: 'Mission Courtage' }

export default function DemoMission({ mission, onFermer }) {
  // L'écran n'est monté qu'une fois la couche de démonstration en place : sa
  // toute première requête doit déjà être fictive.
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    let arreter = null, annule = false
    JEUX[mission]().then(m => { if (annule) return; arreter = activerDemo(m.default || m); setPret(true) }).catch(() => setErreur(true))
    return () => { annule = true; if (arreter) arreter() }
  }, [mission])

  return (
    <div className="h-ecran flex flex-col bg-quai-light">
      <div className="bg-quai-encre text-white px-3 py-2 flex items-center gap-3 shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <img src={`/marque/mission-${mission}-long-clair.png`} alt={NOMS[mission]} className="h-7 w-auto shrink-0" />
        <div className="text-[13px] leading-snug flex-1 min-w-0">
          <b>Démonstration</b><span className="hidden sm:inline"> : fiches fictives, rien n’est enregistré.</span>
        </div>
        <button onClick={onFermer} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/30 hover:border-quai-taupe shrink-0">
          <Icon name="x" size="sm" /> Quitter
        </button>
      </div>
      {erreur && <p className="p-6 text-sm text-red-700">La démonstration n’a pas pu être chargée.</p>}
      {pret && (
        <ErrorBoundary>
          <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
            {mission === 'estimes'
              ? <div className="flex-1 flex flex-col overflow-hidden"><SessionPage /></div>
              : <div className="flex-1 overflow-y-auto"><CourtagePage /></div>}
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  )
}
