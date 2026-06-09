import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { STATUTS_RELANCE } from '../utils/constants'
import { CategorieBadge, ScoreBadge, PotentielStars, CadenceBadge } from '../components/ContactBadge'
import { parseJalons } from '../utils/cadence'
import Icon from '../components/ui/Icon'
import { format } from 'date-fns'
import PhotoCarousel from '../components/PhotoCarousel'
import { genererRecapPdf } from '../utils/recap-pdf'
import { useAuth } from '../hooks/useAuth'
import ContactModal from '../components/ContactModal'

const SHORTCUT_MAP = {
  '1': 'tente_sans_reponse',
  '2': 'message_laisse',
  '3': 'contacte',
  '4': 'rdv_obtenu',
  '5': 'pas_interesse',
  '6': 'rappel_planifie',
  '7': 'mandat_obtenu',
}

export default function SessionPage() {
  const [file, setFile] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState('')
  const [prochainContact, setProchainContact] = useState('')
  const [statutRelance, setStatutRelance] = useState('')
  const [scripts, setScripts] = useState([])
  const [showScript, setShowScript] = useState(false)
  const [sessionStats, setSessionStats] = useState({ total: 0, rdv: 0, contactes: 0, pasRep: 0 })
  const [actionsSession, setActionsSession] = useState([])
  const [done, setDone] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState([])
  const [contactOuvert, setContactOuvert] = useState(null)
  const [jalons, setJalons] = useState([2, 7, 15, 30])
  const { user } = useAuth()

  const contact = file[index]

  const telecharger = async () => {
    if (actionsSession.length === 0) { toast.error('Aucune action à exporter pour le moment'); return }
    const now = new Date()
    const dateLabel = format(now, 'dd/MM/yyyy HH:mm')
    const dateFichier = format(now, 'yyyy-MM-dd-HHmm')
    try {
      await genererRecapPdf(actionsSession, {
        agent: user ? `${user.prenom} ${user.nom}` : '',
        dateLabel, dateFichier,
        stats: sessionStats,
      })
    } catch { toast.error('Erreur génération du récap') }
  }

  const loadFile = async () => {
    setLoading(true)
    try {
      const r = await api.get('/contacts/file-relances')
      setFile(r.data.contacts)
      setIndex(0)
      setDone(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFile() }, [])

  useEffect(() => {
    api.get('/admin/parametres').then(r => { const s = r.data?.cadence_estimation_jours; if (s) setJalons(parseJalons(s)) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!contact) return
    setNotes('')
    setProchainContact('')
    setStatutRelance('')
    setShowScript(false)
    api.get(`/scripts?categorie=${contact.categorie}`).then(r => setScripts(r.data))
  }, [contact?.id])

  useEffect(() => {
    if (recherche.trim().length < 2) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get('/contacts', { params: { search: recherche.trim(), limit: 8 } })
        .then(r => setResultats(r.data.contacts)).catch(() => setResultats([]))
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  const submit = useCallback(async (statut) => {
    if (!contact || submitting) return
    if (!statut && !statutRelance) { toast.error('Choisissez un statut'); return }
    const s = statut || statutRelance
    setSubmitting(true)
    try {
      await api.post('/relances', {
        contact_id: contact.id,
        statut: s,
        notes,
        prochain_contact: prochainContact || null,
      })
      setSessionStats(prev => ({
        total: prev.total + 1,
        rdv: prev.rdv + (s === 'rdv_obtenu' ? 1 : 0),
        contactes: prev.contactes + (['contacte', 'rdv_obtenu'].includes(s) ? 1 : 0),
        pasRep: prev.pasRep + (['tente_sans_reponse', 'message_laisse'].includes(s) ? 1 : 0),
      }))
      setActionsSession(prev => [...prev, {
        nom: contact.nom, prenom: contact.prenom, telephone: contact.telephone,
        statut: s, notes, prochain_contact: prochainContact || null,
      }])
      if (s === 'rdv_obtenu') toast.success('RDV obtenu ! Excellent !', { duration: 3000 })
      else toast.success('Relance enregistrée')

      if (index + 1 >= file.length) {
        setDone(true)
      } else {
        setIndex(i => i + 1)
      }
    } catch {
      toast.error('Erreur lors de l\'enregistrement')
    } finally {
      setSubmitting(false)
    }
  }, [contact, submitting, statutRelance, notes, prochainContact, index, file.length])

  const skip = () => {
    if (index + 1 >= file.length) setDone(true)
    else setIndex(i => i + 1)
  }

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'n') skip()
      if (SHORTCUT_MAP[e.key]) submit(SHORTCUT_MAP[e.key])
      if (e.key === 's') setShowScript(v => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [submit])

  if (loading) return <div className="flex-1 flex items-center justify-center bg-quai-light"><div className="animate-pulse text-quai-muted">Chargement de la file…</div></div>

  if (done || file.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-quai-light">
        <div className="text-center max-w-md">
          <Icon name="trophy" size="xl" className="text-quai-gold mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-quai-navy mb-2">
            {file.length === 0 ? 'Aucune relance à faire' : 'Session terminée'}
          </h2>
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="card text-center"><div className="text-2xl font-bold text-quai-navy">{sessionStats.total}</div><div className="text-xs text-quai-muted">Relances</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-emerald-600">{sessionStats.rdv}</div><div className="text-xs text-quai-muted">RDV obtenus</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-quai-navy">{sessionStats.contactes}</div><div className="text-xs text-quai-muted">Contactés</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{sessionStats.pasRep}</div><div className="text-xs text-quai-muted">Sans réponse</div></div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={loadFile} className="btn-primary inline-flex items-center gap-2"><Icon name="refresh-cw" size="sm" /> Recharger la file</button>
            {actionsSession.length > 0 && (
              <button onClick={telecharger} className="btn-secondary inline-flex items-center gap-2"><Icon name="file-down" size="sm" /> Télécharger le récap</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const progress = Math.round((index / file.length) * 100)

  return (
    <div className="flex-1 overflow-y-auto bg-quai-light p-4 pb-24 md:pb-6">
      <div className="max-w-3xl mx-auto mb-4">
        <div className="flex items-center justify-between text-sm text-quai-muted mb-1">
          <span>Contact {index + 1} / {file.length}</span>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-emerald-600 font-medium inline-flex items-center gap-1"><Icon name="calendar-check" size="sm" /> {sessionStats.rdv} RDV</span>
            <span className="text-quai-navy font-medium inline-flex items-center gap-1"><Icon name="phone-call" size="sm" /> {sessionStats.contactes} contactés</span>
            <span className="text-amber-600 font-medium inline-flex items-center gap-1"><Icon name="phone-off" size="sm" /> {sessionStats.pasRep} sans réponse</span>
          </div>
        </div>
        <div className="h-2 bg-quai-border rounded-full overflow-hidden">
          <div className="h-full bg-quai-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        {actionsSession.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button onClick={telecharger} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
              <Icon name="file-down" size="sm" /> Fin de session et télécharger récap ({actionsSession.length})
            </button>
          </div>
        )}
        <div className="relative mt-3">
          <div className="flex items-center gap-2">
            <Icon name="search" size="sm" className="text-quai-muted" />
            <input
              className="input flex-1"
              placeholder="Rappel entrant ? Rechercher par numéro ou nom…"
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
            />
          </div>
          {resultats.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-quai-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {resultats.map(c => (
                <button key={c.id} onClick={() => { setContactOuvert(c); setRecherche(''); setResultats([]) }}
                  className="w-full text-left px-3 py-2 hover:bg-quai-light border-b border-quai-border last:border-0">
                  <div className="text-sm font-medium text-quai-navy">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
                  <div className="text-xs text-quai-muted">{c.telephone || c.telephone2 || '—'}{c.ville ? ' · ' + c.ville : ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto grid grid-cols-1 gap-4">
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <CategorieBadge categorie={contact.categorie} />
                <ScoreBadge score={contact.score_priorite} />
                <PotentielStars potentiel={contact.potentiel} />
                <CadenceBadge contact={contact} jalons={jalons} />
              </div>
              <h2 className="text-2xl font-display font-bold text-quai-navy">{contact.civilite ? contact.civilite + ' ' : ''}{contact.prenom} {contact.nom}</h2>
              {contact.ville && <p className="text-quai-muted text-sm">{contact.ville} {contact.code_postal}</p>}
            </div>
            <div className="sm:text-right text-xs text-quai-muted">
              {contact.date_dernier_contact && (
                <div>Dernier contact : {format(new Date(contact.date_dernier_contact), 'dd/MM/yyyy')}</div>
              )}
              <div>{contact.nombre_tentatives} tentative(s)</div>
            </div>
          </div>

          {contact.telephone && (
            <div className="bg-quai-navy rounded-xl p-5 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-quai-gold font-medium uppercase tracking-wider mb-1">Téléphone</div>
                <a href={`tel:${contact.telephone}`} className="text-2xl md:text-3xl font-bold text-white hover:text-quai-gold transition-colors inline-flex items-center gap-2">
                  <Icon name="phone" size="lg" /> {contact.telephone}
                </a>
              </div>
              {contact.telephone2 && (
                <div className="text-right">
                  <div className="text-xs text-quai-gold/80 font-medium uppercase mb-1">Tél. 2</div>
                  <a href={`tel:${contact.telephone2}`} className="text-lg font-semibold text-white/80 hover:text-white">{contact.telephone2}</a>
                </div>
              )}
            </div>
          )}

          {contact.email && (
            <div className="text-sm text-quai-muted mb-3 inline-flex items-center gap-1.5"><Icon name="mail" size="sm" /> {contact.email}</div>
          )}

          {(contact.source_import || contact.assigned_prenom || contact.date_estimation || contact.suivi_par_origine) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-quai-muted mb-3">
              {contact.assigned_prenom && (
                <span className="inline-flex items-center gap-1.5"><Icon name="user" size="sm" /> {contact.assigned_prenom} {contact.assigned_nom}</span>
              )}
              {contact.date_estimation && (
                <span className="inline-flex items-center gap-1.5"><Icon name="calendar" size="sm" /> Estimation : {contact.date_estimation.slice(0, 10).split('-').reverse().join('/')}</span>
              )}
              {contact.source_import && (
                <span className="inline-flex items-center gap-1.5"><Icon name="tag" size="sm" /> {contact.source_import}</span>
              )}
              {contact.suivi_par_origine && (
                <span className="inline-flex items-center gap-1.5"><Icon name="history" size="sm" /> Suivi origine : {contact.suivi_par_origine}</span>
              )}
            </div>
          )}
          {contact.photo_url && <div className="mb-3 max-w-xs"><PhotoCarousel value={contact.photo_url} /></div>}

          {contact.notes && (
            <div className="bg-quai-gold/10 border border-quai-gold/30 rounded-lg p-3 text-sm text-quai-text mb-3 flex gap-2">
              <Icon name="pin" size="sm" className="text-quai-gold flex-shrink-0 mt-0.5" />
              <span><span className="font-medium">Notes : </span>{contact.notes}</span>
            </div>
          )}

          {contact.tags && JSON.parse(contact.tags || '[]').length > 0 && (
            <div className="flex flex-wrap gap-1">
              {JSON.parse(contact.tags).map(t => (
                <span key={t} className="badge bg-quai-light text-quai-muted border border-quai-border">{t}</span>
              ))}
            </div>
          )}
        </div>

        {scripts.length > 0 && (
          <div className="card">
            <button onClick={() => setShowScript(v => !v)} className="w-full flex items-center justify-between text-sm font-medium text-quai-navy">
              <span className="inline-flex items-center gap-2"><Icon name="file-text" size="sm" /> Script d'appel <span className="kbd ml-1">S</span></span>
              <Icon name={showScript ? 'chevron-up' : 'chevron-down'} size="sm" />
            </button>
            {showScript && scripts.map(s => (
              <div key={s.id} className="mt-3 p-3 bg-quai-light rounded-lg text-sm text-quai-text whitespace-pre-wrap border-l-4 border-quai-gold">
                <div className="font-medium text-quai-navy mb-1">{s.titre}</div>
                {s.contenu}
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <h3 className="font-medium text-quai-navy mb-3">Résultat de l'appel</h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {Object.entries(STATUTS_RELANCE).filter(([key]) => key !== 'mandat_obtenu').map(([key, val], i) => (
              <button
                key={key}
                onClick={() => setStatutRelance(key)}
                aria-pressed={statutRelance === key}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] ${
                  statutRelance === key
                    ? 'border-quai-gold bg-quai-gold/10 text-quai-navy'
                    : 'border-quai-border hover:border-quai-navy/40 text-quai-muted'
                }`}
              >
                <Icon name={val.icon} size="sm" className="flex-shrink-0" />
                <span className="flex-1 text-left">{val.label}</span>
                <kbd className="kbd text-xs">{i + 1}</kbd>
              </button>
            ))}
          </div>
          <button
            onClick={() => submit('mandat_obtenu')}
            disabled={submitting}
            className="w-full flex items-center gap-2 p-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-medium transition-all min-h-[44px] mb-4"
          >
            <Icon name="trophy" size="sm" className="flex-shrink-0" />
            <span className="flex-1 text-left">Mandat obtenu</span>
            <kbd className="kbd text-xs">7</kbd>
          </button>

          <textarea
            className="input mb-3 resize-none"
            rows={2}
            placeholder="Notes rapides (optionnel)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {['rappel_planifie', 'contacte', 'a_recontacter'].includes(statutRelance) && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-quai-muted mb-1">Date de prochain contact</label>
              <input type="date" className="input w-auto" value={prochainContact} onChange={e => setProchainContact(e.target.value)} />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => submit()} disabled={!statutRelance || submitting} className="btn-primary flex-1 inline-flex items-center justify-center gap-2">
              {submitting ? 'Enregistrement…' : <>Enregistrer et suivant <Icon name="arrow-right" size="sm" /></>}
            </button>
            <button onClick={skip} className="btn-secondary">Passer</button>
          </div>
        </div>

        <div className="text-center text-xs text-quai-muted">
          Raccourcis : <kbd className="kbd">1-7</kbd> statut · <kbd className="kbd">S</kbd> script · <kbd className="kbd">→</kbd> passer
        </div>
      </div>
      {contactOuvert && (
        <ContactModal
          contact={contactOuvert}
          onClose={() => setContactOuvert(null)}
          onSaved={() => setContactOuvert(null)}
        />
      )}
    </div>
  )
}
