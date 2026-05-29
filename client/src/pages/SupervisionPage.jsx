import { useState, useEffect } from 'react'
import api from '../utils/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function SupervisionPage() {
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [sup, users] = await Promise.all([
      api.get('/admin/supervision'),
      api.get('/admin/users'),
    ])
    setData(sup.data)
    setAgents(users.data.filter(u => u.role === 'agent'))

    const r = await api.get(`/relances/stats?${agentId ? `agent_id=${agentId}` : ''}`)
    setStats(r.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [agentId])
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [agentId])

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse">Chargement...</div>

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Supervision</h1>
            <p className="text-sm text-gray-500">Actualisation automatique toutes les 30 secondes</p>
          </div>
          <div className="flex gap-3">
            <select className="input w-auto" value={agentId} onChange={e => setAgentId(e.target.value)}>
              <option value="">Tous les agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
            </select>
            <button onClick={load} className="btn-secondary btn-sm">🔄 Actualiser</button>
          </div>
        </div>

        {/* Activité du jour */}
        <h2 className="font-semibold text-gray-700 mb-3">Activité aujourd'hui — {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {data?.activite?.map(a => {
            const taux = a.relances_total > 0 ? Math.round((a.contactes + a.rdv) / a.relances_total * 100) : 0
            return (
              <div key={a.id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                    {a.prenom?.[0]}{a.nom?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{a.prenom} {a.nom}</div>
                    {a.derniere_relance && (
                      <div className="text-xs text-gray-400">
                        Dernière : {format(new Date(a.derniere_relance), 'HH:mm')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-blue-50 rounded p-2">
                    <div className="text-xl font-bold text-blue-700">{a.relances_total}</div>
                    <div className="text-xs text-gray-500">Relances</div>
                  </div>
                  <div className="bg-green-50 rounded p-2">
                    <div className="text-xl font-bold text-green-700">{a.rdv}</div>
                    <div className="text-xs text-gray-500">RDV</div>
                  </div>
                  <div className="bg-indigo-50 rounded p-2">
                    <div className="text-xl font-bold text-indigo-700">{a.contactes}</div>
                    <div className="text-xs text-gray-500">Contactés</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-xl font-bold text-gray-700">{taux}%</div>
                    <div className="text-xs text-gray-500">Contact</div>
                  </div>
                </div>
              </div>
            )
          })}
          {(!data?.activite || data.activite.length === 0) && (
            <div className="col-span-3 text-center text-gray-400 py-8">Aucun agent actif aujourd'hui</div>
          )}
        </div>

        {/* Stats globales */}
        {stats && (
          <>
            <h2 className="font-semibold text-gray-700 mb-3">Statistiques 30 derniers jours</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total relances" value={stats.totalRelances} color="blue" />
              <StatCard label="RDV obtenus (total)" value={stats.rdvObtenus} color="green" />
              <StatCard label="Total contacts" value={stats.totalContacts?.toLocaleString('fr')} color="indigo" />
              <StatCard label="Statuts relances" value={stats.parStatut?.length + ' types'} color="gray" />
            </div>

            <div className="card">
              <h3 className="font-medium text-gray-700 mb-3">Résultats des relances (30j)</h3>
              <div className="space-y-2">
                {stats.parStatut?.map(s => (
                  <div key={s.statut} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-gray-600 capitalize">{s.statut.replace(/_/g, ' ')}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, (s.cnt / stats.totalRelances) * 100)}%` }}
                      />
                    </div>
                    <div className="w-12 text-sm text-right font-medium">{s.cnt}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  const colors = { blue: 'text-blue-600', green: 'text-green-600', indigo: 'text-indigo-600', gray: 'text-gray-600' }
  return (
    <div className="card text-center">
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
