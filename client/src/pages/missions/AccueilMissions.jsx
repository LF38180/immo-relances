import { useState, useEffect } from 'react'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'
import { ONGLETS } from './onglets'

// L'accueil de l'admin : une carte par mission, toutes au même rang. Chaque
// carte donne la personne, trois chiffres du jour, et les mêmes cinq accès.
export default function AccueilMissions({ onOuvrir }) {
  const [d, setD] = useState(null)
  const [erreur, setErreur] = useState(null)
  useEffect(() => {
    api.get('/admin/missions').then(r => setD(r.data)).catch(e => setErreur(e.messageLisible || 'Chargement impossible.'))
  }, [])
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-6xl mx-auto">
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        {!d && !erreur && <p className="text-sm text-quai-muted animate-pulse">Chargement…</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(d?.missions || []).map(m => (
            <section key={m.id} className="bg-white border border-quai-border rounded-xl p-4">
              <button onClick={() => onOuvrir(m.id)} className="text-left w-full">
                <h2 className="font-display font-semibold text-quai-navy text-lg leading-tight">{m.titre}</h2>
                <p className="text-xs text-quai-muted">{m.qui.length ? m.qui.join(', ') : 'Personne pour l’instant'}</p>
              </button>
              <div className="grid grid-cols-3 gap-2 my-3">
                {m.chiffres.map(c => (
                  <div key={c.l}>
                    <div className="text-2xl font-bold text-quai-navy leading-none">{c.n}</div>
                    <div className="text-[11px] text-quai-muted leading-snug mt-1">{c.l}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.id === 'operation'
                  ? <button onClick={() => onOuvrir('operation')} className="btn-secondary btn-sm">Ouvrir l’opération</button>
                  : ONGLETS.map(o => (
                    <button key={o.id} onClick={() => onOuvrir(m.id, o.id)} className="btn-secondary btn-sm">{o.label}</button>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <h2 className="text-[11px] font-semibold text-quai-muted uppercase tracking-wide mt-6 mb-2">Toute l’appli</h2>
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
          {[['utilisateurs', 'Utilisateurs et missions', 'user'], ['activite', 'Activité', 'history'], ['donnees', 'Données et sauvegardes', 'database']].map(([id, l, ic]) => (
            <button key={id} onClick={() => onOuvrir(id)} className="bg-white border border-quai-border rounded-xl px-4 py-3 text-left text-sm text-quai-navy hover:border-quai-gold inline-flex items-center gap-2">
              <Icon name={ic} size="sm" className="text-quai-muted" /> {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
