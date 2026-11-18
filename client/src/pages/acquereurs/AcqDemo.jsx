import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import AcqAppel from './AcqAppel'

// Démonstration du Fichier Acquéreurs : le même écran que Lilas, sur trois
// acquéreurs fictifs. Rien de ce qui est saisi n'est enregistré : on peut tout
// montrer, deux fois, sans fausser un compteur ni appeler un vrai client.
export default function AcqDemo() {
  const [cas, setCas] = useState(null), [i, setI] = useState(0), [tour, setTour] = useState(0)
  useEffect(() => { api.get('/acquereurs/demo').then(r => setCas(r.data.cas)).catch(e => toast.error(e.messageLisible || 'Chargement impossible')) }, [])
  if (!cas) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  const c = cas[i]
  return (
    <div>
      <div className="bg-quai-navy text-white px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px]"><b>Démonstration</b> : acquéreurs fictifs, rien n’est enregistré.</div>
          <div className="flex gap-1.5">
            {cas.map((x, n) => (
              <button key={x.contact.id_contact} onClick={() => { setI(n); setTour(t => t + 1) }}
                className={`text-xs px-2.5 py-1 rounded-full border ${i === n ? 'bg-quai-gold text-quai-navy border-quai-gold' : 'border-white/30 text-white/80'}`}>
                {x.contact.prenom} {x.contact.nom}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="max-w-3xl mx-auto px-4 pt-3 text-[13px] text-quai-muted">{c.situation}</p>
      <AcqAppel key={`${c.contact.id_contact}-${tour}`} id={c.contact.id_contact} demo={c} position={`Démo ${i + 1} / ${cas.length}`}
        onSuivant={() => { if (i + 1 < cas.length) setI(i + 1); else toast('Fin de la démonstration'); setTour(t => t + 1) }}
        onRetour={() => { setI(0); setTour(t => t + 1) }} />
    </div>
  )
}
