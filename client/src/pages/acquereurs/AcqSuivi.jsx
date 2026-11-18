import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { Chiffre, Titre } from './ui'

// Tableau de bord (cahier, section 6). Pas de compteur « affaires conclues » :
// le délai se compte en mois, un compteur bloqué à zéro démobilise.
export default function AcqSuivi({ onVoir }) {
  const lundi = (() => { const d = new Date(); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return d.toLocaleDateString('fr-CA') })()
  const [debut, setDebut] = useState(lundi)
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/suivi', { params: { debut } }).then(r => setD(r.data)).catch(() => setD(null)) }, [debut])
  // Troisième valeur : le filtre du Listing que la case ouvre (admin).
  const voir = (f) => (onVoir && f ? () => onVoir(f) : undefined)
  const bouton = (actif) => `text-xs px-3 py-2 rounded-lg border transition-colors ${actif ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-navy hover:border-quai-gold'}`
  return (
    <div className="p-3 md:p-4 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-quai-muted">Depuis le</span>
        <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="input max-w-[11rem]" />
        <button className={bouton(debut === lundi)} onClick={() => setDebut(lundi)}>Cette semaine</button>
        <button className={bouton(debut === '2026-01-01')} onClick={() => setDebut('2026-01-01')}>Depuis le début</button>
      </div>
      {!d ? <p className="text-sm text-quai-muted animate-pulse">Chargement…</p> : (<>
        <section>
          <Titre>L’activité</Titre>
          <div className="grid grid-cols-3 gap-2">
            <Chiffre fort valeur={d.appels} libelle="appels passés" icon="phone" />
            <Chiffre valeur={d.traites} libelle="personnes traitées" icon="users" />
            <Chiffre valeur={d.joints} libelle="personnes jointes" icon="phone-call" />
          </div>
        </section>
        <section>
          <Titre>Ce que ça a donné</Titre>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Chiffre valeur={d.requalifies} libelle="requalifiés" icon="check-circle-2" onClick={voir('REQUALIFIE')} />
            <Chiffre valeur={d.vendeurs} libelle="vendeurs repérés" icon="tag" onClick={voir('vendeurs')} />
            <Chiffre valeur={d.estimations_acceptees} libelle={`estimations calées (${d.estimations_proposees} proposées)`} icon="calendar-check" onClick={voir('est_acc')} />
            <Chiffre valeur={d.marine} libelle="orientés vers Marine" icon="users" onClick={voir('marine')} />
            <Chiffre valeur={d.archives} libelle="archivés (abandon, déjà acheté, ne plus contacter)" icon="file-check" />
            <Chiffre valeur={d.restants} libelle="jamais appelés, au total" icon="phone-off" onClick={voir('jamais')} />
          </div>
        </section>
      </>)}
    </div>
  )
}
