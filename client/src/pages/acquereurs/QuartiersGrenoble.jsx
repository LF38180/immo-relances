import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

// Les quartiers de Grenoble d'une recherche (demande de Lilas, 20/11/2026).
//
// Ce bloc n'apparaît que si « Grenoble » figure dans les secteurs. Par défaut
// c'est toute la ville. Sinon l'agent coche des quartiers sur la carte : ce
// sont les 70 quartiers IRIS, qu'Exploration Modelo trace ensuite sur la
// carte de la recherche dans Modelo.
//
// Modelo n'accepte que 3 zones par recherche : le serveur fusionne les
// quartiers qui se touchent et dit ce qui partira. On l'affiche avant
// l'enregistrement, pas après.
const STYLE = { color: '#0D0D2B', weight: 1, fillColor: '#C9A96E', fillOpacity: 0.08 }
const CHOISI = { color: '#0D0D2B', weight: 2.5, fillColor: '#C9A96E', fillOpacity: 0.55 }

let quartiersCharges = null
const chargerQuartiers = () => quartiersCharges
  || (quartiersCharges = fetch('/acquereurs/grenoble-quartiers.json').then(r => { if (!r.ok) throw new Error('carte'); return r.json() })
    .catch(e => { quartiersCharges = null; throw e }))

export default function QuartiersGrenoble({ secteurs, valeur = [], onChange, zoneModelo = false, lecture = false }) {
  const [mode, setMode] = useState(valeur.length ? 'QUARTIERS' : 'TOUT')
  const [quartiers, setQuartiers] = useState(null)
  const [panne, setPanne] = useState(false)
  const [apercu, setApercu] = useState(null)
  const boite = useRef(null), carte = useRef(null), couches = useRef({})
  // La carte appelle toujours la dernière version de la sélection.
  const etat = useRef({ valeur, onChange, lecture }); etat.current = { valeur, onChange, lecture }
  const codes = valeur.map(q => q.code)

  useEffect(() => {
    if (mode !== 'QUARTIERS' || quartiers) return
    chargerQuartiers().then(setQuartiers).catch(() => setPanne(true))
  }, [mode, quartiers])

  // La carte, créée une fois les contours arrivés.
  useEffect(() => {
    if (mode !== 'QUARTIERS' || !quartiers || !boite.current || carte.current) return
    // Zoom par quarts de cran : Grenoble remplit la carte au lieu de flotter au milieu.
    const c = L.map(boite.current, { scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(c)
    const groupe = L.featureGroup().addTo(c)
    for (const [code, q] of Object.entries(quartiers)) {
      const p = L.polygon(q.zone.map(a => a.map(([x, y]) => [y, x])), STYLE).addTo(groupe)
      p.bindTooltip(q.nom, { sticky: true })
      p.on('click', () => {
        const e = etat.current
        if (e.lecture) return
        e.onChange(e.valeur.some(v => v.code === code) ? e.valeur.filter(v => v.code !== code) : [...e.valeur, { code, nom: q.nom }])
      })
      couches.current[code] = p
    }
    c.fitBounds(groupe.getBounds(), { padding: [4, 4] })
    carte.current = c
    return () => { c.remove(); carte.current = null; couches.current = {} }
  }, [mode, quartiers])

  useEffect(() => {
    for (const [code, p] of Object.entries(couches.current)) p.setStyle(codes.includes(code) ? CHOISI : STYLE)
  }, [codes.join(','), quartiers, mode])

  // Ce qui partira dans Modelo : demandé au serveur, qui connaît les contours.
  useEffect(() => {
    if (mode !== 'QUARTIERS' || !codes.length) { setApercu(null); return }
    let vivant = true
    const t = setTimeout(() => {
      api.post('/acquereurs/zones/apercu', { secteurs, quartiers: codes })
        .then(r => { if (vivant) setApercu(r.data) }).catch(() => { if (vivant) setApercu(null) })
    }, 350)
    return () => { vivant = false; clearTimeout(t) }
  }, [mode, codes.join(','), secteurs])

  const choisirMode = (m) => { if (lecture) return; setMode(m); if (m === 'TOUT' && valeur.length) onChange([]) }
  const tries = [...valeur].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  return (
    <div className="mt-2 rounded-lg border border-quai-border bg-quai-light/60 p-3" data-quartiers-grenoble>
      <div className="text-sm font-medium text-quai-navy mb-1.5">Grenoble : toute la ville, ou certains quartiers ?</div>
      <div className="flex flex-wrap gap-2">
        {[['TOUT', 'Tout Grenoble'], ['QUARTIERS', 'Certains quartiers']].map(([v, l]) => (
          <button key={v} type="button" onClick={() => choisirMode(v)} aria-pressed={mode === v}
            className={`text-sm px-3 py-2 rounded-lg border min-h-[2.75rem] ${mode === v ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white text-quai-navy border-quai-border'}`}>
            {l}
          </button>
        ))}
      </div>
      {zoneModelo && (
        <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
          Cette recherche a une zone dessinée dans Modelo. Elle sera remplacée par ce que vous saisissez ici.
        </p>
      )}

      {mode === 'QUARTIERS' && (
        <div className="mt-2">
          {panne
            ? <p className="text-sm text-red-700">La carte des quartiers ne se charge pas. Rechargez la page, ou choisissez « Tout Grenoble ».</p>
            : <>
              <p className="text-[12px] text-quai-muted mb-1">Cliquez ou touchez un quartier pour le choisir, une seconde fois pour l’enlever. Vos choix s’affichent sous la carte.</p>
              <div ref={boite} className="h-80 sm:h-[30rem] rounded-lg border border-quai-border overflow-hidden bg-white relative z-0" />
              {!quartiers && <p className="text-sm text-quai-muted animate-pulse mt-1">Chargement de la carte…</p>}
            </>}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {tries.length === 0 && <span className="text-sm text-quai-muted">Aucun quartier choisi : la recherche partira sur tout Grenoble.</span>}
            {tries.map(q => (
              <span key={q.code} className="inline-flex items-center gap-1 text-[13px] bg-white border border-quai-border rounded-full pl-2.5 pr-1 py-0.5">
                {q.nom}
                {!lecture && <button type="button" onClick={() => onChange(valeur.filter(v => v.code !== q.code))}
                  className="w-7 h-7 inline-flex items-center justify-center text-quai-muted hover:text-red-700" aria-label={`Enlever ${q.nom}`}>
                  <Icon name="x" size="sm" /></button>}
              </span>
            ))}
            {tries.length > 1 && !lecture && <button type="button" onClick={() => onChange([])} className="text-[12px] text-quai-muted underline ml-1">Tout enlever</button>}
          </div>

          {apercu && <Apercu a={apercu} />}
        </div>
      )}
    </div>
  )
}

function Apercu({ a }) {
  const s = (n) => n > 1 ? 's' : ''
  if (a.repli === 'TROP_DE_ZONES') return (
    <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-2 leading-snug" data-apercu-zones>
      <b>Trop de zones séparées ({a.nb_zones}).</b> Modelo n’en accepte que 3 par recherche. Telle quelle, la recherche partira
      sur <b>tout Grenoble</b> et les autres communes entières ; vos quartiers seront seulement écrits dans les Précisions.
      Pour garder les quartiers : choisissez des quartiers qui se touchent, ou retirez une commune.
    </p>
  )
  if (a.repli === 'SANS_CONTOUR') return (
    <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-2 leading-snug" data-apercu-zones>
      <b>Commune non reconnue : {a.inconnues.join(', ')}.</b> Vérifiez l’orthographe (communes de l’Isère).
      Sinon la localisation ne sera pas modifiée dans Modelo et Loïck tranchera ; tout reste écrit dans les Précisions.
    </p>
  )
  if (a.mode !== 'ZONES') return null
  return (
    <p className="text-[13px] text-quai-text bg-white border border-quai-border rounded-lg px-2.5 py-2 mt-2 leading-snug" data-apercu-zones>
      Dans Modelo : <b>{a.nb_zones} zone{s(a.nb_zones)} tracée{s(a.nb_zones)}</b> ({a.zones.map(z => z.nom).join(' ; ')}).
      {a.englobes?.length > 0 && <span className="block text-amber-900 mt-1">
        Entouré{s(a.englobes.length)} par vos quartiers, donc inclus aussi : {a.englobes.join(', ')}.</span>}
    </p>
  )
}
