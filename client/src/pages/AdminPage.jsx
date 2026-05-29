import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [params, setParams] = useState({})
  const [newUser, setNewUser] = useState({ nom: '', prenom: '', email: '', password: '', role: 'agent' })
  const [showNewUser, setShowNewUser] = useState(false)

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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Administration</h1>

        <div className="flex border-b border-gray-200 mb-6">
          {['users', 'params'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'users' ? '👥 Utilisateurs' : '⚙️ Paramètres'}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Gestion des utilisateurs</h2>
              <button onClick={() => setShowNewUser(true)} className="btn-primary btn-sm">+ Nouvel utilisateur</button>
            </div>

            {showNewUser && (
              <div className="card mb-4 border-2 border-blue-300">
                <h3 className="font-medium mb-3">Créer un utilisateur</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[['Prénom','prenom'],['Nom','nom'],['Email','email'],['Mot de passe','password']].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                      <input type={k === 'password' ? 'password' : 'text'} className="input"
                        value={newUser[k]} onChange={e => setNewUser(u => ({ ...u, [k]: e.target.value }))} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
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
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rôle</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium">{u.prenom} {u.nom}</td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleUser(u)} className="text-xs text-gray-500 hover:text-gray-700">
                          {u.actif ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'params' && (
          <div>
            <h2 className="font-semibold text-gray-700 mb-4">Paramètres de relance</h2>
            <div className="card space-y-4">
              <ParamField label="Nombre de relances par jour" cle="relances_par_jour" params={params} setParams={setParams} type="number" />
              <hr />
              <h3 className="font-medium text-gray-700">Score de base par catégorie</h3>
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
              <hr />
              <ParamField label="Délai avant recontact (jours)" cle="delai_recontact_jours" params={params} setParams={setParams} type="number" />
              <button onClick={saveParams} className="btn-primary">Sauvegarder les paramètres</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ParamField({ label, cle, params, setParams, type = 'text', min, max }) {
  return (
    <div className="flex items-center gap-4">
      <label className="w-48 text-sm font-medium text-gray-600">{label}</label>
      <input
        type={type} min={min} max={max}
        className="input w-32"
        value={params[cle] || ''}
        onChange={e => setParams(p => ({ ...p, [cle]: e.target.value }))}
      />
    </div>
  )
}
