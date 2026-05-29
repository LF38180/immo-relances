import { useState, useEffect } from 'react'
import api from '../utils/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'

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

  if (loading) return <div className="flex-1 flex items-center justify-center bg-quai-light text-quai-muted animate-pulse">Chargement…</div>

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-quai-light">
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Supervision" subtitle="Actualisation automatique toutes les 30 secondes">
          <select className="input w-auto" value={agentId} onChange={e => setAgentId(e.target.value)} aria-label="Filtrer par agent">
            <option value="">Tous les agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
          </select>
          <button onClick={load} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="refresh-cw" size="sm" /> Actualiser</button>
        </PageHeader>

        <h2 className="font-semibold text-quai-navy mb-3">Activité aujourd'hui — {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {data?.activite?.map(a => {
            const taux = a.relances_total > 0 ? Math.round((a.contactes + a.rdv) / a.relances_total * 100) : 0
            return (
              <div key={a.id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-quai-navy rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {a.prenom?.[0]}{a.nom?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-quai-navy">{a.prenom} {a.nom}</div>
                    {a.derniere_relance && (
                      <div className="text-xs text-quai-muted">
                        Dernière : {format(new Date(a.derniere_relance), 'HH:mm')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.relances_total}</div>
                    <div className="text-xs text-quai-muted">Relances</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded p-2">
                    <div className="text-xl font-bold text-emerald-700">{a.rdv}</div>
                    <div className="text-xs text-quai-muted">RDV</div>
                  </div>
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.contactes}</div>
                    <div className="text-xs text-quai-muted">Contactés</div>
                  </div>
                  <div className="bg-quai-gold/10 border border-quai-gold/30 rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{taux}%</div>
                    <div className="text-xs text-quai-muted">Contact</div>
                  </div>
                </div>
              </div>
            )
          })}
          {(!data?.activite || data.activite.length === 0) && (
            <div className="col-span-3 text-center text-quai-muted py-8">Aucun agent actif aujourd'hui</div>
          )}
        </div>

        {stats && (
          <>
            <h2 className="font-semibold text-quai-navy mb-3">Statistiques 30 derniers jours</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total relances" value={stats.totalRelances} />
              <StatCard label="RDV obtenus (total)" value={stats.rdvObtenus} />
              <StatCard label="Total contacts" value={stats.totalContacts?.toLocaleString('fr')} />
              <StatCard label="Types de statuts" value={(stats.parStatut?.length || 0) + ' types'} />
            </div>

            <div className="card">
              <h3 className="font-medium text-quai-navy mb-3">Résultats des relances (30j)</h3>
              <div className="space-y-2">
                {stats.parStatut?.map(s => (
                  <div key={s.statut} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-quai-muted capitalize">{s.statut.replace(/_/g, ' ')}</div>
                    <div className="flex-1 bg-quai-border rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-quai-navy rounded-full"
                        style={{ width: `${Math.min(100, (s.cnt / stats.totalRelances) * 100)}%` }}
                      />
                    </div>
                    <div className="w-12 text-sm text-right font-medium text-quai-navy">{s.cnt}</div>
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

function StatCard({ label, value }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-quai-navy">{value}</div>
      <div className="text-xs text-quai-muted mt-1">{label}</div>
    </div>
  )
}
