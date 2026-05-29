import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS_RELANCE, STATUTS } from '../utils/constants'
import { CategorieBadge, ScoreBadge, PotentielStars } from '../components/ContactBadge'
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
      if (s === 'rdv_obtenu') toast.success('🎉 RDV obtenu ! Excellent !', { duration: 3000 })
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

  // Raccourcis clavier
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

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="animate-pulse text-gray-400">Chargement de la file...</div></div>

  if (done || file.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {file.length === 0 ? 'Aucune relance à faire' : 'Session terminée !'}
          </h2>
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="card text-center"><div className="text-2xl font-bold text-blue-600">{sessionStats.total}</div><div className="text-xs text-gray-500">Relances</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-green-600">{sessionStats.rdv}</div><div className="text-xs text-gray-500">RDV obtenus</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-indigo-600">{sessionStats.contactes}</div><div className="text-xs text-gray-500">Contactés</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-yellow-600">{sessionStats.pasRep}</div><div className="text-xs text-gray-500">Sans réponse</div></div>
          </div>
          <button onClick={loadFile} className="btn-primary">Recharger la file</button>
        </div>
      </div>
    )
  }

  const progress = Math.round((index / file.length) * 100)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
      {/* Progress bar */}
      <div className="max-w-3xl mx-auto mb-4">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
          <span>Contact {index + 1} / {file.length}</span>
          <div className="flex gap-4 text-xs">
            <span className="text-green-600 font-medium">✅ {sessionStats.rdv} RDV</span>
            <span className="text-blue-600 font-medium">☎️ {sessionStats.contactes} contactés</span>
            <span className="text-yellow-600 font-medium">📵 {sessionStats.pasRep} sans réponse</span>
          </div>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto grid grid-cols-1 gap-4">
        {/* Fiche contact */}
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CategorieBadge categorie={contact.categorie} />
                <ScoreBadge score={contact.score_priorite} />
                <PotentielStars potentiel={contact.potentiel} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{contact.prenom} {contact.nom}</h2>
              {contact.ville && <p className="text-gray-500 text-sm">{contact.ville} {contact.code_postal}</p>}
            </div>
            <div className="text-right">
              {contact.date_dernier_contact && (
                <div className="text-xs text-gray-400">
                  Dernier contact : {format(new Date(contact.date_dernier_contact), 'dd/MM/yyyy')}
                </div>
              )}
              <div className="text-xs text-gray-400">{contact.nombre_tentatives} tentative(s)</div>
            </div>
          </div>

          {/* Numéro en grand */}
          {contact.telephone && (
            <div className="bg-blue-50 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-600 font-medium uppercase mb-1">Téléphone</div>
                <a href={`tel:${contact.telephone}`} className="text-3xl font-bold text-blue-700 hover:text-blue-800">
                  {contact.telephone}
                </a>
              </div>
              {contact.telephone2 && (
                <div className="text-right">
                  <div className="text-xs text-blue-600 font-medium uppercase mb-1">Tél. 2</div>
                  <a href={`tel:${contact.telephone2}`} className="text-lg font-semibold text-blue-600">
                    {contact.telephone2}
                  </a>
                </div>
              )}
            </div>
          )}

          {contact.email && (
            <div className="text-sm text-gray-600 mb-3">✉️ {contact.email}</div>
          )}

          {contact.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700 mb-3">
              <span className="font-medium">📌 Notes : </span>{contact.notes}
            </div>
          )}

          {contact.tags && JSON.parse(contact.tags || '[]').length > 0 && (
            <div className="flex flex-wrap gap-1">
              {JSON.parse(contact.tags).map(t => (
                <span key={t} className="badge bg-gray-100 text-gray-600">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Script */}
        {scripts.length > 0 && (
          <div className="card">
            <button onClick={() => setShowScript(v => !v)} className="w-full flex items-center justify-between text-sm font-medium text-gray-700">
              <span>📝 Script d'appel <span className="kbd ml-1">S</span></span>
              <span>{showScript ? '▲' : '▼'}</span>
            </button>
            {showScript && scripts.map(s => (
              <div key={s.id} className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border-l-4 border-blue-400">
                <div className="font-medium text-blue-700 mb-1">{s.titre}</div>
                {s.contenu}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="card">
          <h3 className="font-medium text-gray-700 mb-3">Résultat de l'appel</h3>

          {/* Boutons statuts */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {Object.entries(STATUTS_RELANCE).map(([key, val], i) => (
              <button
                key={key}
                onClick={() => setStatutRelance(key)}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  statutRelance === key
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <span>{val.icon}</span>
                <span className="flex-1 text-left">{val.label}</span>
                <kbd className="kbd text-xs">{i + 1}</kbd>
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            className="input mb-3 resize-none"
            rows={2}
            placeholder="Notes rapides (optionnel)..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {/* Prochain contact */}
          {['rappel_planifie', 'contacte', 'a_recontacter'].includes(statutRelance) && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">Date de prochain contact</label>
              <input type="date" className="input w-auto" value={prochainContact} onChange={e => setProchainContact(e.target.value)} />
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex gap-3">
            <button
              onClick={() => submit()}
              disabled={!statutRelance || submitting}
              className="btn-primary flex-1"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer et suivant →'}
            </button>
            <button onClick={skip} className="btn-secondary">Passer</button>
          </div>
        </div>

        {/* Raccourcis */}
        <div className="text-center text-xs text-gray-400">
          Raccourcis : <kbd className="kbd">1-6</kbd> statut · <kbd className="kbd">S</kbd> script · <kbd className="kbd">→</kbd> passer
        </div>
      </div>
    </div>
  )
}
