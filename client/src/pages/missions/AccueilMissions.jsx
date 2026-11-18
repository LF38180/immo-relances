import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import { ONGLETS } from './onglets'
import { Titre } from '../acquereurs/ui'

// L'accueil de l'admin : une carte par mission, toutes au même rang. Chaque
// carte donne la personne, trois chiffres du jour, et les mêmes cinq accès.
// Le chiffre du milieu — ce qui reste à appeler — est celui qu'on regarde le
// matin : il est mis en avant.
const LOGOS = { estimes: '/marque/mission-estimes-large-bleu.png', acquereurs: '/marque/mission-acquereurs-large-bleu.png', courtage: '/marque/mission-courtage-large-bleu.png' }

export default function AccueilMissions({ onOuvrir }) {
  const { user } = useAuth()
  const [d, setD] = useState(null)
  const [erreur, setErreur] = useState(null)
  useEffect(() => {
    api.get('/admin/missions').then(r => setD(r.data)).catch(e => setErreur(e.messageLisible || 'Chargement impossible.'))
  }, [])
  const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-semibold text-quai-navy">Bonjour {user?.prenom}</h1>
          <div className="mt-1.5 w-10 h-0.5 bg-quai-gold" />
          <p className="text-sm text-quai-muted mt-2 first-letter:uppercase">{jour}. Voici où en est chaque mission.</p>
        </div>

        <Titre>Les missions</Titre>
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        {!d && !erreur && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => <div key={i} className="h-56 rounded-2xl bg-white border border-quai-border animate-pulse" />)}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(d?.missions || []).map(m => (
            <section key={m.id} className="bg-white border border-quai-border rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              {/* Le logo de la mission, sur son fond marine d'origine. */}
              <button onClick={() => onOuvrir(m.id)} className="text-left text-white pr-4 flex items-center gap-2 group bg-quai-encre">
                {LOGOS[m.id]
                  ? <img src={LOGOS[m.id]} alt={m.titre} className="h-20 w-auto shrink-0" />
                  : <span className="flex items-center gap-3 pl-4 py-3.5 min-w-0"><img src="/operation/sceau-badge.png" alt="" className="w-11 h-11 rounded shrink-0" /><span className="font-display font-semibold text-lg leading-tight">{m.titre}</span></span>}
                <span className="flex-1" />
                <Icon name="chevron-right" size="sm" className="text-white/40 group-hover:text-quai-taupe shrink-0" />
              </button>
              <div className="px-4 py-2 text-xs text-quai-muted border-b border-quai-border truncate">
                <Icon name="user" size="sm" className="inline mr-1 -mt-0.5 text-quai-taupe" />{m.qui.length ? m.qui.join(', ') : 'Personne pour l’instant'}
              </div>

              <div className="grid grid-cols-3 divide-x divide-quai-border border-b border-quai-border">
                {m.chiffres.map((c, i) => (
                  <div key={c.l} className={`px-3 py-3.5 ${i === 1 ? 'bg-quai-gold/10' : ''}`}>
                    <div className="font-display text-3xl font-semibold text-quai-navy leading-none">{c.n}</div>
                    <div className="text-[11px] text-quai-muted leading-snug mt-1.5">{c.l}</div>
                  </div>
                ))}
              </div>

              <div className="p-3 flex flex-wrap gap-1.5 mt-auto">
                {m.id === 'operation'
                  ? <button onClick={() => onOuvrir('operation')} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="arrow-right" size="sm" /> Ouvrir l’opération</button>
                  : ONGLETS.map(o => (
                    <button key={o.id} onClick={() => onOuvrir(m.id, o.id)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-quai-border text-quai-navy hover:border-quai-gold hover:bg-quai-light inline-flex items-center gap-1.5 transition-colors">
                      <Icon name={o.icon} size="sm" className="text-quai-muted" /> {o.label}
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-7"><Titre>Toute l’appli</Titre></div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {[['utilisateurs', 'Utilisateurs et missions', 'Les comptes, et qui fait quoi', 'user'],
            ['activite', 'Activité', 'Qui a fait quoi, et quand', 'history'],
            ['donnees', 'Données et sauvegardes', 'Sauvegardes, corbeille', 'database']].map(([id, l, aide, ic]) => (
            <button key={id} onClick={() => onOuvrir(id)} className="bg-white border border-quai-border rounded-xl px-4 py-3 text-left hover:border-quai-gold transition-colors flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-quai-light grid place-items-center shrink-0"><Icon name={ic} size="sm" className="text-quai-navy" /></span>
              <span className="min-w-0"><span className="block text-sm font-medium text-quai-navy">{l}</span><span className="block text-xs text-quai-muted truncate">{aide}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
