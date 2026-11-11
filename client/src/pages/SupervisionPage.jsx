import { useState, useEffect } from 'react'
import api from '../utils/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import { DashboardCourtageContenu } from './CourtagePage'
import toast from 'react-hot-toast'
import { blocCourant } from '../utils/blocCourant'
import ChoixPeriode, { enParametres, periodeEnClair } from '../components/ChoixPeriode'

// Les libellés des résultats d'appel, comme dans la session et l'export.
const LIBELLE_ISSUE = {
  sans_reponse: 'Pas de réponse', projet: 'Projet (estimation, RDV…)', rappel: 'À recontacter plus tard',
  demenage: "N'habite plus à l'adresse", sans_projet: 'Plus de projet', autre: 'Autre',
}

export default function SupervisionPage() {
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('')
  const [periode, setPeriode] = useState({ jours: 30 })
  const [courtage, setCourtage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  // Chaque chargement est indépendant : une liste refusée ne bloque plus l'écran.
  // Avant, la liste des comptes (réservée à l'admin) faisait échouer tout le
  // chargement pour un manager, qui restait sur « Chargement… ».
  const load = async () => {
    try {
      const sup = await api.get('/admin/supervision')
      setData(sup.data); setErreur(null)
    } catch (err) { setErreur(err.messageLisible || 'Chargement impossible.') }
    finally { setLoading(false) }
    api.get('/admin/agents').then(r => setAgents(r.data.filter(u => u.role === 'agent'))).catch(() => {})
    // Indicateurs courtage (lecture seule) — section masquée en cas d'erreur.
    api.get('/courtage/dashboard').then(c => setCourtage(c.data)).catch(() => setCourtage(null))
  }
  const chargerSuivi = () => api.get('/relances/stats', { params: { ...enParametres(periode), ...(agentId ? { agent_id: agentId } : {}) }, timeout: 60000 })
    .then(r => setStats(r.data)).catch(err => toast.error(err.messageLisible || 'Suivi indisponible'))

  useEffect(() => { load() }, [])
  useEffect(() => { chargerSuivi() }, [agentId, JSON.stringify(periode)])
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const exporter = async () => {
    try {
      const r = await api.get('/relances/stats', { params: { ...enParametres(periode), ...(agentId ? { agent_id: agentId } : {}), format: 'csv' }, responseType: 'blob', timeout: 60000 })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = `suivi-${stats?.periode?.debut || ''}-${stats?.periode?.fin || ''}.csv`; a.click(); URL.revokeObjectURL(url)
    } catch (err) { toast.error(err.messageLisible || 'Export impossible') }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center bg-quai-light text-quai-muted animate-pulse">Chargement…</div>

  const t = stats?.totaux
  const avant = stats?.precedente
  const taux = (x) => (x?.appels > 0 ? Math.round(x.appels_aboutis / x.appels * 100) : 0)
  // Écart avec la période précédente de même longueur : « +12 » ou « −3 ».
  const ecart = (cle) => {
    if (!avant || !t) return null
    const d = t[cle] - avant[cle]
    return d === 0 ? 'comme la période précédente' : `${d > 0 ? '+' : '−'}${Math.abs(d)} par rapport à la période précédente`
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Supervision">
          <button onClick={() => { load(); chargerSuivi() }} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="refresh-cw" size="sm" /> Actualiser</button>
        </PageHeader>
        {erreur && <div className="card mb-4 text-sm text-quai-navy">{erreur}</div>}

        <h2 className="font-semibold text-quai-navy mb-3">Activité aujourd'hui — {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {data?.activite?.map(a => {
            const tx = a.relances_total > 0 ? Math.round((a.contactes + a.rdv) / a.relances_total * 100) : 0
            return (
              <div key={a.id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-quai-navy rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {a.prenom?.[0]}{a.nom?.[0]}
                  </div>
                  <div className="font-semibold text-quai-navy">{a.prenom} {a.nom}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.relances_total}</div>
                    <div className="text-xs text-quai-muted">Appels</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded p-2">
                    <div className="text-xl font-bold text-emerald-700">{a.rdv}</div>
                    <div className="text-xs text-quai-muted">Projets</div>
                  </div>
                  <div className="bg-quai-light border border-quai-border rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{a.contactes}</div>
                    <div className="text-xs text-quai-muted">Contactés</div>
                  </div>
                  <div className="bg-quai-gold/10 border border-quai-gold/30 rounded p-2">
                    <div className="text-xl font-bold text-quai-navy">{tx}%</div>
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

        {/* Suivi sur la durée qu'on veut : semaine, mois, année, depuis le début, ou deux dates. */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-quai-navy">Suivi {stats?.periode ? periodeEnClair(stats.periode) : ''}</h2>
            <p className="text-xs text-quai-muted">
              {blocCourant() ? 'Fichier choisi en haut de l\'écran uniquement. ' : ''}Seuls les appels comptent, pas les notes ajoutées à une fiche.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto text-sm" value={agentId} onChange={e => setAgentId(e.target.value)} aria-label="Personne">
              <option value="">Toute l'équipe</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
            </select>
            <ChoixPeriode valeur={periode} onChange={setPeriode} />
            <button onClick={exporter} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="download" size="sm" /> Exporter</button>
          </div>
        </div>

        {stats && t && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Appels passés" value={t.appels.toLocaleString('fr')} detail={ecart('appels')} />
              <StatCard label="Personnes jointes" value={t.personnes_jointes.toLocaleString('fr')} detail={`${taux(t)} % des appels aboutissent`} />
              <StatCard label="Projets détectés" value={t.projets.toLocaleString('fr')} detail={ecart('projets')} />
              <StatCard label="Rappels promis en retard" value={stats.rappelsEnRetard} detail={`aujourd'hui · ${stats.jamaisAppelees.toLocaleString('fr')} fiche${stats.jamaisAppelees > 1 ? 's' : ''} jamais appelée${stats.jamaisAppelees > 1 ? 's' : ''}`} alerte={stats.rappelsEnRetard > 0} />
            </div>

            {stats.parPersonne?.length > 0 && (
              <div className="card mb-6 overflow-x-auto">
                <h3 className="font-medium text-quai-navy mb-3">Par personne</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-quai-muted border-b border-quai-border">
                    <th className="py-2 pr-3">Personne</th><th className="pr-3">Appels</th><th className="pr-3">Personnes jointes</th>
                    <th className="pr-3">Taux de contact</th><th>Projets</th>
                  </tr></thead>
                  <tbody className="divide-y divide-quai-border">
                    {stats.parPersonne.map(p => (
                      <tr key={p.id}>
                        <td className="py-2 pr-3 font-medium text-quai-navy whitespace-nowrap">{p.prenom} {p.nom}</td>
                        <td className="pr-3">{p.appels}</td>
                        <td className="pr-3">{p.personnes_jointes}</td>
                        <td className="pr-3">{taux(p)} %</td>
                        <td className="font-semibold text-quai-navy">{p.projets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="card">
              <h3 className="font-medium text-quai-navy mb-3">Résultats des appels</h3>
              {stats.parIssue?.length ? (
                <div className="space-y-2">
                  {[...stats.parIssue].sort((x, y) => y.cnt - x.cnt).map(s => (
                    <div key={s.issue} className="flex items-center gap-3">
                      <div className="w-28 sm:w-48 text-sm text-quai-muted">{LIBELLE_ISSUE[s.issue] || s.issue}</div>
                      <div className="flex-1 bg-quai-border rounded-full h-4 overflow-hidden">
                        <div className="h-full bg-quai-navy rounded-full" style={{ width: `${Math.min(100, (s.cnt / Math.max(1, t.appels)) * 100)}%` }} />
                      </div>
                      <div className="w-12 text-sm text-right font-medium text-quai-navy">{s.cnt}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-quai-muted">Aucun appel sur cette période.</p>}
            </div>
          </>
        )}

        {courtage && (
          <div className="mt-8">
            <h2 className="font-semibold text-quai-navy mb-3">Courtage — Marine</h2>
            <DashboardCourtageContenu data={courtage} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, detail, alerte }) {
  return (
    <div className="card text-center">
      <div className={`text-2xl font-bold ${alerte ? 'text-amber-700' : 'text-quai-navy'}`}>{value}</div>
      <div className="text-xs text-quai-muted mt-1">{label}</div>
      {detail && <div className="text-xs text-quai-muted mt-1">{detail}</div>}
    </div>
  )
}
