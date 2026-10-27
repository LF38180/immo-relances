import { useState, useEffect, useMemo } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// La vue d'ensemble : toutes les fiches, leur état, ce qu'elles ont donné.
//
// Le pilotage répond à « combien » ; ce listing répond à « lesquelles ».
// C'est ici qu'on regarde où en est un agent sur son portefeuille, et qu'on
// retrouve une fiche précise sans passer par lui.

const ETATS = {
  JAMAIS_APPELE: { label: 'Jamais appelé', couleur: 'bg-quai-light text-quai-muted' },
  JOINT:         { label: 'Joint',         couleur: 'bg-emerald-100 text-emerald-800' },
  A_RAPPELER:    { label: 'À rappeler',    couleur: 'bg-amber-100 text-amber-800' },
  A_RELANCER:    { label: 'À relancer',    couleur: 'bg-quai-gold/25 text-quai-navy' },
  CLOS:          { label: 'Clos',          couleur: 'bg-red-100 text-red-800' },
  A_DISPATCHER:  { label: 'Sans conseiller', couleur: 'bg-quai-navy text-white' },
  A_VERIFIER:    { label: 'À vérifier',    couleur: 'bg-amber-200 text-amber-900' },
}

const ORDRE = ['JAMAIS_APPELE', 'JOINT', 'A_RAPPELER', 'A_RELANCER', 'CLOS', 'A_DISPATCHER', 'A_VERIFIER']

export default function ListingPage() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [agent, setAgent] = useState('')
  const [etat, setEtat] = useState('')
  const [recherche, setRecherche] = useState('')
  const [ouverte, setOuverte] = useState(null)

  useEffect(() => {
    api.get('/operation/listing')
      .then(r => setData(r.data))
      .catch(() => { setErreur(true); toast.error('Chargement impossible') })
  }, [])

  const lignes = data?.lignes || []

  const agents = useMemo(() => {
    const m = new Map()
    lignes.forEach(l => { const v = l.conseiller; if (v) m.set(v, (m.get(v) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lignes])

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(l => {
      if (agent && l.conseiller !== agent) return false
      if (etat && l.etat !== etat) return false
      if (!q) return true
      return [l.nom, l.prenom, l.commune, l.bien_commune, l.id_modelo]
        .some(x => String(x || '').toLowerCase().includes(q))
    })
  }, [lignes, agent, etat, recherche])

  // Les chiffres se recalculent sur ce qui est affiché : filtrer par agent
  // donne son propre bilan, sans changer d'écran.
  const bilan = useMemo(() => {
    const b = { appeles: 0, joints: 0, rdv: 0, soiree: 0, panneau: 0, fiches: 0 }
    visibles.forEach(l => {
      if (l.appels) b.appeles++
      if (l.etat === 'JOINT') b.joints++
      if (l.actualisation === 'ACCEPTEE') b.rdv++
      if (l.soiree === 1) b.soiree++
      if (l.panneau === 1) b.panneau++
      if (l.adresse_maj || l.fiche_confirmee === 1 || l.projet || l.toujours_proprietaire != null) b.fiches++
    })
    return b
  }, [visibles])

  const exporter = () => {
    if (!visibles.length) return toast.error('Rien à exporter')
    const cols = ['id_modelo', 'conseiller', 'nom', 'prenom', 'commune', 'bien_type', 'bien_commune',
      'script', 'courrier_etat', 'etat', 'appels', 'dernier_le', 'derniere_issue', 'dernier_par',
      'actualisation', 'date_rdv', 'soiree', 'panneau', 'adresse_maj', 'projet',
      'recommandation_nom', 'derniere_note']
    const ech = (v) => {
      const x = v == null ? '' : String(v)
      return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x
    }
    const csv = [cols.join(';'), ...visibles.map(l => cols.map(c => ech(l[c])).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `listing-${agent || 'tous'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger le listing.</p>
  if (!data) return <p className="p-6 text-quai-muted">Chargement…</p>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-3 max-w-5xl mx-auto">

        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl font-bold text-quai-navy">Listing</h1>
            <p className="text-sm text-quai-muted">
              {visibles.length} fiche{visibles.length > 1 ? 's' : ''}
              {visibles.length !== lignes.length && ` sur ${lignes.length}`}
            </p>
          </div>
          <button onClick={exporter}
            className="text-xs px-3 py-2 rounded-lg border border-quai-border text-quai-muted
                       hover:border-quai-gold hover:text-quai-navy inline-flex items-center gap-1.5">
            <Icon name="file-down" size="sm" /> Excel
          </button>
        </div>

        {/* Le bilan de ce qui est affiché. */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <Chiffre v={bilan.appeles} l="appelés" />
          <Chiffre v={bilan.joints} l="joints" couleur="text-emerald-700" />
          <Chiffre v={bilan.rdv} l="estimations" couleur="text-quai-gold" />
          <Chiffre v={bilan.soiree} l="soirée" />
          <Chiffre v={bilan.panneau} l="panneaux" />
          <Chiffre v={bilan.fiches} l="fiches à jour" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={agent} onChange={e => setAgent(e.target.value)} aria-label="Conseiller"
            className={`text-xs px-2.5 py-2 rounded-lg border bg-white min-h-[2.75rem] md:min-h-0 ${
              agent ? 'border-quai-gold text-quai-navy font-medium' : 'border-quai-border text-quai-muted'}`}>
            <option value="">Tous les conseillers</option>
            {agents.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted pointer-events-none">
              <Icon name="search" size="sm" />
            </span>
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Nom, commune, identifiant…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-quai-border
                         min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Pastille actif={!etat} onClick={() => setEtat('')}>
            Tous <span className="opacity-70">{lignes.length}</span>
          </Pastille>
          {ORDRE.filter(e => data.par_etat[e]).map(e => (
            <Pastille key={e} actif={etat === e} onClick={() => setEtat(etat === e ? '' : e)}>
              {ETATS[e].label} <span className="opacity-70">{data.par_etat[e]}</span>
            </Pastille>
          ))}
        </div>

        <div className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border/60">
          {!visibles.length && (
            <p className="text-sm text-quai-muted text-center py-8">Aucune fiche ne correspond.</p>
          )}
          {visibles.slice(0, 300).map(l => (
            <Ligne key={l.id_modelo} l={l}
              ouverte={ouverte === l.id_modelo}
              onBasculer={() => setOuverte(ouverte === l.id_modelo ? null : l.id_modelo)} />
          ))}
        </div>

        {visibles.length > 300 && (
          <p className="text-xs text-quai-muted text-center">
            300 premières affichées sur {visibles.length}. Affinez le filtre ou exportez en Excel.
          </p>
        )}
      </div>
    </div>
  )
}

function Chiffre({ v, l, couleur = 'text-quai-navy' }) {
  return (
    <div className="bg-white border border-quai-border rounded-lg px-2.5 py-2">
      <div className={`text-lg font-bold tabular-nums leading-none ${couleur}`}>{v}</div>
      <div className="text-[10px] text-quai-muted leading-tight mt-0.5">{l}</div>
    </div>
  )
}

function Pastille({ actif, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
        actif ? 'bg-quai-navy text-white border-quai-navy'
              : 'border-quai-border text-quai-muted hover:border-quai-gold hover:text-quai-navy'}`}>
      {children}
    </button>
  )
}

function Ligne({ l, ouverte, onBasculer }) {
  const e = ETATS[l.etat] || ETATS.JAMAIS_APPELE
  const quand = l.dernier_le
    ? new Date(l.dernier_le.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : null

  return (
    <div>
      <button onClick={onBasculer} className="w-full text-left px-3 py-2.5 hover:bg-quai-light transition-colors">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-quai-navy">{l.nom} {l.prenom}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${e.couleur}`}>{e.label}</span>
              {l.actualisation === 'ACCEPTEE' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-medium">
                  estimation
                </span>
              )}
              {l.stop_telephone === 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white">stop tél.</span>
              )}
            </div>
            <div className="text-[11px] text-quai-muted mt-0.5">
              {l.conseiller || 'sans conseiller'}
              {l.bien_commune && ` · ${l.bien_commune}`}
              {l.appels > 0 && ` · ${l.appels} appel${l.appels > 1 ? 's' : ''}`}
              {quand && ` · ${quand}`}
            </div>
          </div>
          <Icon name={ouverte ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted shrink-0 mt-1" />
        </div>
      </button>

      {ouverte && (
        <div className="px-3 pb-3 pt-1 bg-quai-light/50 text-[12px] space-y-1.5">
          <Info label="Identifiant Modelo" v={l.id_modelo} />
          <Info label="Script" v={`${l.script} · ${l.courrier_etat?.toLowerCase().replace(/_/g, ' ')}`} />
          <Info label="Bien" v={[l.bien_type, l.bien_commune].filter(Boolean).join(' · ')} />
          <Info label="Téléphone" v={l.tel_portable || l.tel_fixe} />
          <Info label="Mail" v={l.email} />
          {l.derniere_issue && (
            <Info label="Dernier appel"
              v={`${l.derniere_issue.toLowerCase().replace(/_/g, ' ')}${l.dernier_par ? ` — ${l.dernier_par}` : ''}`} />
          )}
          {l.rappel_le && <Info label="Rappel prévu" v={new Date(l.rappel_le).toLocaleString('fr-FR')} />}
          {l.actualisation && <Info label="Estimation" v={`${l.actualisation.toLowerCase()}${l.date_rdv ? ` — ${l.date_rdv}` : ''}`} />}
          {l.adresse_maj && <Info label="Nouvelle adresse" v={l.adresse_maj} />}
          {l.projet && <Info label="Projet" v={`${l.projet.toLowerCase()}${l.projet_echeance ? ` — ${l.projet_echeance} mois` : ''}`} />}
          {l.recommandation_nom && <Info label="Recommande" v={l.recommandation_nom} />}
          {l.derniere_note && (
            <div className="text-quai-text italic bg-white rounded px-2 py-1.5 leading-snug">
              « {l.derniere_note} »
            </div>
          )}
          {l.point_attention && (
            <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
              {l.point_attention}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Info({ label, v }) {
  if (!v) return null
  return (
    <div className="flex gap-2">
      <span className="text-quai-muted w-32 shrink-0">{label}</span>
      <span className="text-quai-navy break-all">{v}</span>
    </div>
  )
}
