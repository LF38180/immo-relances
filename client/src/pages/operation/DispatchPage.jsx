import { useState, useEffect, useMemo } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// Répartition des fiches orphelines — portefeuilles des conseillers partis,
// garées au nom de Loïck. Tant qu'elles ne sont pas attribuées, elles ne sont
// dans la file d'appel de personne.
//
// On attribue par paquets, jamais ligne par ligne : les 48 fiches de Charlotte
// Soler se suivent, celles de Karine Cazaré aussi. C'est la sélection multiple
// qui fait gagner l'heure.

const LIBELLES_BASE = {
  ANCIEN_CONSEILLER: 'Ancien conseiller toujours en poste',
  SECTEUR_COMMUNE: 'Secteur — commune',
  SECTEUR_CODE_POSTAL: 'Secteur — code postal',
  ANOMALIE_CINDY: 'Anomalie Cindy Bertrand',
  AUCUNE: 'Aucune suggestion',
}

export default function DispatchPage() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [selection, setSelection] = useState(new Set())
  const [destinataire, setDestinataire] = useState('')
  const [filtre, setFiltre] = useState('')
  const [recherche, setRecherche] = useState('')
  // Trois façons de découper un lot de 340 fiches : par qui les suivait, par
  // où se trouve le bien, par ce que c'est. On attribue rarement « au hasard » :
  // on donne un ancien portefeuille, un secteur, ou un type de bien.
  const [ancien, setAncien] = useState('')
  const [commune, setCommune] = useState('')
  const [typeBien, setTypeBien] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const charger = () => api.get('/operation/dispatch')
    .then(r => setData(r.data))
    .catch(() => { setErreur(true); toast.error('Chargement impossible') })

  useEffect(() => { charger() }, [])

  const lignes = data?.lignes || []

  // Les bases de suggestion présentes, avec leur effectif : c'est par là qu'on
  // attaque, un paquet à la fois.
  const bases = useMemo(() => {
    const m = new Map()
    lignes.forEach(l => {
      const b = l.suggestion_base || 'AUCUNE'
      m.set(b, (m.get(b) || 0) + 1)
    })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lignes])

  // On ne propose que des valeurs qui existent, avec leur effectif : un filtre
  // qui ne renvoie rien fait douter de l'outil.
  const listeDe = (champ) => {
    const m = new Map()
    lignes.forEach(l => { const v = l[champ]; if (v) m.set(v, (m.get(v) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
  }
  const anciens = useMemo(() => listeDe('conseiller_precedent'), [lignes])
  const communes = useMemo(() => listeDe('bien_commune'), [lignes])
  const types = useMemo(() => listeDe('bien_type'), [lignes])

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(l => {
      if (filtre && (l.suggestion_base || 'AUCUNE') !== filtre) return false
      if (ancien && l.conseiller_precedent !== ancien) return false
      if (commune && l.bien_commune !== commune) return false
      if (typeBien && l.bien_type !== typeBien) return false
      if (!q) return true
      return [l.nom, l.prenom, l.commune, l.conseiller_precedent, l.suggestion_conseiller]
        .some(x => (x || '').toLowerCase().includes(q))
    })
  }, [lignes, filtre, recherche, ancien, commune, typeBien])

  const basculer = (id) => setSelection(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const toutSelectionner = () => setSelection(s =>
    visibles.every(l => s.has(l.id_modelo))
      ? new Set()
      : new Set(visibles.map(l => l.id_modelo)))

  // Attribue à chacun ce que la suggestion propose, en une fois. C'est le
  // raccourci quand on valide un paquet entier.
  const suivreLesSuggestions = async () => {
    const parConseiller = {}
    visibles.filter(l => selection.has(l.id_modelo) && l.suggestion_conseiller)
      .forEach(l => { (parConseiller[l.suggestion_conseiller] ||= []).push(l.id_modelo) })

    const noms = Object.keys(parConseiller)
    if (!noms.length) return toast.error('Aucune des fiches sélectionnées n’a de suggestion')

    setEnvoi(true)
    try {
      let total = 0
      for (const nom of noms) {
        const { data: r } = await api.post('/operation/dispatch', { ids: parConseiller[nom], conseiller: nom })
        total += r.attribuees
      }
      toast.success(`${total} fiche${total > 1 ? 's' : ''} attribuée${total > 1 ? 's' : ''}`)
      setSelection(new Set())
      await charger()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Attribution impossible')
    } finally { setEnvoi(false) }
  }

  const attribuer = async () => {
    if (!destinataire) return toast.error('Choisissez un conseiller')
    setEnvoi(true)
    try {
      const { data: r } = await api.post('/operation/dispatch',
        { ids: [...selection], conseiller: destinataire })
      toast.success(`${r.attribuees} fiche${r.attribuees > 1 ? 's' : ''} attribuée${r.attribuees > 1 ? 's' : ''} à ${destinataire}`)
      setSelection(new Set())
      setDestinataire('')
      await charger()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Attribution impossible')
    } finally { setEnvoi(false) }
  }

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger les fiches à répartir.</p>
  if (!data) return <p className="p-6 text-quai-muted">Chargement…</p>

  if (!lignes.length) return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <AVerifier />
        <div className="p-8 text-center">
          <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-3" />
          <p className="font-medium text-quai-navy">Toutes les fiches sont attribuées.</p>
          <p className="text-sm text-quai-muted mt-1">Plus rien à répartir.</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">

        {/* Les fiches à identité incertaine, avant la répartition : les deux
            sont des décisions à prendre avant qu'un agent ne décroche. */}
        <AVerifier />

        <div>
          <h1 className="font-display text-xl font-bold text-quai-navy">Répartir les fiches</h1>
          <p className="text-sm text-quai-muted mt-0.5">
            <b className="text-quai-navy">{data.a_dispatcher}</b> fiche{data.a_dispatcher > 1 ? 's' : ''} sans conseiller.
            Elles ne sont dans la file d’appel de personne tant qu’elles ne sont pas attribuées.
          </p>
        </div>

        <ChargeParConseiller compteur={data.compteur} />

        {/* Les paquets : on attaque par là plutôt que fiche par fiche. */}
        <div className="flex flex-wrap gap-1.5">
          <Pastille actif={!filtre} onClick={() => setFiltre('')}>
            Toutes <span className="opacity-70">{lignes.length}</span>
          </Pastille>
          {bases.map(([b, n]) => (
            <Pastille key={b} actif={filtre === b} onClick={() => setFiltre(filtre === b ? '' : b)}>
              {LIBELLES_BASE[b] || b} <span className="opacity-70">{n}</span>
            </Pastille>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted pointer-events-none">
              <Icon name="search" size="sm" />
            </span>
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Nom, commune, ancien conseiller…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-quai-border bg-white
                         focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
          </div>
          <button onClick={toutSelectionner}
            className="text-xs px-3 py-2 rounded-lg border border-quai-border text-quai-muted hover:border-quai-gold hover:text-quai-navy">
            {visibles.every(l => selection.has(l.id_modelo)) && visibles.length
              ? 'Tout décocher' : `Tout cocher (${visibles.length})`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Selecteur label="Ancien conseiller" valeur={ancien} onChange={setAncien} options={anciens} />
          <Selecteur label="Commune du bien" valeur={commune} onChange={setCommune} options={communes} />
          <Selecteur label="Type de bien" valeur={typeBien} onChange={setTypeBien} options={types} />
          {(ancien || commune || typeBien) && (
            <button onClick={() => { setAncien(''); setCommune(''); setTypeBien('') }}
              className="text-xs text-quai-muted hover:text-quai-navy underline">
              Tout afficher
            </button>
          )}
          <span className="text-[11px] text-quai-muted ml-auto">
            {visibles.length} sur {lignes.length}
          </span>
        </div>

        <ListeFiches lignes={visibles} selection={selection} onBasculer={basculer} />
      </div>

      {/* Barre d'action : n'apparaît qu'une fois quelque chose de sélectionné. */}
      {selection.size > 0 && (
        <BarreAttribution
          nb={selection.size}
          conseillers={data.compteur.map(c => c.nom)}
          destinataire={destinataire}
          setDestinataire={setDestinataire}
          envoi={envoi}
          onAttribuer={attribuer}
          onSuivreSuggestions={suivreLesSuggestions}
          onAnnuler={() => setSelection(new Set())}
        />
      )}
    </div>
  )
}

// Un sélecteur qui affiche l'effectif de chaque valeur : on voit tout de suite
// où sont les gros paquets.
function Selecteur({ label, valeur, onChange, options }) {
  if (!options.length) return null
  return (
    <select value={valeur} onChange={e => onChange(e.target.value)} aria-label={label}
      className={`text-xs px-2.5 py-2 rounded-lg border bg-white min-h-[2.75rem] md:min-h-0
                  focus:outline-none focus:ring-2 focus:ring-quai-navy/30 ${
        valeur ? 'border-quai-gold text-quai-navy font-medium' : 'border-quai-border text-quai-muted'}`}>
      <option value="">{label}</option>
      {options.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
    </select>
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

// Le compteur du contrat : ce que chacun a, ce qu'il recevrait si on suivait
// toutes les suggestions. La colonne de droite existe pour montrer que la règle
// géographique n'arbitre pas la charge — Tara couvre Grenoble, où se
// concentrent les orphelins, et passerait de 149 à 258.
function ChargeParConseiller({ compteur }) {
  const [ouvert, setOuvert] = useState(false)
  const max = Math.max(...compteur.map(c => c.total_si_suivi), 1)

  return (
    <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
      <button onClick={() => setOuvert(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-quai-light transition-colors">
        <span className="text-sm font-semibold text-quai-navy">Charge par conseiller</span>
        <Icon name={ouvert ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted" />
      </button>

      {ouvert && (
        <div className="px-4 pb-4">
          <p className="text-[11px] text-quai-muted mb-3 leading-snug">
            La suggestion s’appuie sur la commune. Elle indique, elle n’arbitre pas la charge :
            suivie à la lettre, elle donnerait tout Grenoble au même conseiller.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-quai-muted text-left">
                <th className="font-medium pb-1.5">Conseiller</th>
                <th className="font-medium pb-1.5 text-right w-16">A déjà</th>
                <th className="font-medium pb-1.5 text-right w-16">Suggéré</th>
                <th className="font-medium pb-1.5 text-right w-16">Total</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {compteur.map(c => (
                <tr key={c.nom} className="border-t border-quai-border/50">
                  <td className="py-1.5 text-quai-navy">{c.nom}</td>
                  <td className="py-1.5 text-right tabular-nums text-quai-muted">{c.actuel}</td>
                  <td className={`py-1.5 text-right tabular-nums ${c.suggere > 50 ? 'text-amber-700 font-semibold' : 'text-quai-muted'}`}>
                    {c.suggere || '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-quai-navy">{c.total_si_suivi}</td>
                  <td className="py-1.5 pl-2">
                    <div className="h-1.5 bg-quai-light rounded-full overflow-hidden">
                      <div className="h-full bg-quai-gold rounded-full"
                        style={{ width: `${(c.total_si_suivi / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ListeFiches({ lignes, selection, onBasculer }) {
  if (!lignes.length) return (
    <p className="text-sm text-quai-muted py-6 text-center">Aucune fiche ne correspond.</p>
  )

  return (
    <div className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border/60">
      {lignes.map(l => {
        const coche = selection.has(l.id_modelo)
        return (
          <label key={l.id_modelo}
            className={`flex gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
              coche ? 'bg-quai-gold/10' : 'hover:bg-quai-light'}`}>
            <input type="checkbox" checked={coche} onChange={() => onBasculer(l.id_modelo)}
              className="mt-1 shrink-0 accent-quai-navy w-4 h-4" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-quai-navy text-sm">
                  {l.nom} {l.prenom}
                </span>
                <span className="text-[11px] text-quai-muted">
                  {[l.bien_type, l.bien_commune].filter(Boolean).join(' · ') || l.commune}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-light text-quai-muted">
                  script {l.script}
                </span>
              </div>

              {l.situation && (
                <div className="text-[11px] text-quai-muted mt-0.5 leading-snug">{l.situation}</div>
              )}

              {/* Les fiches qui demandent un arbitrage le disent en évidence. */}
              {l.point_attention && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 leading-snug">
                  {l.point_attention}
                </div>
              )}

              {l.suggestion_conseiller && (
                <div className="text-[11px] text-quai-navy mt-0.5">
                  <Icon name="arrow-right" size="sm" className="inline text-quai-gold" />{' '}
                  {l.suggestion_conseiller}
                  <span className="text-quai-muted">
                    {' · '}{LIBELLES_BASE[l.suggestion_base] || l.suggestion_base}
                  </span>
                </div>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}

function BarreAttribution({ nb, conseillers, destinataire, setDestinataire, envoi, onAttribuer, onSuivreSuggestions, onAnnuler }) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-quai-border shadow-lg">
      <div className="max-w-6xl mx-auto p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-quai-navy mr-auto">
          {nb} fiche{nb > 1 ? 's' : ''} sélectionnée{nb > 1 ? 's' : ''}
        </span>

        <button onClick={onSuivreSuggestions} disabled={envoi}
          className="text-xs px-3 py-2 rounded-lg border border-quai-border text-quai-navy
                     hover:border-quai-gold disabled:opacity-50 min-h-[2.5rem]">
          Suivre les suggestions
        </button>

        <select value={destinataire} onChange={e => setDestinataire(e.target.value)}
          className="text-sm px-2 py-2 rounded-lg border border-quai-border bg-white text-quai-navy
                     min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30">
          <option value="">Attribuer à…</option>
          {conseillers.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <button onClick={onAttribuer} disabled={envoi || !destinataire}
          className="btn-primary btn-sm min-h-[2.75rem] md:min-h-0 disabled:opacity-50">
          {envoi ? 'En cours…' : 'Attribuer'}
        </button>

        <button onClick={onAnnuler} className="text-xs text-quai-muted hover:text-quai-navy px-2">
          Annuler
        </button>
      </div>
    </div>
  )
}

// Les fiches dont on n'est pas certain qu'elles aient vendu chez nous.
//
// Appariées sur un seul mot du nom, ou sans correspondance au registre des
// ventes. Elles sont hors de toute file tant qu'un manager n'a pas tranché —
// et les routes pour le faire existaient sans écran : trente-quatre clients
// que personne ne pouvait débloquer, invisibles. Le nom tel qu'il figure au
// registre est ce qui permet de trancher à l'œil, sans appeler.
function AVerifier() {
  const [data, setData] = useState(null)
  const [enCours, setEnCours] = useState(null)
  const [ouvert, setOuvert] = useState(true)
  const [voirTranchees, setVoirTranchees] = useState(false)

  useEffect(() => {
    api.get('/operation/a-verifier').then(r => setData(r.data)).catch(() => setData({ lignes: [], restantes: 0 }))
  }, [])

  const trancher = async (l, verdict) => {
    if (verdict === 'ECARTE' && !window.confirm(
      `Écarter ${l.prenom} ${l.nom} ?\n\nLa fiche ne sera appelée par personne, et une opposition sera posée. ` +
      `À réserver aux cas où ce n'est vraiment pas la bonne personne.`)) return
    setEnCours(l.id_modelo)
    try {
      await api.post(`/operation/contacts/${l.id_modelo}/verifier`, { verdict })
      setData(d => {
        const lignes = d.lignes.map(x => x.id_modelo === l.id_modelo ? { ...x, verifie: verdict } : x)
        return { lignes, restantes: lignes.filter(x => !x.verifie).length }
      })
      toast.success(verdict === 'CONFIRME'
        ? `${l.nom} : confirmée, elle entre dans la file de ${l.conseiller || 'son conseiller'}`
        : `${l.nom} : écartée, elle ne sera pas appelée`)
    } catch (e) { toast.error(e.messageLisible || 'Échec') }
    finally { setEnCours(null) }
  }

  if (!data || !data.lignes.length) return null
  const aTrancher = data.lignes.filter(l => !l.verifie)
  const tranchees = data.lignes.filter(l => l.verifie)

  return (
    <div className={`rounded-xl border ${data.restantes ? 'border-amber-300 bg-amber-50' : 'border-quai-border bg-white'}`}>
      <button onClick={() => setOuvert(v => !v)} className="w-full p-3 flex items-center gap-3 text-left">
        <Icon name={data.restantes ? 'alert-triangle' : 'check-circle-2'} size="md"
          className={`shrink-0 ${data.restantes ? 'text-amber-700' : 'text-emerald-600'}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-quai-navy">
            {data.restantes
              ? `${data.restantes} fiche${data.restantes > 1 ? 's' : ''} à vérifier avant d'appeler`
              : 'Toutes les fiches douteuses ont été tranchées'}
          </div>
          <div className="text-[11px] text-quai-muted leading-snug">
            On n'est pas sûr que ces personnes aient vendu chez nous. Tant que ce n'est pas tranché, elles
            ne sont dans la file de personne.
          </div>
        </div>
        <Icon name={ouvert ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted shrink-0" />
      </button>

      {ouvert && (
        <div className="border-t border-amber-200/60 divide-y divide-quai-border/60">
          {aTrancher.map(l => (
            <div key={l.id_modelo} className="p-3 bg-white/70">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-quai-navy">{l.civilite} {l.prenom} {l.nom}</span>
                <span className="text-[11px] text-quai-muted">{l.commune}{l.conseiller && ` · ${l.conseiller}`}</span>
              </div>
              {l.bien_concerne && <div className="text-[12px] text-quai-text mt-0.5">{l.bien_concerne}</div>}
              <div className="text-[12px] mt-1">
                <span className="text-quai-muted">Au registre des ventes : </span>
                <b className="text-quai-navy">{l.partie_au_registre || 'aucune correspondance'}</b>
              </div>
              {l.courrier_motif && <div className="text-[11px] text-quai-muted mt-0.5 italic">{l.courrier_motif}</div>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => trancher(l, 'CONFIRME')} disabled={enCours === l.id_modelo}
                  className="text-xs px-3 py-2 rounded-lg bg-quai-navy text-white min-h-[2.75rem] disabled:opacity-40">
                  C'est bien cette personne
                </button>
                <button onClick={() => trancher(l, 'ECARTE')} disabled={enCours === l.id_modelo}
                  className="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-700 bg-white min-h-[2.75rem] disabled:opacity-40">
                  Ce n'est pas elle — écarter
                </button>
              </div>
            </div>
          ))}
          {tranchees.length > 0 && (
            <div className="p-2">
              <button onClick={() => setVoirTranchees(v => !v)} className="text-[11px] text-quai-muted underline underline-offset-2">
                {voirTranchees ? 'Masquer' : 'Voir'} les {tranchees.length} déjà tranchée{tranchees.length > 1 ? 's' : ''}
              </button>
              {voirTranchees && (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-quai-muted">
                  {tranchees.map(l => (
                    <li key={l.id_modelo}>
                      {l.prenom} {l.nom} — <b className={l.verifie === 'CONFIRME' ? 'text-emerald-700' : 'text-red-700'}>
                        {l.verifie === 'CONFIRME' ? 'confirmée' : 'écartée'}</b>{l.verifie_par && ` par ${l.verifie_par}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
