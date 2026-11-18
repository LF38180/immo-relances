import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../utils/api'
import { CATEGORIES, STATUTS } from '../utils/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import PageHeader from '../components/ui/PageHeader'
import ChoixPeriode, { enParametres, periodeEnClair } from '../components/ChoixPeriode'
import { Chiffre, Initiales } from '../components/ui/Briques'

const PIE_COLORS = ['#0D0D2B','#C9A96E','#2d2d6b','#e8c98a','#1a1a4e','#B6A997']

// `onVoir` : fourni par l'espace de l'admin, il rend les quatre cases
// cliquables (vers les contacts, le suivi par personne…). Sans lui, l'écran
// est celui de toujours.
export default function DashboardPage({ onNavigate, onVoir = null }) {
  const [stats, setStats] = useState(null)
  // La période n'est plus plafonnée à 90 jours : 6 mois, 12 mois, depuis le
  // début, ou deux dates au choix.
  const [periode, setPeriode] = useState({ jours: 7 })
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  const charger = () => {
    setLoading(true); setErreur(null)
    api.get('/relances/stats', { params: enParametres(periode), timeout: 60000 })
      .then(r => setStats(r.data))
      .catch(err => setErreur(err.messageLisible || 'Chargement impossible.'))
      .finally(() => setLoading(false))
  }
  useEffect(charger, [JSON.stringify(periode)])

  if (loading && !stats) return (
    <div className="flex-1 flex items-center justify-center bg-quai-light">
      <div className="text-quai-muted animate-pulse text-sm">Chargement…</div>
    </div>
  )
  // Avant : une erreur de réseau laissait une page blanche.
  if (!stats) return (
    <div className="flex-1 flex items-center justify-center bg-quai-light p-6">
      <div className="card max-w-sm text-center">
        <p className="text-sm text-quai-navy mb-3">{erreur || 'Chargement impossible.'}</p>
        <button onClick={charger} className="btn-primary">Réessayer</button>
      </div>
    </div>
  )

  // Trois cartes sur quatre suivent le menu de période et ne comptent que ce que
  // la personne voit (ses propres appels si elle est agente). Avant : le taux
  // oubliait les personnes jointes qui demandaient un rappel, et « RDV obtenus
  // (total) » affichait le stock de toute l'équipe, sans période.
  const t = stats.totaux || {}
  const appels = t.appels ?? stats.totalRelances
  const tauxContact = appels > 0 ? Math.round((t.appels_aboutis || 0) / appels * 100) : 0

  const catData = stats.contactsParCategorie.map(c => ({
    name: CATEGORIES[c.categorie]?.label || c.categorie, value: c.cnt
  }))
  // Au-delà de deux mois le serveur regroupe par semaine, au-delà d'un an par mois.
  const granularite = stats.periode?.granularite || 'jour'
  const parJourData = stats.parJour.map(j => ({
    jour: format(new Date(j.jour + 'T12:00:00'), granularite === 'mois' ? 'MM/yy' : 'dd/MM'), relances: j.cnt
  }))

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-6xl mx-auto">
        <PageHeader subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}>
          <ChoixPeriode valeur={periode} onChange={setPeriode} />
        </PageHeader>

        {erreur && (
          <div className="card mb-4 text-sm text-quai-navy flex items-center justify-between gap-3">
            <span>{erreur} Les chiffres affichés sont ceux de la période précédente.</span>
            <button onClick={charger} className="btn-secondary btn-sm flex-shrink-0">Réessayer</button>
          </div>
        )}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <Chiffre fort libelle="Fiches dans le fichier" valeur={stats.totalContacts.toLocaleString('fr')} icon="users" onClick={onVoir ? () => onVoir('fiches') : undefined} />
          <Chiffre libelle="Appels (période)" valeur={appels} icon="phone" onClick={onVoir ? () => onVoir('appels') : undefined} />
          <Chiffre libelle="Taux de contact (période)" valeur={`${tauxContact}%`} icon="trending-up" onClick={onVoir ? () => onVoir('appels') : undefined} />
          <Chiffre libelle="Projets (période)" valeur={t.projets ?? 0} icon="calendar-check" onClick={onVoir ? () => onVoir('projets') : undefined} />
        </div>

        {stats.parAgent?.length > 0 && (
          <div className="card mb-6">
            <h2 className="font-display font-semibold text-lg text-quai-navy leading-tight mb-4">Activité aujourd'hui</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {stats.parAgent.map(a => (
                <div key={a.id} className="text-center p-4 bg-quai-light rounded-xl border border-quai-border">
                  <div className="flex justify-center mb-2"><Initiales prenom={a.prenom} nom={a.nom} ton="marine" /></div>
                  <div className="font-display text-3xl font-semibold leading-none text-quai-navy mb-1">{a.relances_jour}</div>
                  <div className="text-xs text-quai-muted">{a.prenom} {a.nom}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="card">
            <h2 className="font-display font-semibold text-lg text-quai-navy leading-tight mb-4">Relances par {granularite}</h2>
            {stats.periode && <p className="text-xs text-quai-muted -mt-3 mb-3">{periodeEnClair(stats.periode)}</p>}
            {parJourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={parJourData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DDD6', fontSize: 12 }} />
                  <Bar dataKey="relances" fill="#0D0D2B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-quai-muted text-sm">Aucune donnée sur cette période</div>}
          </div>

          <div className="card">
            <h2 className="font-display font-semibold text-lg text-quai-navy leading-tight mb-4">Répartition par catégorie</h2>
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
          <h2 className="font-display font-semibold text-lg text-quai-navy leading-tight mb-4">Contacts par statut</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {stats.contactsParStatut.map(s => {
              const info = STATUTS[s.statut] || { label: s.statut, color: 'bg-quai-light text-quai-muted' }
              return (
                <div key={s.statut} className="text-center p-3 bg-quai-light rounded-xl border border-quai-border">
                  <div className="font-display text-2xl font-semibold leading-none text-quai-navy">{s.cnt}</div>
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
