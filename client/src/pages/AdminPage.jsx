import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'

export default function AdminPage() {
  const { user } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [params, setParams] = useState({})
  const [newUser, setNewUser] = useState({ nom: '', prenom: '', email: '', password: '', role: 'agent' })
  const [showNewUser, setShowNewUser] = useState(false)
  const [confirmEffacer, setConfirmEffacer] = useState('')
  const [effacement, setEffacement] = useState(false)

  const effacerTousContacts = async () => {
    if (confirmEffacer !== 'EFFACER' || effacement) return
    setEffacement(true)
    try {
      const r = await api.delete('/contacts/all')
      toast.success(`${r.data.supprimes} contact(s) effacé(s)`)
      setConfirmEffacer('')
    } catch { toast.error('Erreur (réservé admin)') }
    finally { setEffacement(false) }
  }

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data))
    api.get('/admin/parametres').then(r => setParams(r.data))
  }, [])

  const saveParams = async () => {
    await api.put('/admin/parametres', params)
    toast.success('Paramètres sauvegardés')
  }

  const createUser = async () => {
    try {
      await api.post('/admin/users', newUser)
      toast.success('Utilisateur créé')
      api.get('/admin/users').then(r => setUsers(r.data))
      setShowNewUser(false)
      setNewUser({ nom: '', prenom: '', email: '', password: '', role: 'agent' })
    } catch { toast.error('Erreur (email déjà utilisé ?)') }
  }

  const toggleUser = async (u) => {
    await api.put(`/admin/users/${u.id}`, { actif: u.actif ? 0 : 1 })
    toast.success(u.actif ? 'Utilisateur désactivé' : 'Utilisateur activé')
    api.get('/admin/users').then(r => setUsers(r.data))
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Administration" />

        <div className="flex border-b border-quai-border mb-6">
          {[['users','Utilisateurs','users'],['params','Paramètres','settings'],...(estAdmin ? [['donnees','Données','database']] : [])].map(([t, lbl, ic]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
              <Icon name={ic} size="sm" /> {lbl}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="font-semibold text-quai-navy">Gestion des utilisateurs</h2>
              <button onClick={() => setShowNewUser(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Nouvel utilisateur</button>
            </div>

            {showNewUser && (
              <div className="card mb-4 border-2 border-quai-gold/40">
                <h3 className="font-medium text-quai-navy mb-3">Créer un utilisateur</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {[['Prénom','prenom'],['Nom','nom'],['Email','email'],['Mot de passe','password']].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-quai-muted mb-1">{l}</label>
                      <input type={k === 'password' ? 'password' : 'text'} className="input"
                        value={newUser[k]} onChange={e => setNewUser(u => ({ ...u, [k]: e.target.value }))} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-quai-muted mb-1">Rôle</label>
                    <select className="input" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                      <option value="agent">Agent</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createUser} className="btn-primary btn-sm">Créer</button>
                  <button onClick={() => setShowNewUser(false)} className="btn-secondary btn-sm">Annuler</button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-quai-light">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Rôle</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-quai-border">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium text-quai-navy">{u.prenom} {u.nom}</td>
                      <td className="px-4 py-3 text-quai-muted">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.role === 'admin' ? 'bg-quai-navy text-white' : u.role === 'manager' ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.actif ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleUser(u)} className="text-xs text-quai-navy hover:text-quai-gold font-medium">
                          {u.actif ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'params' && (
          <div>
            <h2 className="font-semibold text-quai-navy mb-4">Paramètres de relance</h2>
            <div className="card space-y-4">
              <ParamField label="Nombre de relances par jour" cle="relances_par_jour" params={params} setParams={setParams} type="number" />
              <ParamField label="Cadence estimation (jours)" cle="cadence_estimation_jours" params={params} setParams={setParams} type="text" placeholder="ex: 2,7,15,30" />
              <hr className="border-quai-border" />
              <h3 className="font-medium text-quai-navy">Score de base par catégorie</h3>
              {[
                ['ancien_client', 'Ancien client'],
                ['prospect_chaud', 'Prospect chaud'],
                ['prospect_froid', 'Prospect froid'],
                ['acquereur', 'Acquéreur'],
                ['vendeur', 'Vendeur'],
                ['autre', 'Autre'],
              ].map(([k, l]) => (
                <ParamField key={k} label={l} cle={`score_${k}`} params={params} setParams={setParams} type="number" min={0} max={100} />
              ))}
              <hr className="border-quai-border" />
              <ParamField label="Délai avant recontact (jours)" cle="delai_recontact_jours" params={params} setParams={setParams} type="number" />
              <button onClick={saveParams} className="btn-primary">Sauvegarder les paramètres</button>
            </div>
          </div>
        )}

        {tab === 'donnees' && estAdmin && (
          <div>
            <h2 className="font-semibold text-quai-navy mb-4">Données</h2>
            <div className="card border-2 border-red-200">
              <div className="flex items-start gap-3 mb-3">
                <Icon name="alert-triangle" size="md" className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-quai-navy">Effacer tous les contacts</h3>
                  <p className="text-sm text-quai-muted">Supprime définitivement la totalité des contacts et leur historique de relances. Action irréversible. Utile avant un ré-import propre.</p>
                </div>
              </div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Tapez <span className="font-mono font-bold">EFFACER</span> pour confirmer</label>
              <div className="flex gap-2">
                <input className="input w-48" value={confirmEffacer} onChange={e => setConfirmEffacer(e.target.value)} placeholder="EFFACER" />
                <button onClick={effacerTousContacts} disabled={confirmEffacer !== 'EFFACER' || effacement} className="btn-danger inline-flex items-center gap-1.5">
                  <Icon name="trash-2" size="sm" /> {effacement ? 'Effacement…' : 'Effacer tous les contacts'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ParamField({ label, cle, params, setParams, type = 'text', min, max, placeholder }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <label className="sm:w-48 text-sm font-medium text-quai-muted">{label}</label>
      <input
        type={type} min={min} max={max} placeholder={placeholder}
        className="input w-full sm:w-48"
        value={params[cle] || ''}
        onChange={e => setParams(p => ({ ...p, [cle]: e.target.value }))}
      />
    </div>
  )
}
