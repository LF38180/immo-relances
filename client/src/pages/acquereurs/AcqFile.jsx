import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'
import { Pastille, Initiales, Titre, StatutBadge } from './ui'

const AcqAppel = lazy(() => import('./AcqAppel'))

const jj = (s) => s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''

// La file de Madame Fichier : une ligne par personne, dans l'ordre du cahier.
const ISSUE_LIB = { JOINT: 'joint', REPONDEUR: 'répondeur', PAS_DE_REPONSE: 'pas de réponse', FAUX_NUMERO: 'faux numéro',
  A_RAPPELER: 'à rappeler', NE_PLUS_CONTACTER: 'ne plus contacter', ERREUR_IDENTITE: 'pas la bonne personne', DECEDE: 'décédé' }
const STATUT_LIB = { REQUALIFIE: 'requalifié', A_RAPPELER: 'à rappeler', EN_PAUSE: 'en pause', ABANDONNE: 'abandonné',
  DEJA_ACHETE: 'déjà acheté', SANS_REPONSE: 'sans réponse (4 essais)', NE_PLUS_CONTACTER: 'ne plus contacter',
  ERREUR_IDENTITE: 'pas la bonne personne', DECEDE: 'décédé', FAUX_NUMERO: 'faux numéro' }
const jour = (d) => d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
const heure = (d) => d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
const libelle = (c) => c.canal === 'SMS' ? 'SMS envoyé' : c.canal === 'MAIL' ? 'mail envoyé' : (STATUT_LIB[c.statut_final] || ISSUE_LIB[c.issue] || 'appelé')

// Tout mon portefeuille, avec une recherche : un client rappelle, on retrouve
// sa fiche en tapant son nom ou trois chiffres de son numéro — même au milieu
// d'un autre appel (comme « Mes contacts » de l'opération anciens clients).
export function MesContacts({ depart = '', onChoisir, onFermer }) {
  const [liste, setListe] = useState(null)
  const [q, setQ] = useState(depart)
  const [seulement, setSeulement] = useState('')
  useEffect(() => { api.get('/acquereurs/mes-contacts').then(r => setListe(r.data)).catch(() => setListe([])) }, [])
  useEffect(() => { const e = (ev) => { if (ev.key === 'Escape') onFermer() }; window.addEventListener('keydown', e); return () => window.removeEventListener('keydown', e) }, [onFermer])
  const motif = q.trim().toLowerCase(), chiffres = motif.replace(/\D/g, '')
  const visibles = (liste || []).filter(c => {
    if (seulement === 'appeles' && !c.appels) return false
    if (seulement === 'sms' && c.dernier_canal !== 'SMS') return false
    if (seulement === 'rappels' && c.statut !== 'A_RAPPELER') return false
    if (!motif) return true
    if (`${c.nom || ''} ${c.prenom || ''} ${c.nom || ''} ${c.commune || ''} ${c.email || ''}`.toLowerCase().includes(motif)) return true
    return chiffres.length >= 3 && `${c.tel_portable || ''} ${c.tel_fixe || ''}`.replace(/\D/g, '').includes(chiffres)
  })
  const puce = (a) => `text-xs px-2.5 py-1.5 rounded-full border ${a ? 'bg-quai-navy text-white border-quai-navy' : 'border-quai-border text-quai-muted'}`
  const n = (f) => (liste || []).filter(f).length
  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label="Mes contacts" onClick={e => e.stopPropagation()}
        className="bg-white w-full md:max-w-lg h-[90vh] md:h-[85vh] rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-quai-border">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-quai-navy text-sm">Mes contacts{liste ? ` (${liste.length})` : ''}</span>
            <button onClick={onFermer} aria-label="Fermer" className="text-quai-muted p-2 -mr-2"><Icon name="x" size="sm" /></button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Nom, commune, e-mail ou numéro…" className="input mt-2 min-h-[2.75rem]" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button onClick={() => setSeulement('')} className={puce(!seulement)}>Tous</button>
            <button onClick={() => setSeulement(seulement === 'appeles' ? '' : 'appeles')} className={puce(seulement === 'appeles')}>Déjà appelés {n(c => c.appels)}</button>
            <button onClick={() => setSeulement(seulement === 'rappels' ? '' : 'rappels')} className={puce(seulement === 'rappels')}>À rappeler {n(c => c.statut === 'A_RAPPELER')}</button>
            <button onClick={() => setSeulement(seulement === 'sms' ? '' : 'sms')} className={puce(seulement === 'sms')}>SMS envoyé {n(c => c.dernier_canal === 'SMS')}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-quai-border/60">
          {!liste && <p className="p-4 text-sm text-quai-muted">Chargement…</p>}
          {liste && !visibles.length && <p className="p-4 text-sm text-quai-muted">Aucun contact ne correspond.</p>}
          {visibles.slice(0, 200).map(c => (
            <button key={c.id_contact} onClick={() => onChoisir(c.id_contact)} className="w-full text-left px-4 py-2.5 hover:bg-quai-light flex items-center gap-3 transition-colors">
              <Initiales prenom={c.prenom} nom={c.nom} taille="sm" />
              <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="text-sm text-quai-navy font-medium truncate">{c.civilite} {c.prenom} {c.nom}</span><span className="ml-auto shrink-0"><StatutBadge statut={c.statut} /></span></div>
              <div className="text-[11px] text-quai-muted truncate">
                {[c.commune, c.nb_fiches > 1 ? `${c.nb_fiches} recherches` : null,
                  c.appels ? `${c.dernier_canal === 'SMS' ? 'SMS envoyé' : c.dernier_canal === 'MAIL' ? 'mail envoyé' : (STATUT_LIB[c.statut] || ISSUE_LIB[c.derniere_issue] || 'appelé')} le ${jour(c.dernier_le)}` : 'jamais appelé',
                  c.exclu_libelle ? `hors file : ${c.exclu_libelle}` : null].filter(Boolean).join(' · ')}
              </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Ce que j'ai fait aujourd'hui : rouvrir une fiche pour la compléter.
function Effectues({ onChoisir, onFermer }) {
  const [l, setL] = useState(null)
  useEffect(() => { api.get('/acquereurs/effectues').then(r => setL(r.data)).catch(() => setL([])) }, [])
  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label="Effectués aujourd'hui" onClick={e => e.stopPropagation()}
        className="bg-white w-full md:max-w-lg max-h-[85vh] rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-quai-border flex items-center justify-between">
          <span className="font-semibold text-quai-navy text-sm">Effectués aujourd’hui{l ? ` (${l.length})` : ''}</span>
          <button onClick={onFermer} aria-label="Fermer" className="text-quai-muted p-2 -mr-2"><Icon name="x" size="sm" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-quai-border/60">
          {!l && <p className="p-4 text-sm text-quai-muted">Chargement…</p>}
          {l && !l.length && <p className="p-4 text-sm text-quai-muted">Aucun appel aujourd’hui.</p>}
          {(l || []).map(a => (
            <button key={a.id} onClick={() => onChoisir(a.id_contact)} className="w-full text-left px-4 py-2.5 hover:bg-quai-light flex items-center gap-3 transition-colors">
              <span className="text-xs font-semibold text-quai-navy bg-quai-light border border-quai-border rounded-lg px-2 py-1 shrink-0 tabular-nums">{heure(a.horodatage)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-quai-navy font-medium truncate">{a.civilite} {a.prenom} {a.nom}</span>
                <span className="block text-[11px] text-quai-muted truncate">{libelle(a)}{a.texte ? ` : « ${a.texte} »` : ''}</span>
              </span>
              {a.statut_final && <StatutBadge statut={a.statut_final} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// La barre du haut, toujours là, comme dans l'opération anciens clients : où
// j'en suis, « À faire », « Effectués », « Mes contacts », et la recherche
// « Il vous rappelle ? » qui ouvre la fiche sans perdre l'appel en cours.
function Barre({ index, total, horsFile, faits, plage, contacts, onOuvrir, onAFaire, onEffectues, onContacts }) {
  const [q, setQ] = useState('')
  // Pendant un appel, sur téléphone, la recherche se replie derrière une
  // loupe : la barre prenait un tiers de l'écran. Sur ordinateur, elle reste
  // toujours ouverte.
  const enAppel = index != null || horsFile
  const [loupe, setLoupe] = useState(false)
  const motif = q.trim().toLowerCase(), chiffres = motif.replace(/\D/g, '')
  const res = motif.length < 2 ? [] : (contacts || []).filter(c =>
    `${c.nom || ''} ${c.prenom || ''} ${c.nom || ''} ${c.email || ''}`.toLowerCase().includes(motif)
    || (chiffres.length >= 3 && `${c.tel_portable || ''} ${c.tel_fixe || ''}`.replace(/\D/g, '').includes(chiffres))).slice(0, 8)
  const pct = total ? Math.round(((index ?? 0) / total) * 100) : 0
  const pastille = 'inline-flex items-center gap-1 px-2 py-1 rounded-full border border-quai-border text-quai-navy hover:border-quai-gold bg-white'
  return (
    <div className="bg-white border-b border-quai-border py-2 sticky top-0 z-20">
      <div className="max-w-3xl mx-auto px-3">
        <div className="flex items-center justify-between gap-2 text-xs mb-1.5 flex-wrap">
          <span className="text-quai-muted">{horsFile ? <span className="text-quai-gold font-medium">Fiche ouverte hors de la file</span>
            : index != null ? <>Fiche <b className="text-quai-navy">{index + 1}</b> / {total}</> : <>{total} à appeler</>}</span>
          <div className="flex items-center gap-2 text-[11px]">
            <button onClick={onAFaire} className={pastille}><Icon name="table" size="sm" /> À faire <b>{total}</b></button>
            <button onClick={onEffectues} className={pastille}><Icon name="history" size="sm" /> Effectués <b>{faits}</b></button>
            <button onClick={onContacts} className={pastille}><Icon name="users" size="sm" /> <span className={enAppel ? 'hidden sm:inline' : ''}>Mes contacts</span></button>
            {enAppel && <button onClick={() => setLoupe(l => !l)} aria-label="Rechercher quelqu’un qui rappelle" className={`${pastille} md:hidden`}><Icon name="search" size="sm" /></button>}
          </div>
        </div>
        <div className="h-1.5 bg-quai-border rounded-full overflow-hidden"><div className="h-full bg-quai-gold rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        <div className={`relative mt-2 ${enAppel && !loupe ? 'hidden md:block' : ''}`}>
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted pointer-events-none"><Icon name="search" size="sm" /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Il vous rappelle ? Nom ou numéro…" className="input pl-8 min-h-[2.75rem] md:min-h-0" />
          {res.length > 0 && (
            <ul className="absolute z-[1100] left-0 right-0 mt-1 bg-white border border-quai-border rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {res.map(c => (
                <li key={c.id_contact}><button onClick={() => { setQ(''); setLoupe(false); onOuvrir(c.id_contact) }} className="w-full text-left px-3 py-2.5 hover:bg-quai-light">
                  <div className="text-sm text-quai-navy truncate">{c.civilite} {c.prenom} {c.nom}</div>
                  <div className="text-[11px] text-quai-muted">{[c.tel_portable || c.tel_fixe, c.commune, c.exclu_libelle ? `hors file : ${c.exclu_libelle}` : null].filter(Boolean).join(' · ')}</div>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        {plage && !plage.ok && <div className="text-[11px] text-amber-800 mt-1.5"><Icon name="alert-triangle" size="sm" className="inline mr-0.5" />{plage.raison}</div>}
      </div>
    </div>
  )
}

export default function AcqFile() {
  const [d, setD] = useState(null)
  const [ouvert, setOuvert] = useState(null)   // id_contact en cours
  const [horsFile, setHorsFile] = useState(false)
  const [precedent, setPrecedent] = useState(null)   // l'appel interrompu pour un client qui rappelle
  const [fenetre, setFenetre] = useState(null)       // 'contacts' | 'effectues'
  const [recherche, setRecherche] = useState('')
  const [contacts, setContacts] = useState(null)   // pour la recherche de la barre
  const [faits, setFaits] = useState(0)
  const rafraichirBarre = useCallback(() => {
    api.get('/acquereurs/mes-contacts').then(r => setContacts(r.data)).catch(() => {})
    api.get('/acquereurs/effectues').then(r => setFaits(r.data.length)).catch(() => {})
  }, [])
  useEffect(() => { rafraichirBarre() }, [rafraichirBarre, ouvert])
  // Ouvrir quelqu'un hors de l'ordre de la file (il rappelle, on le
  // retrouve) : l'appel en cours est mis de côté, son brouillon est gardé.
  // `rappelEntrant` : la fiche a été trouvée par « Il vous rappelle ? » — c'est
  // donc la personne qui appelle. Depuis « Mes contacts » ou « Effectués », non.
  const [entrant, setEntrant] = useState(false)
  const ouvrirHorsFile = (id, rappelEntrant = false) => {
    setFenetre(null); setRecherche('')
    if (ouvert && ouvert !== id) setPrecedent(ouvert)
    setEntrant(rappelEntrant === true); setHorsFile(true); setOuvert(id)
  }
  const outils = (
    <>
      {fenetre === 'contacts' && <MesContacts depart={recherche} onChoisir={(id) => ouvrirHorsFile(id)} onFermer={() => { setFenetre(null); setRecherche('') }} />}
      {fenetre === 'effectues' && <Effectues onChoisir={(id) => ouvrirHorsFile(id)} onFermer={() => setFenetre(null)} />}
    </>
  )
  const charger = useCallback(() => api.get('/acquereurs/file').then(r => setD(r.data)).catch(() => setD({ erreur: true })), [])
  useEffect(() => { charger() }, [charger])

  if (ouvert) {
    const idx = d?.file?.findIndex(c => c.id_contact === ouvert) ?? -1
    const suivant = () => {
      // Une fiche ouverte hors file : on revient là où on en était.
      if (horsFile) {
        setHorsFile(false)
        if (precedent) { const p = precedent; setPrecedent(null); setOuvert(p); return }
        setOuvert(null); charger(); return
      }
      api.get('/acquereurs/file').then(r => {
        setD(r.data)
        // Le suivant de la liste mise à jour : celui qu'on vient de traiter en est sorti.
        // La fiche traitée a quitté la file : la suivante a pris sa place, au
        // même rang. (Avant : « rang − 1 », on rouvrait la fiche d'avant.)
        const reste = r.data.file.filter(c => c.id_contact !== ouvert)
        const prochain = reste[Math.max(idx, 0)] || reste[0]
        setOuvert(prochain ? prochain.id_contact : null)
      })
    }
    return (
      <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
        <Barre index={horsFile || idx < 0 ? null : idx} total={d?.file?.length || 0} horsFile={horsFile} faits={faits} plage={d?.plage}
          contacts={contacts} onOuvrir={(id) => ouvrirHorsFile(id, true)} onAFaire={() => { setOuvert(null); setHorsFile(false); setPrecedent(null); charger() }}
          onEffectues={() => setFenetre('effectues')} onContacts={() => setFenetre('contacts')} />
        <AcqAppel key={ouvert} id={ouvert} position={horsFile ? 'Hors de la file' : idx >= 0 ? `${idx + 1} / ${d.file.length}` : ''}
          horsFile={horsFile} entrantInitial={horsFile && entrant}
          revenir={precedent ? { libelle: 'Revenir à l’appel en cours', aller: () => { const p = precedent; setPrecedent(null); setHorsFile(false); setOuvert(p) } } : null}
          onSuivant={suivant} onRetour={() => { setOuvert(null); setHorsFile(false); setPrecedent(null); charger() }} />
        {outils}
      </Suspense>
    )
  }
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  if (d.erreur) return <p className="p-6 text-sm text-red-700">La file n’a pas pu être chargée. Réessayez.</p>
  const g = d.groupes
  // La file, rangée par raison d'appeler : on voit d'un coup d'œil ce qui
  // presse (un rappel convenu) et ce qui peut attendre.
  const SECTIONS = [['RAPPEL', 'Rappels convenus', 'ambre'], ['DELEGUE', 'Délégués par un conseiller', 'or'], ['VENDEUR', 'Aussi vendeurs', 'or'],
    ['NOUVEAU', 'Jamais appelés', 'neutre'], ['RELANCE', 'À relancer', 'neutre']]
    .map(([k, l, ton]) => ({ k, l, ton, lignes: d.file.filter(c => c.groupe === k) })).filter(x => x.lignes.length)
  const premier = d.file[0]
  return (
    <>
    <Barre index={null} total={d.file.length} faits={faits} plage={null} contacts={contacts} onOuvrir={(id) => ouvrirHorsFile(id, true)}
      onAFaire={() => {}} onEffectues={() => setFenetre('effectues')} onContacts={() => setFenetre('contacts')} />
    <div className="p-3 max-w-3xl mx-auto pb-8">
      {outils}
      <div className={`rounded-xl px-3 py-2.5 mb-3 text-sm flex items-center gap-2 ${d.plage.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        <Icon name={d.plage.ok ? 'phone-call' : 'phone-off'} size="sm" className="shrink-0" />
        <span>{d.plage.ok ? 'Plage d’appel ouverte : 10h-13h et 14h-20h, du lundi au vendredi.' : d.plage.raison}</span>
      </div>

      {d.file.length === 0 ? (
        <div className="bg-white border border-quai-border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 grid place-items-center mx-auto mb-3"><Icon name="check-circle-2" size="md" className="text-emerald-700" /></div>
          <div className="font-display font-semibold text-quai-navy text-lg">Personne à appeler pour l’instant</div>
          {d.prochain_retour && <p className="text-sm text-quai-muted mt-1">Les sans-réponse reviennent à partir du {jj(d.prochain_retour)}.</p>}
        </div>
      ) : (
        <button onClick={() => setOuvert(premier.id_contact)}
          className="w-full mb-4 rounded-2xl bg-quai-navy text-white p-4 flex items-center gap-3 text-left hover:bg-quai-navymd transition-colors">
          <span className="w-11 h-11 rounded-full bg-quai-gold grid place-items-center shrink-0"><Icon name="play" size="md" className="text-quai-navy" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-quai-gold uppercase tracking-wider">Commencer</span>
            <span className="block font-display font-semibold text-lg leading-tight truncate">{premier.civilite ? premier.civilite + ' ' : ''}{premier.prenom} {premier.nom}</span>
          </span>
          <span className="text-right shrink-0"><span className="block font-display text-2xl font-semibold text-quai-gold leading-none">{d.file.length}</span><span className="block text-[11px] text-white/60">à appeler</span></span>
        </button>
      )}

      {(g.en_attente > 0 || g.rappels_a_venir > 0 || g.plafonnes > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {g.en_attente > 0 && <Pastille>{g.en_attente} sans réponse en attente{d.prochain_retour ? `, le premier revient le ${jj(d.prochain_retour)}` : ''}</Pastille>}
          {g.rappels_a_venir > 0 && <Pastille>{g.rappels_a_venir} rappel{g.rappels_a_venir > 1 ? 's' : ''} à venir</Pastille>}
          {g.plafonnes > 0 && <Pastille>{g.plafonnes} au plafond ce mois</Pastille>}
        </div>
      )}

      {SECTIONS.map(sec => (
        <section key={sec.k} className="mb-4">
          <div className="flex items-center gap-2 mb-1.5"><Titre>{sec.l}</Titre><span className="-mt-2"><Pastille ton={sec.ton}>{sec.lignes.length}</Pastille></span></div>
          <ul className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border overflow-hidden">
            {sec.lignes.map(c => (
              <li key={c.id_contact}>
                <button onClick={() => setOuvert(c.id_contact)} className="w-full text-left px-3 py-2.5 hover:bg-quai-light flex items-center gap-3 transition-colors">
                  <Initiales prenom={c.prenom} nom={c.nom} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-quai-navy truncate">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
                    <div className="text-[11px] text-quai-muted truncate">
                      {[c.groupe === 'RAPPEL' && c.rappel_le ? `rappel à ${new Date(c.rappel_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : null,
                        `${c.nb_fiches} recherche${c.nb_fiches > 1 ? 's' : ''}`, c.commune,
                        c.appels_ce_mois ? `${c.appels_ce_mois} appel${c.appels_ce_mois > 1 ? 's' : ''} ce mois` : null].filter(Boolean).join(' · ')}
                    </div>
                    {c.appel_recent && <div className="text-[11px] text-amber-800 mt-0.5">Appelé le {jj(c.appel_recent.le)} ({c.appel_recent.module})</div>}
                  </div>
                  <Icon name="chevron-right" size="sm" className="text-quai-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
    </>
  )
}
