import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

const AcqAppel = lazy(() => import('./AcqAppel'))

const GROUPES = { RAPPEL: 'Rappel convenu', DELEGUE: 'Délégué', VENDEUR: 'Aussi vendeur', NOUVEAU: 'Jamais appelé', RELANCE: 'À relancer' }
const jj = (s) => s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''

// La file de Madame Fichier : une ligne par personne, dans l'ordre du cahier.
export default function AcqFile() {
  const [d, setD] = useState(null)
  const [ouvert, setOuvert] = useState(null)   // id_contact en cours
  const charger = useCallback(() => api.get('/acquereurs/file').then(r => setD(r.data)).catch(() => setD({ erreur: true })), [])
  useEffect(() => { charger() }, [charger])

  if (ouvert) {
    const idx = d?.file?.findIndex(c => c.id_contact === ouvert) ?? -1
    const suivant = () => {
      api.get('/acquereurs/file').then(r => {
        setD(r.data)
        // Le suivant de la liste mise à jour : celui qu'on vient de traiter en est sorti.
        const prochain = r.data.file.find((c, i) => c.id_contact !== ouvert && i >= Math.max(0, idx - 1)) || r.data.file.find(c => c.id_contact !== ouvert)
        setOuvert(prochain ? prochain.id_contact : null)
      })
    }
    return (
      <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
        <AcqAppel id={ouvert} position={idx >= 0 ? `${idx + 1} / ${d.file.length}` : ''}
          onSuivant={suivant} onRetour={() => { setOuvert(null); charger() }} />
      </Suspense>
    )
  }
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  if (d.erreur) return <p className="p-6 text-sm text-red-700">La file n’a pas pu être chargée. Réessayez.</p>
  const g = d.groupes
  return (
    <div className="p-3 max-w-3xl mx-auto">
      <div className={`rounded-xl p-3 mb-3 text-sm ${d.plage.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        {d.plage.ok ? 'Plage d’appel ouverte : 10h-13h et 14h-20h, du lundi au vendredi.' : d.plage.raison}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs mb-3">
        <span className="badge bg-quai-navy text-white">{d.file.length} à appeler</span>
        {g.rappels > 0 && <span className="badge bg-amber-100 text-amber-900">{g.rappels} rappel{g.rappels > 1 ? 's' : ''} convenu{g.rappels > 1 ? 's' : ''}</span>}
        <span className="badge bg-white border border-quai-border text-quai-muted">{g.nouveaux} jamais appelés</span>
        <span className="badge bg-white border border-quai-border text-quai-muted">{g.relances} à relancer</span>
        {g.en_attente > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.en_attente} sans réponse en attente{d.prochain_retour ? `, le premier revient le ${jj(d.prochain_retour)}` : ''}</span>}
        {g.rappels_a_venir > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.rappels_a_venir} rappels à venir</span>}
        {g.plafonnes > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.plafonnes} au plafond ce mois</span>}
      </div>
      {d.file.length === 0 ? (
        <div className="card text-center text-sm text-quai-muted">Personne à appeler pour l’instant.{d.prochain_retour ? ` Les sans-réponse reviennent à partir du ${jj(d.prochain_retour)}.` : ''}</div>
      ) : (
        <>
          <button className="btn-primary w-full mb-3 min-h-[3rem]" onClick={() => setOuvert(d.file[0].id_contact)}>
            <span className="inline-flex items-center gap-2"><Icon name="play" size="sm" /> Commencer par {d.file[0].prenom} {d.file[0].nom}</span>
          </button>
          <ul className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border">
            {d.file.map(c => (
              <li key={c.id_contact}>
                <button onClick={() => setOuvert(c.id_contact)} className="w-full text-left px-3 py-2.5 hover:bg-quai-light flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-quai-navy truncate">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
                    <div className="text-[11px] text-quai-muted truncate">
                      {GROUPES[c.groupe]}{c.groupe === 'RAPPEL' && c.rappel_le ? ` · ${new Date(c.rappel_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                      {' · '}{c.nb_fiches} recherche{c.nb_fiches > 1 ? 's' : ''}{c.commune ? ` · ${c.commune}` : ''}
                      {c.appels_ce_mois ? ` · ${c.appels_ce_mois} appel${c.appels_ce_mois > 1 ? 's' : ''} ce mois` : ''}
                    </div>
                    {c.appel_recent && <div className="text-[11px] text-amber-800">Appelé le {jj(c.appel_recent.le)} ({c.appel_recent.module})</div>}
                  </div>
                  <Icon name="chevron-right" size="sm" className="text-quai-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
