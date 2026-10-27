import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import EcranAppel from './EcranAppel'

// Les quatre scripts, déroulables devant la salle.
//
// Même écran que les agents, mêmes gestes, mais sur des fiches fictives : rien
// de ce qui est saisi ici n'est enregistré, et les numéros sont dans la plage
// que l'ARCEP réserve à la fiction. On peut donc tout montrer, deux fois, sans
// fausser les compteurs de personne ni déranger un vrai client.
export default function DemoPage() {
  const [fiches, setFiches] = useState(null)
  const [i, setI] = useState(0)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    api.get('/operation/demo')
      .then(r => setFiches(r.data.fiches))
      .catch(e => setErreur(e.response?.data?.error || 'Chargement impossible'))
  }, [])

  if (erreur) return <p className="p-6 text-quai-muted">{erreur}</p>
  if (!fiches) return <p className="p-6 text-quai-muted">Chargement…</p>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-quai-navy text-white px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="text-[13px] leading-snug">
            <b>Démonstration</b> — fiches fictives, rien n’est enregistré.
          </div>
          <div className="flex gap-1.5 shrink-0">
            {fiches.map((f, n) => (
              <button key={f.id_modelo} onClick={() => setI(n)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  i === n ? 'bg-quai-gold text-quai-navy border-quai-gold'
                          : 'border-white/30 text-white/80 hover:border-quai-gold'}`}>
                Script {f.script}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="max-w-3xl mx-auto px-4 pt-3 text-[13px] text-quai-muted leading-snug">
        {fiches[i].situation}
      </p>

      <EcranAppel key={fiches[i].id_modelo} contact={fiches[i]} demo
        onEnregistre={() => {
          if (i + 1 < fiches.length) setI(i + 1)
          else toast('Fin de la démonstration', { icon: '✓' })
        }}
        onPasser={() => setI(n => (n + 1) % fiches.length)} />
    </div>
  )
}
