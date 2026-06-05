import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../utils/api'
import { CATEGORIES, STATUTS } from '../utils/constants'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'

const PIE_COLORS = ['#080432','#B6A997','#FA7A35','#1a1a4e','#cabfb0','#94a3b8']

export default function DashboardPage({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [periode, setPeriode] = useState(7)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const debut = format(subDays(new Date(), periode), 'yyyy-MM-dd')
    const fin = format(new Date(), 'yyyy-MM-dd')
    setLoading(true)
    api.get(`/relances/stats?debut=${debut}&fin=${fin}`)
      .then(r => setStats(r.data))
      .finally(() => setLoading(false))
  }, [periode])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-quai-light">
      <div className="text-quai-muted animate-pulse text-sm">Chargement…</div>
    </div>
  )
  if (!stats) return null

  const rdvCount = stats.parStatut.find(s => s.statut === 'rdv_obtenu')?.cnt || 0
  const contacteCount = stats.parStatut.find(s => s.statut === 'contacte')?.cnt || 0
  const tauxContact = stats.totalRelances > 0 ? Math.round((contacteCount + rdvCount) / stats.totalRelances * 100) : 0

  const catData = stats.contactsParCategorie.map(c => ({
    name: CATEGORIES[c.categorie]?.label || c.categorie, value: c.cnt
  }))
  const parJourData = stats.parJour.map(j => ({
    jour: format(new Date(j.jour), 'dd/MM'), relances: j.cnt
  }))

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Vue d'ensemble" subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}>
          <select value={periode} onChange={e => setPeriode(Number(e.target.value))} className="input w-auto text-sm" aria-label="Période">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
          </select>
        </PageHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total contacts" value={stats.totalContacts.toLocaleString('fr')} icon="users" variant="navy" />
          <KpiCard label="Relances (période)" value={stats.totalRelances} icon="phone" variant="gold" />
          <KpiCard label="Taux de contact" value={`${tauxContact}%`} icon="trending-up" variant="light" />
          <KpiCard label="RDV obtenus (total)" value={stats.rdvObtenus} icon="calendar-check" variant="success" onClick={() => onNavigate('contacts')} />
        </div>

        {stats.parAgent?.length > 0 && (
          <div className="card mb-6">
            <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Activité aujourd'hui</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {stats.parAgent.map(a => (
                <div key={a.id} className="text-center p-4 bg-quai-light rounded-xl border border-quai-border">
                  <div className="w-10 h-10 bg-quai-navy rounded-full flex items-center justify-center text-white text-sm font-bold mx-auto mb-2">
                    {a.prenom?.[0]}{a.nom?.[0]}
                  </div>
                  <div className="text-2xl font-bold text-quai-navy">{a.relances_jour}</div>
                  <div className="text-xs text-quai-muted">{a.prenom} {a.nom}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="card">
            <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Relances par jour</h2>
            {parJourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={parJourData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DDD6', fontSize: 12 }} />
                  <Bar dataKey="relances" fill="#080432" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-quai-muted text-sm">Aucune donnée sur cette période</div>}
          </div>

          <div className="card">
            <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Répartition par catégorie</h2>
            {catData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ value }) => value}>
                    {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DDD6', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-quai-muted text-sm">Aucune donnée</div>}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Pipeline contacts</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {stats.contactsParStatut.map(s => {
              const info = STATUTS[s.statut] || { label: s.statut, color: 'bg-quai-light text-quai-muted' }
              return (
                <div key={s.statut} className="text-center p-3 bg-quai-light rounded-xl border border-quai-border">
                  <div className="text-xl font-bold text-quai-navy">{s.cnt}</div>
                  <div className={`badge ${info.color} mt-1.5 text-xs`}>{info.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, variant, onClick }) {
  const styles = {
    navy:    'bg-quai-navy text-white',
    gold:    'bg-quai-gold text-quai-navy',
    light:   'bg-white border border-quai-border text-quai-navy',
    success: 'bg-emerald-600 text-white',
  }
  return (
    <div
      className={`rounded-xl p-5 flex items-center gap-4 ${styles[variant]} ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
      onClick={onClick}
      {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {})}
    >
      <Icon name={icon} size="xl" className="opacity-80" />
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs opacity-70 mt-0.5">{label}</div>
      </div>
    </div>
  )
}
