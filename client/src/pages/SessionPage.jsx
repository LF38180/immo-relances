import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { STATUTS_RELANCE } from '../utils/constants'
import { CategorieBadge, ScoreBadge, PotentielStars } from '../components/ContactBadge'
import Icon from '../components/ui/Icon'
import { format } from 'date-fns'

const SHORTCUT_MAP = {
  '1': 'tente_sans_reponse',
  '2': 'message_laisse',
  '3': 'contacte',
  '4': 'rdv_obtenu',
  '5': 'pas_interesse',
  '6': 'rappel_planifie',
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
  const [done, setDone] = useState(false)

  const contact = file[index]

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
    if (!contact) return
    setNotes('')
    setProchainContact('')
    setStatutRelance('')
    setShowScript(false)
    api.get(`/scripts?categorie=${contact.categorie}`).then(r => setScripts(r.data))
  }, [contact?.id])

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
          <button onClick={loadFile} className="btn-primary inline-flex items-center gap-2"><Icon name="refresh-cw" size="sm" /> Recharger la file</button>
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
      </div>

      <div className="max-w-3xl mx-auto grid grid-cols-1 gap-4">
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <CategorieBadge categorie={contact.categorie} />
                <ScoreBadge score={contact.score_priorite} />
                <PotentielStars potentiel={contact.potentiel} />
              </div>
              <h2 className="text-2xl font-display font-bold text-quai-navy">{contact.prenom} {contact.nom}</h2>
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
            {Object.entries(STATUTS_RELANCE).map(([key, val], i) => (
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
          Raccourcis : <kbd className="kbd">1-6</kbd> statut · <kbd className="kbd">S</kbd> script · <kbd className="kbd">→</kbd> passer
        </div>
      </div>
    </div>
  )
}
