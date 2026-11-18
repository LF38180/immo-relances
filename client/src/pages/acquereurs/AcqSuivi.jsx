import { useState, useEffect } from 'react'
import api from '../../utils/api'

// Tableau de bord (cahier, section 6). Pas de compteur « affaires conclues » :
// le délai se compte en mois, un compteur bloqué à zéro démobilise.
export default function AcqSuivi() {
  const lundi = (() => { const d = new Date(); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return d.toLocaleDateString('fr-CA') })()
  const [debut, setDebut] = useState(lundi)
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/suivi', { params: { debut } }).then(r => setD(r.data)).catch(() => setD(null)) }, [debut])
  const cases = d ? [
    ['Appels passés', d.appels], ['Personnes traitées', d.traites], ['Personnes jointes', d.joints],
    ['Requalifiés', d.requalifies], ['Archivés (abandon, déjà acheté, ne plus contacter)', d.archives],
    ['Vendeurs repérés', d.vendeurs], ['Estimations proposées', d.estimations_proposees],
    ['Estimations acceptées', d.estimations_acceptees], ['Orientés vers Marine', d.marine],
    ['Jamais appelés (au total)', d.restants],
  ] : []
  return (
    <div className="p-3 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-quai-muted">Depuis le</span>
        <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="input max-w-[11rem]" />
        <button className="btn-secondary text-xs" onClick={() => setDebut(lundi)}>Cette semaine</button>
        <button className="btn-secondary text-xs" onClick={() => setDebut('2026-01-01')}>Depuis le début</button>
      </div>
      {!d ? <p className="text-sm text-quai-muted">Chargement…</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cases.map(([l, n]) => (
            <div key={l} className="bg-white border border-quai-border rounded-xl p-3">
              <div className="text-2xl font-bold text-quai-navy">{n}</div>
              <div className="text-xs text-quai-muted leading-snug">{l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
