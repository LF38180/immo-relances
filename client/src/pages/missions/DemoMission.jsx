import { useState, useEffect, lazy, Suspense } from 'react'
import Icon from '../../components/ui/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'
import { activerDemo } from '../../demo/demoApi'
import EnTeteMission from '../../components/EnTeteMission'
import { Pastille } from '../../components/ui/Briques'

// Démonstration des missions Estimés et Courtage : le VRAI écran de l'agent,
// branché sur de fausses fiches. Rien n'est lu ni écrit sur le serveur tant
// qu'elle est ouverte (voir demo/demoApi.js). Les écrans de Chrystelle et de
// Marine ne sont pas modifiés.
const SessionPage = lazy(() => import('../SessionPage'))
const CourtagePage = lazy(() => import('../CourtagePage'))
const JEUX = { estimes: () => import('../../demo/estimes.json'), courtage: () => import('../../demo/courtage.json') }

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
      <EnTeteMission mission={mission}
        actions={
          <button onClick={onFermer} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 min-h-[2.75rem] sm:min-h-0 rounded-full border border-white/30 hover:border-quai-taupe shrink-0 focus-clair">
            <Icon name="x" size="sm" /> Quitter
          </button>
        }>
        <Pastille ton="clair">Démonstration</Pastille>
        <span className="hidden sm:inline text-[13px] leading-snug text-white/80 truncate min-w-0">Fiches fictives, rien n’est enregistré.</span>
      </EnTeteMission>
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
