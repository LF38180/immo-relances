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
  // Hors de la file : rien à composer. Le numéro est à chercher dans Modelo.
  SANS_TELEPHONE: { label: 'Sans numéro',  couleur: 'bg-red-50 text-red-800 border border-red-200' },
}

const ORDRE = ['JAMAIS_APPELE', 'JOINT', 'A_RAPPELER', 'A_RELANCER', 'CLOS', 'A_DISPATCHER', 'A_VERIFIER', 'SANS_TELEPHONE']

// Ce qu'un agent peut rapporter d'un appel. Sert à répondre à « qu'est-ce qui
// a changé sur cette fiche » : le pilotage en donne le nombre, mais c'est ici
// qu'on voit quoi, et sur qui — c'est ce qu'il faut pour reporter dans Modelo.
//
// « Vérifié, rien n'a changé » en fait partie : c'est une information, pas une
// absence d'information, et une fiche confirmée n'est pas une fiche oubliée.
const RECUEILLI = [
  ['adresse_maj', 'adresse'],
  ['commune_maj', 'commune'],
  ['statut_actuel', 'situation'],
  ['toujours_proprietaire', 'propriétaire ?'],
  ['revendu_quand', 'revente'],
  ['projet', 'projet'],
  ['recommandation_nom', 'recommandation'],
  ['fiche_confirmee', 'vérifié, rien changé'],
]

// Un champ compte comme recueilli s'il porte une valeur. Deux pièges :
//
//  - `fiche_confirmee` vaut 0 par défaut sur toute fiche ayant une ligne de
//    résultats. Seul 1 signifie « vérifié avec lui ». Testé à zéro, il faisait
//    passer sept fiches jamais appelées pour des fiches enrichies.
//  - `toujours_proprietaire` est un vrai booléen : 0 veut dire « non, il a
//    revendu », ce qui est une information. On le garde.
const majFiche = (l) => RECUEILLI.filter(([k]) => {
  if (k === 'fiche_confirmee') return l[k] === 1
  return l[k] !== null && l[k] !== undefined && l[k] !== ''
})

export default function ListingPage({ onAppeler }) {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [agent, setAgent] = useState('')
  const [etat, setEtat] = useState('')
  const [recherche, setRecherche] = useState('')
  const [ouverte, setOuverte] = useState(null)
  // Les courriers revenus : un filtre à part, parce qu'ils se regardent en
  // bloc quand un lot de retours arrive.
  const [npaiSeuls, setNpaiSeuls] = useState(false)
  // Les fiches que les agents ont enrichies : c'est ce qui se reporte dans
  // Modelo à la fin de l'opération.
  const [majSeules, setMajSeules] = useState(false)

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

  const nbNpai = useMemo(() => lignes.filter(l => l.npai === 1).length, [lignes])
  const nbMaj = useMemo(() => lignes.filter(l => majFiche(l).length).length, [lignes])

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(l => {
      if (agent && l.conseiller !== agent) return false
      if (etat && l.etat !== etat) return false
      if (npaiSeuls && l.npai !== 1) return false
      if (majSeules && !majFiche(l).length) return false
      if (!q) return true
      return [l.nom, l.prenom, l.commune, l.bien_commune, l.id_modelo]
        .some(x => String(x || '').toLowerCase().includes(q))
    })
  }, [lignes, agent, etat, recherche, npaiSeuls, majSeules])

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

  const corriger = (fiche) => setData(d => ({
    ...d,
    lignes: d.lignes.map(l => l.id_modelo === fiche.id_modelo
      ? { ...l, ...fiche, a_dispatcher: fiche.conseiller ? 0 : 1 }
      : l),
  }))

  const exporter = () => {
    if (!visibles.length) return toast.error('Rien à exporter')
    // L'export est ce qui remonte dans Modelo : tout ce que l'agent a recueilli
    // doit y être, y compris le NPAI — une adresse fausse se corrige à la
    // source, pas seulement dans cette application.
    const cols = ['id_modelo', 'conseiller', 'nom', 'prenom', 'commune', 'bien_type', 'bien_commune',
      'script', 'courrier_etat', 'npai', 'etat', 'appels', 'dernier_le', 'derniere_issue', 'dernier_par',
      'actualisation', 'date_rdv', 'soiree', 'panneau',
      'adresse_maj', 'code_postal_maj', 'commune_maj', 'statut_actuel',
      'toujours_proprietaire', 'revendu_quand', 'projet', 'projet_echeance',
      'recommandation_nom', 'recommandation_tel', 'recommandation_motif',
      'fiche_confirmee', 'fiche_maj_le', 'derniere_note']
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
          {!!nbNpai && (
            <Pastille actif={npaiSeuls} onClick={() => setNpaiSeuls(v => !v)}>
              Courrier revenu <span className="opacity-70">{nbNpai}</span>
            </Pastille>
          )}
          {!!nbMaj && (
            <Pastille actif={majSeules} onClick={() => setMajSeules(v => !v)}>
              Infos mises à jour <span className="opacity-70">{nbMaj}</span>
            </Pastille>
          )}
        </div>

        <div className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border/60">
          {!visibles.length && (
            <p className="text-sm text-quai-muted text-center py-8">Aucune fiche ne correspond.</p>
          )}
          {visibles.slice(0, 300).map(l => (
            <Ligne key={l.id_modelo} l={l}
              conseillers={data?.conseillers || []}
              onCorrige={corriger}
              onAppeler={onAppeler}
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

function Ligne({ l, ouverte, onBasculer, conseillers, onCorrige, onAppeler }) {
  const [edition, setEdition] = useState(false)
  const e = ETATS[l.etat] || ETATS.JAMAIS_APPELE
  const maj = majFiche(l)
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
              {l.npai === 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-quai-navy font-medium">
                  courrier revenu
                </span>
              )}
              {!!maj.length && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold/25 text-quai-navy
                                 font-medium">
                  {maj.length === 1 ? maj[0][1] : `${maj.length} infos à jour`}
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
          <Info label="Script" v={`${l.script} · ${l.npai === 1
            ? 'courrier revenu (NPAI)'
            : l.courrier_etat?.toLowerCase().replace(/_/g, ' ')}`} />
          <Info label="Bien" v={[l.bien_type, l.bien_commune].filter(Boolean).join(' · ')} />
          <Info label="Téléphone" v={l.tel_portable || l.tel_fixe} />
          <Info label="Mail" v={l.email} />
          {l.derniere_issue && (
            <Info label="Dernier appel"
              v={`${l.derniere_issue.toLowerCase().replace(/_/g, ' ')}${l.dernier_par ? ` — ${l.dernier_par}` : ''}`} />
          )}
          {l.rappel_le && <Info label="Rappel prévu" v={new Date(l.rappel_le).toLocaleString('fr-FR')} />}
          {l.actualisation && <Info label="Estimation" v={`${l.actualisation.toLowerCase()}${l.date_rdv ? ` — ${l.date_rdv}` : ''}`} />}
          {/* Ce que l'agent a rapporté de l'appel, regroupé : c'est ce bloc
              qu'on recopie dans Modelo. */}
          {!!maj.length && (
            <div className="bg-white border border-quai-gold/40 rounded-lg px-2.5 py-2 space-y-1">
              <div className="text-[11px] font-semibold text-quai-navy">
                Recueilli pendant l'appel
                {l.fiche_maj_le && (
                  <span className="font-normal text-quai-muted">
                    {' · '}{new Date(l.fiche_maj_le.replace(' ', 'T') + 'Z')
                      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              {l.adresse_maj && (
                <Info label="Nouvelle adresse"
                  v={[l.adresse_maj, l.code_postal_maj, l.commune_maj].filter(Boolean).join(' ')} />
              )}
              {!l.adresse_maj && l.commune_maj && <Info label="Nouvelle commune" v={l.commune_maj} />}
              {l.statut_actuel && <Info label="Situation" v={l.statut_actuel} />}
              {l.toujours_proprietaire != null && (
                <Info label="Toujours propriétaire"
                  v={l.toujours_proprietaire === 1 ? 'oui' : 'non'} />
              )}
              {l.revendu_quand && <Info label="Revendu" v={l.revendu_quand} />}
              {l.projet && (
                <Info label="Projet"
                  v={`${l.projet.toLowerCase()}${l.projet_echeance ? ` — ${l.projet_echeance} mois` : ''}`} />
              )}
              {l.recommandation_tel && (
                <Info label="Recommandation"
                  v={[l.recommandation_nom, l.recommandation_tel, l.recommandation_motif]
                    .filter(Boolean).join(' · ')} />
              )}
              {l.fiche_confirmee === 1 && !l.adresse_maj && (
                <div className="text-[11px] text-quai-muted">
                  Vérifié avec lui : rien n'avait changé.
                </div>
              )}
            </div>
          )}
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

          {edition
            ? <Correction l={l} conseillers={conseillers}
                onFini={(maj) => { setEdition(false); if (maj) onCorrige(maj) }} />
            : (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                {/* Ouvrir l'appel sans faire chercher le client dans sa liste :
                    c'est de ce listing qu'on repère une fiche à traiter tout
                    de suite. */}
                {onAppeler && (
                  <button onClick={() => onAppeler(l)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-quai-navy text-white
                               inline-flex items-center gap-1.5 hover:bg-quai-navy/90">
                    <Icon name="phone" size="sm" /> Ouvrir l'appel
                  </button>
                )}
                <button onClick={() => setEdition(true)}
                  className="text-[11px] text-quai-navy underline underline-offset-2 hover:text-quai-gold">
                  Corriger cette fiche
                </button>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// Corriger une fiche sans quitter le listing.
//
// Ce qu'on corrige ici, ce sont des coquilles de reprise : une fiche chez le
// mauvais conseiller, un conseiller précédent que l'import ignorait. Le script
// n'est pas recalculé automatiquement — il dépend du courrier reçu, pas de
// l'attribution — mais il reste modifiable à la main.
function Correction({ l, conseillers, onFini }) {
  const [f, setF] = useState({
    conseiller: l.conseiller || '',
    conseiller_precedent: l.conseiller_precedent || '',
    prenom_a_dire: l.prenom_a_dire || '',
    script: l.script || 1,
    point_attention: l.point_attention || '',
  })
  const [envoi, setEnvoi] = useState(false)
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const valider = async () => {
    setEnvoi(true)
    try {
      const r = await api.put(`/operation/contacts/${l.id_modelo}/attribution`, {
        ...f, script: Number(f.script),
      })
      toast.success('Fiche corrigée')
      onFini(r.data.apres)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Correction impossible')
      setEnvoi(false)
    }
  }

  return (
    <div className="mt-2 bg-white border border-quai-border rounded p-2.5 space-y-2">
      <Champ label="Conseiller">
        <select value={f.conseiller} onChange={maj('conseiller')} className={CLS}>
          <option value="">— à dispatcher —</option>
          {conseillers.map(c => <option key={c.nom} value={c.nom}>{c.nom}</option>)}
        </select>
      </Champ>

      <Champ label="Conseiller précédent">
        <input value={f.conseiller_precedent} onChange={maj('conseiller_precedent')}
          placeholder="celui que le client a connu" className={CLS} />
      </Champ>

      <Champ label="Prénom à dire">
        <input value={f.prenom_a_dire} onChange={maj('prenom_a_dire')}
          placeholder="déduit du conseiller précédent" className={CLS} />
      </Champ>

      <Champ label="Script">
        <select value={f.script} onChange={maj('script')} className={CLS}>
          {[1, 2, 3, 4].map(n => <option key={n} value={n}>Script {n}</option>)}
        </select>
      </Champ>

      <Champ label="Point d'attention">
        <textarea value={f.point_attention} onChange={maj('point_attention')} rows={2}
          placeholder="ce que l'agent doit savoir avant d'appeler" className={CLS} />
      </Champ>

      <div className="flex gap-2 pt-0.5">
        <button onClick={valider} disabled={envoi}
          className="text-xs px-3 py-1.5 rounded bg-quai-navy text-white disabled:opacity-50">
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={() => onFini(null)} disabled={envoi}
          className="text-xs px-3 py-1.5 rounded border border-quai-border text-quai-muted">
          Annuler
        </button>
      </div>
    </div>
  )
}

const CLS = 'w-full text-xs border border-quai-border rounded px-2 py-1.5 focus:outline-none focus:border-quai-gold'

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-quai-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
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
