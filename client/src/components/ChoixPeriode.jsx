import { useState } from 'react'

// Choix de la période d'un suivi : des raccourcis, « depuis le début », ou deux
// dates libres. Il n'y a plus de plafond à 90 jours : le serveur regroupe seul
// par jour, par semaine ou par mois selon la longueur demandée.
//
// La valeur est un petit objet : { jours: 30 } | { tout: true } | { du, au }.
// `enParametres` le traduit pour l'API /relances/stats.
const RACCOURCIS = [
  [7, '7 derniers jours'], [30, '30 derniers jours'], [90, '90 derniers jours'],
  [182, '6 derniers mois'], [365, '12 derniers mois'],
]
const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ilYa = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return jourLocal(d) }

export function enParametres(p) {
  if (p?.tout) return { depuis_debut: 1 }
  if (p?.du && p?.au) return { debut: p.du, fin: p.au }
  // « 7 derniers jours » = aujourd'hui et les six jours d'avant.
  return { debut: ilYa((p?.jours || 30) - 1), fin: jourLocal(new Date()) }
}

// « du 12 oct. au 11 nov. 2026 », à partir de ce que le serveur a réellement retenu.
export function periodeEnClair(periode) {
  if (!periode) return ''
  const f = (iso, annee) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}) })
  const memeAnnee = periode.debut.slice(0, 4) === periode.fin.slice(0, 4)
  return periode.debut === periode.fin ? `le ${f(periode.fin, true)}` : `du ${f(periode.debut, !memeAnnee)} au ${f(periode.fin, true)}`
}

export default function ChoixPeriode({ valeur, onChange, className = '' }) {
  const libre = !!(valeur?.du !== undefined && !valeur?.jours && !valeur?.tout)
  const [du, setDu] = useState(valeur?.du || ilYa(29))
  const [au, setAu] = useState(valeur?.au || jourLocal(new Date()))
  const choix = valeur?.tout ? 'tout' : libre ? 'dates' : String(valeur?.jours || 30)

  const choisir = (v) => {
    if (v === 'tout') return onChange({ tout: true })
    if (v === 'dates') return onChange({ du, au })
    onChange({ jours: Number(v) })
  }
  const borne = (cle, v) => {
    const suivant = { du, au, [cle]: v }
    cle === 'du' ? setDu(v) : setAu(v)
    // Une date tapée à la main peut inverser les bornes : on attend qu'elles soient dans l'ordre.
    if (suivant.du && suivant.au && suivant.du <= suivant.au) onChange(suivant)
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select value={choix} onChange={e => choisir(e.target.value)} className="input w-auto text-sm" aria-label="Période">
        {RACCOURCIS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
        <option value="tout">Depuis le début</option>
        <option value="dates">Choisir les dates…</option>
      </select>
      {libre && (
        <>
          <label className="text-xs text-quai-muted inline-flex items-center gap-1">du
            <input type="date" className="input w-auto text-sm" value={du} max={au || undefined} onChange={e => borne('du', e.target.value)} />
          </label>
          <label className="text-xs text-quai-muted inline-flex items-center gap-1">au
            <input type="date" className="input w-auto text-sm" value={au} min={du || undefined} onChange={e => borne('au', e.target.value)} />
          </label>
        </>
      )}
    </div>
  )
}
