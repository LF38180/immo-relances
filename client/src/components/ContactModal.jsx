import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS, POTENTIEL_LABELS, STATUTS_RELANCE } from '../utils/constants'
import { CategorieBadge, StatutBadge, ScoreBadge } from './ContactBadge'
import Modal from './ui/Modal'
import ConfirmDialog from './ui/ConfirmDialog'
import Icon from './ui/Icon'
import { format } from 'date-fns'

export default function ContactModal({ contact, onClose, onSaved }) {
  const isNew = !contact
  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', telephone2: '', email: '',
    adresse: '', code_postal: '', ville: '', categorie: 'autre',
    notes: '', potentiel: 3, statut: 'a_contacter', prochain_contact: '', tags: '',
    source_import: '', assigned_to: '', date_estimation: '', photo_url: '',
  })
  const [users, setUsers] = useState([])
  const [relances, setRelances] = useState([])
  const [tab, setTab] = useState('infos')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (contact) {
      const tags = (() => { try { return JSON.parse(contact.tags || '[]').join(', ') } catch { return '' } })()
      setForm({ ...contact, tags, prochain_contact: contact.prochain_contact?.slice(0, 10) || '', date_estimation: contact.date_estimation?.slice(0, 10) || '', assigned_to: contact.assigned_to || '' })
      api.get(`/relances/contact/${contact.id}`).then(r => setRelances(r.data))
    }
  }, [contact?.id])

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).catch(() => setUsers([]))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nom) { toast.error('Le nom est requis'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: JSON.stringify(form.tags.split(',').map(t => t.trim()).filter(Boolean)),
        prochain_contact: form.prochain_contact || null,
      }
      if (isNew) { await api.post('/contacts', payload); toast.success('Contact créé') }
      else { await api.put(`/contacts/${contact.id}`, payload); toast.success('Contact mis à jour') }
      onSaved()
    } catch { toast.error('Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  const del = async () => {
    setDeleting(true)
    try {
      await api.delete(`/contacts/${contact.id}`)
      toast.success('Contact supprimé')
      onSaved()
    } finally { setDeleting(false); setConfirmDel(false) }
  }

  const footer = (
    <>
      {!isNew ? (
        <button onClick={() => setConfirmDel(true)} disabled={deleting} className="btn-danger btn-sm inline-flex items-center gap-1.5">
          <Icon name="trash-2" size="sm" /> Supprimer
        </button>
      ) : <div />}
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : isNew ? 'Créer' : 'Sauvegarder'}
        </button>
      </div>
    </>
  )

  return (
    <>
      <Modal title={isNew ? 'Nouveau contact' : `${contact.prenom} ${contact.nom}`} onClose={onClose} footer={footer}>
        {!isNew && (
          <div className="flex items-center gap-2 mb-4">
            <CategorieBadge categorie={contact.categorie} />
            <StatutBadge statut={contact.statut} />
            <ScoreBadge score={contact.score_priorite} />
          </div>
        )}
        {!isNew && (
          <div className="flex border-b border-quai-border mb-4 -mt-1">
            {['infos', 'historique'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
                {t === 'infos' ? 'Informations' : `Historique (${relances.length})`}
              </button>
            ))}
          </div>
        )}

        {tab === 'infos' ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prénom" value={form.prenom} onChange={v => set('prenom', v)} autoComplete="given-name" />
            <Field label="Nom *" value={form.nom} onChange={v => set('nom', v)} autoComplete="family-name" />
            <Field label="Téléphone" value={form.telephone} onChange={v => set('telephone', v)} type="tel" autoComplete="tel" />
            <Field label="Téléphone 2" value={form.telephone2} onChange={v => set('telephone2', v)} type="tel" />
            <Field label="Email" value={form.email} onChange={v => set('email', v)} type="email" className="col-span-2" autoComplete="email" />
            <Field label="Adresse" value={form.adresse} onChange={v => set('adresse', v)} className="col-span-2" />
            <Field label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} />
            <Field label="Ville" value={form.ville} onChange={v => set('ville', v)} />
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Catégorie</label>
              <select className="input" value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Statut</label>
              <select className="input" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Potentiel</label>
              <select className="input" value={form.potentiel} onChange={e => set('potentiel', Number(e.target.value))}>
                {Object.entries(POTENTIEL_LABELS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Prochain contact</label>
              <input type="date" className="input" value={form.prochain_contact} onChange={e => set('prochain_contact', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Conseiller en charge</label>
              <select className="input" value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value || null)}>
                <option value="">— Non attribué —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Date d'estimation</label>
              <input type="date" className="input" value={form.date_estimation || ''} onChange={e => set('date_estimation', e.target.value)} />
            </div>
            <Field label="Source" value={form.source_import} onChange={v => set('source_import', v)} />
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Photo (URL)</label>
              <input className="input" value={form.photo_url || ''} onChange={e => set('photo_url', e.target.value)} placeholder="https://…" />
              {form.photo_url && (
                <img src={form.photo_url} alt="Aperçu" className="mt-2 h-16 w-16 object-cover rounded-lg border border-quai-border"
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-quai-muted mb-1">Tags (séparés par virgule)</label>
              <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="vendeur, budget 400k, urgent…" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-quai-muted mb-1">Notes</label>
              <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informations sur ce contact…" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {relances.length === 0 && <div className="text-center text-quai-muted py-8">Aucune relance enregistrée</div>}
            {relances.map(r => {
              const s = STATUTS_RELANCE[r.statut] || { label: r.statut, icon: 'circle', color: 'bg-quai-light text-quai-muted' }
              return (
                <div key={r.id} className="flex gap-3 p-3 bg-quai-light rounded-lg border border-quai-border">
                  <Icon name={s.icon} size="md" className="text-quai-navy flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-quai-muted">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      <span className="text-xs text-quai-muted">par {r.agent_prenom} {r.agent_nom}</span>
                    </div>
                    {r.notes && <p className="text-sm text-quai-text">{r.notes}</p>}
                    {r.prochain_contact && (
                      <p className="text-xs text-quai-navy mt-1 inline-flex items-center gap-1">
                        <Icon name="calendar-clock" size="sm" /> Prochain : {format(new Date(r.prochain_contact), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {confirmDel && (
        <ConfirmDialog
          title="Supprimer le contact"
          message={`Voulez-vous vraiment supprimer ${contact.prenom} ${contact.nom} ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={del}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  )
}

function Field({ label, value, onChange, type = 'text', className = '', autoComplete }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-quai-muted mb-1">{label}</label>
      <input type={type} autoComplete={autoComplete} className="input" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
