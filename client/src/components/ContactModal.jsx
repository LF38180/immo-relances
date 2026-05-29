import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS, POTENTIEL_LABELS, STATUTS_RELANCE } from '../utils/constants'
import { CategorieBadge, StatutBadge, ScoreBadge, PotentielStars } from './ContactBadge'
import { format } from 'date-fns'

export default function ContactModal({ contact, onClose, onSaved }) {
  const isNew = !contact
  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', telephone2: '', email: '',
    adresse: '', code_postal: '', ville: '', categorie: 'autre',
    notes: '', potentiel: 3, statut: 'a_contacter', prochain_contact: '',
    tags: '',
  })
  const [relances, setRelances] = useState([])
  const [tab, setTab] = useState('infos')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (contact) {
      const tags = (() => { try { return JSON.parse(contact.tags || '[]').join(', ') } catch { return '' } })()
      setForm({ ...contact, tags, prochain_contact: contact.prochain_contact?.slice(0, 10) || '' })
      api.get(`/relances/contact/${contact.id}`).then(r => setRelances(r.data))
    }
  }, [contact?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nom) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: JSON.stringify(form.tags.split(',').map(t => t.trim()).filter(Boolean)),
        prochain_contact: form.prochain_contact || null,
      }
      if (isNew) {
        await api.post('/contacts', payload)
        toast.success('Contact créé')
      } else {
        await api.put(`/contacts/${contact.id}`, payload)
        toast.success('Contact mis à jour')
      }
      onSaved()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const del = async () => {
    if (!confirm('Supprimer ce contact ?')) return
    setDeleting(true)
    try {
      await api.delete(`/contacts/${contact.id}`)
      toast.success('Contact supprimé')
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isNew ? 'Nouveau contact' : `${contact.prenom} ${contact.nom}`}
            </h2>
            {!isNew && (
              <div className="flex items-center gap-2 mt-1">
                <CategorieBadge categorie={contact.categorie} />
                <StatutBadge statut={contact.statut} />
                <ScoreBadge score={contact.score_priorite} />
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        {/* Tabs */}
        {!isNew && (
          <div className="flex border-b border-gray-200 px-5">
            {['infos', 'historique'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t === 'infos' ? 'Informations' : `Historique (${relances.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'infos' ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom" value={form.prenom} onChange={v => set('prenom', v)} />
              <Field label="Nom *" value={form.nom} onChange={v => set('nom', v)} />
              <Field label="Téléphone" value={form.telephone} onChange={v => set('telephone', v)} type="tel" />
              <Field label="Téléphone 2" value={form.telephone2} onChange={v => set('telephone2', v)} type="tel" />
              <Field label="Email" value={form.email} onChange={v => set('email', v)} type="email" className="col-span-2" />
              <Field label="Adresse" value={form.adresse} onChange={v => set('adresse', v)} className="col-span-2" />
              <Field label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} />
              <Field label="Ville" value={form.ville} onChange={v => set('ville', v)} />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                <select className="input" value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
                <select className="input" value={form.statut} onChange={e => set('statut', e.target.value)}>
                  {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Potentiel</label>
                <select className="input" value={form.potentiel} onChange={e => set('potentiel', Number(e.target.value))}>
                  {Object.entries(POTENTIEL_LABELS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prochain contact</label>
                <input type="date" className="input" value={form.prochain_contact} onChange={e => set('prochain_contact', e.target.value)} />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags (séparés par virgule)</label>
                <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="vendeur, budget 400k, urgent..." />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informations sur ce contact..." />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {relances.length === 0 && <div className="text-center text-gray-400 py-8">Aucune relance enregistrée</div>}
              {relances.map(r => {
                const s = STATUTS_RELANCE[r.statut] || { label: r.statut, icon: '•', color: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={r.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="text-xl flex-shrink-0">{s.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-gray-400">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
                        <span className="text-xs text-gray-400">par {r.agent_prenom} {r.agent_nom}</span>
                      </div>
                      {r.notes && <p className="text-sm text-gray-600">{r.notes}</p>}
                      {r.prochain_contact && <p className="text-xs text-blue-600 mt-1">📅 Prochain : {format(new Date(r.prochain_contact), 'dd/MM/yyyy')}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-200">
          {!isNew ? (
            <button onClick={del} disabled={deleting} className="btn-danger btn-sm">
              {deleting ? '...' : '🗑 Supprimer'}
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Annuler</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement...' : isNew ? 'Créer' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} className="input" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
