import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// Saisie des courriers revenus (NPAI).
//
// Les plis sont partis la semaine du 16 octobre : les retours arriveront
// pendant l'opération, étalés sur plusieurs semaines. Les marquer bascule la
// fiche en objectif adresse — le conseiller saura qu'il appelle pour récupérer
// une adresse, et non pour proposer une actualisation à quelqu'un qui n'a rien
// reçu.
export default function MarquerNpai({ onFermer }) {
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState([])
  const [marques, setMarques] = useState([])
  const [enCours, setEnCours] = useState(null)

  useEffect(() => {
    if (recherche.trim().length < 2) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get('/operation/recherche', { params: { q: recherche.trim() } })
        .then(r => setResultats(r.data)).catch(() => setResultats([]))
    }, 250)
    return () => clearTimeout(t)
  }, [recherche])

  const marquer = async (c) => {
    setEnCours(c.id_modelo)
    try {
      await api.post(`/operation/contacts/${c.id_modelo}/npai`, { npai: true })
      setMarques(m => [{ ...c, quand: new Date() }, ...m])
      setRecherche(''); setResultats([])
      toast.success(`${c.nom} : courrier revenu, objectif adresse`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible de marquer ce contact')
    } finally { setEnCours(null) }
  }

  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div className="bg-white w-full md:max-w-lg h-[80vh] md:h-auto md:max-h-[80vh]
                      rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="px-4 py-3 border-b border-quai-border flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-quai-navy text-sm">Un courrier est revenu</div>
            <div className="text-[11px] text-quai-muted leading-snug">
              La fiche passe en objectif adresse et remonte dans la file du conseiller.
            </div>
          </div>
          <button onClick={onFermer} className="text-quai-muted hover:text-quai-navy p-1">
            <Icon name="x" size="sm" />
          </button>
        </div>

        <div className="p-3 border-b border-quai-border shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted pointer-events-none">
              <Icon name="search" size="sm" />
            </span>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} autoFocus
              placeholder="Nom sur l’enveloppe…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-quai-border
                         min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {resultats.length > 0 && (
            <ul className="divide-y divide-quai-border/60">
              {resultats.map(c => (
                <li key={c.id_modelo}>
                  <button onClick={() => marquer(c)} disabled={enCours === c.id_modelo}
                    className="w-full text-left px-4 py-3 hover:bg-quai-light transition-colors disabled:opacity-50">
                    <div className="text-sm text-quai-navy">{c.civilite} {c.prenom} {c.nom}</div>
                    <div className="text-[11px] text-quai-muted leading-snug">
                      {[c.adresse, c.code_postal, c.commune].filter(Boolean).join(', ') || 'sans adresse'}
                    </div>
                    <div className="text-[11px] text-quai-muted">
                      Suivi par {c.conseiller || '—'}
                      {c.objectif_principal === 'ADRESSE' && ' · déjà en objectif adresse'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {recherche.trim().length >= 2 && !resultats.length && (
            <p className="text-sm text-quai-muted text-center py-6">Personne de ce nom.</p>
          )}

          {marques.length > 0 && (
            <div className="p-3">
              <div className="text-[11px] font-semibold text-quai-muted uppercase tracking-wide mb-1.5">
                Marqués à l’instant
              </div>
              <ul className="space-y-1">
                {marques.map(c => (
                  <li key={c.id_modelo} className="text-sm text-quai-navy flex items-center gap-2">
                    <Icon name="check-circle-2" size="sm" className="text-emerald-600 shrink-0" />
                    {c.prenom} {c.nom}
                    <span className="text-[11px] text-quai-muted ml-auto">{c.conseiller}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!recherche && !marques.length && (
            <p className="text-sm text-quai-muted text-center py-8 px-6 leading-snug">
              Tapez le nom figurant sur l’enveloppe revenue.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
