import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES } from '../utils/constants'
import { useAuth } from '../hooks/useAuth'

export default function ScriptsPage() {
  const { user } = useAuth()
  const [scripts, setScripts] = useState([])
  const [filtre, setFiltre] = useState('')
  const [editId, setEditId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ categorie: 'autre', titre: '', contenu: '' })

  const canEdit = ['manager', 'admin'].includes(user?.role)

  const load = () => api.get('/scripts').then(r => setScripts(r.data))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.titre || !form.contenu) { toast.error('Titre et contenu requis'); return }
    try {
      if (editId) {
        await api.put(`/scripts/${editId}`, form)
        toast.success('Script mis à jour')
      } else {
        await api.post('/scripts', form)
        toast.success('Script créé')
      }
      setEditId(null); setShowNew(false); load()
    } catch { toast.error('Erreur') }
  }

  const del = async (id) => {
    if (!confirm('Supprimer ce script ?')) return
    await api.delete(`/scripts/${id}`)
    toast.success('Script supprimé')
    load()
  }

  const startEdit = (s) => { setEditId(s.id); setForm({ categorie: s.categorie, titre: s.titre, contenu: s.contenu }); setShowNew(true) }

  const filtered = filtre ? scripts.filter(s => s.categorie === filtre) : scripts
  const grouped = Object.entries(CATEGORIES).reduce((acc, [key, val]) => {
    const items = filtered.filter(s => s.categorie === key)
    if (items.length) acc[key] = { ...val, items }
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Scripts d'appel</h1>
          <div className="flex gap-3">
            <select className="input w-auto" value={filtre} onChange={e => setFiltre(e.target.value)}>
              <option value="">Toutes catégories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {canEdit && (
              <button onClick={() => { setEditId(null); setForm({ categorie: 'autre', titre: '', contenu: '' }); setShowNew(true) }} className="btn-primary btn-sm">
                + Nouveau script
              </button>
            )}
          </div>
        </div>

        {showNew && (
          <div className="card mb-6 border-2 border-blue-300">
            <h3 className="font-semibold mb-3">{editId ? 'Modifier le script' : 'Nouveau script'}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                <select className="input" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre</label>
                <input className="input" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Contenu du script</label>
              <textarea className="input resize-none" rows={8} value={form.contenu}
                onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))}
                placeholder="Rédigez votre script... Utilisez [Prénom], [Votre prénom], etc." />
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="btn-primary btn-sm">Sauvegarder</button>
              <button onClick={() => setShowNew(false)} className="btn-secondary btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {Object.entries(grouped).map(([key, { label, color, items }]) => (
          <div key={key} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className={`badge ${color}`}>{label}</span>
              <span className="text-sm text-gray-400">{items.length} script(s)</span>
            </div>
            <div className="space-y-3">
              {items.map(s => (
                <ScriptCard key={s.id} script={s} canEdit={canEdit} onEdit={startEdit} onDelete={del} />
              ))}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center text-gray-400 py-12">Aucun script trouvé</div>
        )}
      </div>
    </div>
  )
}

function ScriptCard({ script, canEdit, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <h4 className="font-medium text-gray-800">{script.titre}</h4>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit(script) }} className="btn-secondary btn-sm text-xs">Modifier</button>
              <button onClick={e => { e.stopPropagation(); onDelete(script.id) }} className="text-red-500 hover:text-red-700 text-xs px-2">✕</button>
            </>
          )}
          <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border-l-4 border-blue-400">
          {script.contenu}
        </div>
      )}
    </div>
  )
}
