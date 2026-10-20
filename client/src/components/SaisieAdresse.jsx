import { useState, useEffect, useRef } from 'react'

// Saisie d'adresse avec propositions, via l'API Adresse de l'État
// (api-adresse.data.gouv.fr, service public et gratuit).
//
// L'agent tape « 65 avenue de claix », choisit dans la liste, et le code postal
// et la commune se remplissent seuls. Sur un appel où l'on recueille une
// adresse à l'oral, ça évite les fautes de frappe et les communes mal
// orthographiées — et ça fait gagner le temps de deux champs.
//
// La recherche est centrée sur l'agglomération grenobloise : sans cela,
// « 12 rue du Général de Gaulle » remonte des adresses de toute la France.
const GRENOBLE = { lat: 45.19, lon: 5.72 }

export default function SaisieAdresse({ valeur, onChoisir, onSaisir, label = 'Adresse' }) {
  const [propositions, setPropositions] = useState([])
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState(false)
  const bloc = useRef(null)

  useEffect(() => {
    const q = (valeur || '').trim()
    // Moins de cinq caractères : la recherche ne renvoie que du bruit.
    if (q.length < 5) { setPropositions([]); return }
    const t = setTimeout(() => {
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}`
        + `&limit=5&lat=${GRENOBLE.lat}&lon=${GRENOBLE.lon}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setPropositions(d.features || []); setErreur(false) })
        // Hors ligne ou service indisponible : la saisie manuelle reste
        // possible, c'est une aide, pas un passage obligé.
        .catch(() => { setPropositions([]); setErreur(true) })
    }, 300)
    return () => clearTimeout(t)
  }, [valeur])

  useEffect(() => {
    const dehors = (e) => { if (!bloc.current?.contains(e.target)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const retenir = (f) => {
    const p = f.properties
    onChoisir({
      // `name` est le numéro et la voie, sans la commune — c'est ce qu'on veut
      // dans le champ adresse.
      adresse: p.name || p.label,
      code_postal: p.postcode || '',
      commune: p.city || '',
    })
    setOuvert(false)
    setPropositions([])
  }

  return (
    <div ref={bloc} className="relative">
      <label className="block">
        <span className="text-[11px] text-quai-muted">{label}</span>
        <input
          type="text"
          value={valeur || ''}
          onChange={e => { onSaisir(e.target.value); setOuvert(true) }}
          onFocus={() => setOuvert(true)}
          autoComplete="off"
          placeholder="65 avenue de Claix…"
          className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                     min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30"
        />
      </label>

      {ouvert && propositions.length > 0 && (
        <ul className="absolute z-[1350] left-0 right-0 mt-1 bg-white border border-quai-border
                       rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {propositions.map(f => (
            <li key={f.properties.id}>
              <button type="button" onMouseDown={() => retenir(f)}
                className="w-full text-left px-3 py-2.5 hover:bg-quai-light transition-colors
                           text-sm text-quai-navy leading-snug">
                {f.properties.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur && (valeur || '').trim().length >= 5 && (
        <p className="text-[11px] text-quai-muted mt-0.5">
          Propositions indisponibles — saisissez à la main.
        </p>
      )}
    </div>
  )
}
