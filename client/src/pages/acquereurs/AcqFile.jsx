import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

const AcqAppel = lazy(() => import('./AcqAppel'))

const GROUPES = { RAPPEL: 'Rappel convenu', DELEGUE: 'Délégué', VENDEUR: 'Aussi vendeur', NOUVEAU: 'Jamais appelé', RELANCE: 'À relancer' }
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
            <button key={c.id_contact} onClick={() => onChoisir(c.id_contact)} className="w-full text-left px-4 py-2.5 hover:bg-quai-light">
              <div className="text-sm text-quai-navy truncate">{c.civilite} {c.prenom} {c.nom}</div>
              <div className="text-[11px] text-quai-muted">
                {[c.commune, c.nb_fiches > 1 ? `${c.nb_fiches} recherches` : null,
                  c.appels ? `${c.dernier_canal === 'SMS' ? 'SMS envoyé' : c.dernier_canal === 'MAIL' ? 'mail envoyé' : (STATUT_LIB[c.statut] || ISSUE_LIB[c.derniere_issue] || 'appelé')} le ${jour(c.dernier_le)}` : 'jamais appelé',
                  c.exclu_libelle ? `hors file : ${c.exclu_libelle}` : null].filter(Boolean).join(' · ')}
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
            <button key={a.id} onClick={() => onChoisir(a.id_contact)} className="w-full text-left px-4 py-2.5 hover:bg-quai-light">
              <div className="text-sm text-quai-navy">{heure(a.horodatage)} · {a.civilite} {a.prenom} {a.nom}</div>
              <div className="text-[11px] text-quai-muted">{libelle(a)}{a.texte ? ` : « ${a.texte} »` : ''}</div>
            </button>
          ))}
        </div>
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
  // Ouvrir quelqu'un hors de l'ordre de la file (il rappelle, on le
  // retrouve) : l'appel en cours est mis de côté, son brouillon est gardé.
  const ouvrirHorsFile = (id) => {
    setFenetre(null); setRecherche('')
    if (ouvert && ouvert !== id) setPrecedent(ouvert)
    setHorsFile(true); setOuvert(id)
  }
  const outils = (
    <>
      {fenetre === 'contacts' && <MesContacts depart={recherche} onChoisir={ouvrirHorsFile} onFermer={() => { setFenetre(null); setRecherche('') }} />}
      {fenetre === 'effectues' && <Effectues onChoisir={ouvrirHorsFile} onFermer={() => setFenetre(null)} />}
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
        const prochain = r.data.file.find((c, i) => c.id_contact !== ouvert && i >= Math.max(0, idx - 1)) || r.data.file.find(c => c.id_contact !== ouvert)
        setOuvert(prochain ? prochain.id_contact : null)
      })
    }
    return (
      <Suspense fallback={<div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>}>
        <AcqAppel key={ouvert} id={ouvert} position={horsFile ? 'Hors de la file' : idx >= 0 ? `${idx + 1} / ${d.file.length}` : ''}
          horsFile={horsFile} onContacts={() => setFenetre('contacts')}
          revenir={precedent ? { libelle: 'Revenir à l’appel en cours', aller: () => { const p = precedent; setPrecedent(null); setHorsFile(false); setOuvert(p) } } : null}
          onSuivant={suivant} onRetour={() => { setOuvert(null); setHorsFile(false); setPrecedent(null); charger() }} />
        {outils}
      </Suspense>
    )
  }
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  if (d.erreur) return <p className="p-6 text-sm text-red-700">La file n’a pas pu être chargée. Réessayez.</p>
  const g = d.groupes
  return (
    <div className="p-3 max-w-3xl mx-auto">
      {outils}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[12rem]">
          <input value={recherche} onChange={e => { setRecherche(e.target.value); if (e.target.value.trim().length >= 2) setFenetre('contacts') }}
            placeholder="Un client rappelle ? Nom ou numéro…" className="input pl-9 min-h-[2.75rem]" />
          <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-quai-muted" />
        </div>
        <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setFenetre('effectues')}><Icon name="history" size="sm" /> Effectués</button>
        <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setFenetre('contacts')}><Icon name="users" size="sm" /> Mes contacts</button>
      </div>
      <div className={`rounded-xl p-3 mb-3 text-sm ${d.plage.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        {d.plage.ok ? 'Plage d’appel ouverte : 10h-13h et 14h-20h, du lundi au vendredi.' : d.plage.raison}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs mb-3">
        <span className="badge bg-quai-navy text-white">{d.file.length} à appeler</span>
        {g.rappels > 0 && <span className="badge bg-amber-100 text-amber-900">{g.rappels} rappel{g.rappels > 1 ? 's' : ''} convenu{g.rappels > 1 ? 's' : ''}</span>}
        <span className="badge bg-white border border-quai-border text-quai-muted">{g.nouveaux} jamais appelés</span>
        <span className="badge bg-white border border-quai-border text-quai-muted">{g.relances} à relancer</span>
        {g.en_attente > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.en_attente} sans réponse en attente{d.prochain_retour ? `, le premier revient le ${jj(d.prochain_retour)}` : ''}</span>}
        {g.rappels_a_venir > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.rappels_a_venir} rappels à venir</span>}
        {g.plafonnes > 0 && <span className="badge bg-white border border-quai-border text-quai-muted">{g.plafonnes} au plafond ce mois</span>}
      </div>
      {d.file.length === 0 ? (
        <div className="card text-center text-sm text-quai-muted">Personne à appeler pour l’instant.{d.prochain_retour ? ` Les sans-réponse reviennent à partir du ${jj(d.prochain_retour)}.` : ''}</div>
      ) : (
        <>
          <button className="btn-primary w-full mb-3 min-h-[3rem]" onClick={() => setOuvert(d.file[0].id_contact)}>
            <span className="inline-flex items-center gap-2"><Icon name="play" size="sm" /> Commencer par {d.file[0].prenom} {d.file[0].nom}</span>
          </button>
          <ul className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border">
            {d.file.map(c => (
              <li key={c.id_contact}>
                <button onClick={() => setOuvert(c.id_contact)} className="w-full text-left px-3 py-2.5 hover:bg-quai-light flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-quai-navy truncate">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
                    <div className="text-[11px] text-quai-muted truncate">
                      {GROUPES[c.groupe]}{c.groupe === 'RAPPEL' && c.rappel_le ? ` · ${new Date(c.rappel_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                      {' · '}{c.nb_fiches} recherche{c.nb_fiches > 1 ? 's' : ''}{c.commune ? ` · ${c.commune}` : ''}
                      {c.appels_ce_mois ? ` · ${c.appels_ce_mois} appel${c.appels_ce_mois > 1 ? 's' : ''} ce mois` : ''}
                    </div>
                    {c.appel_recent && <div className="text-[11px] text-amber-800">Appelé le {jj(c.appel_recent.le)} ({c.appel_recent.module})</div>}
                  </div>
                  <Icon name="chevron-right" size="sm" className="text-quai-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
