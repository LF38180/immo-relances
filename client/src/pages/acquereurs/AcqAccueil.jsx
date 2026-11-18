import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/ui/Icon'
import { Chiffre, Titre } from './ui'

// Page d'accueil du Fichier Acquéreurs, sur le modèle de l'opération anciens
// clients : où j'en suis, ce que ça a donné, et le bouton pour commencer.
// L'ordre suit la question qu'on se pose en arrivant : qu'est-ce que j'ai à
// faire maintenant ? Le bouton est donc en haut, sous les appels du jour.
// Pas de compteur « affaires conclues » (cahier, section 6).
export default function AcqAccueil({ onCommencer, onAdmin, estAdmin }) {
  const { user } = useAuth()
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/accueil').then(r => setD(r.data)).catch(() => setD({})) }, [])
  if (!d) return <p className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</p>
  const jour = (s) => s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  const appeles = (d.contacts || 0) - (d.jamais_appeles || 0)
  const pct = d.contacts ? Math.round((appeles / d.contacts) * 100) : 0
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      {/* Bandeau : le titre, la progression du fichier, l'action du jour */}
      <section className="bg-quai-encre text-white rounded-2xl p-5 overflow-hidden">
        {/* Le logo de la mission, sur son marine d'origine (celui du bandeau). */}
        <img src="/marque/mission-acquereurs-large-bleu.png" alt="Mission Acquéreurs" className="h-20 w-auto -ml-5 -mt-3" />
        <h1 className="font-display text-2xl font-semibold mt-1">Bonjour {user?.prenom}</h1>
        <p className="text-sm text-white/70 mt-1 leading-snug">On remet à jour les projets d’achat qui dorment dans Modelo, un appel à la fois.</p>

        <div className="mt-4 flex items-end gap-4 flex-wrap">
          <div>
            <div className="font-display text-5xl font-semibold text-quai-gold leading-none">{d.a_appeler ?? '–'}</div>
            <div className="text-xs text-white/70 mt-1">appel{d.a_appeler > 1 ? 's' : ''} à faire aujourd’hui</div>
          </div>
          <div className="text-xs text-white/70 space-y-0.5 pb-1">
            <div><b className="text-white">{d.rappels_dus || 0}</b> rappel{d.rappels_dus > 1 ? 's' : ''} convenu{d.rappels_dus > 1 ? 's' : ''}</div>
            <div><b className="text-white">{d.en_attente || 0}</b> sans réponse en attente{d.en_attente > 0 && d.prochain_retour ? `, le premier revient ${jour(d.prochain_retour)}` : ''}</div>
          </div>
        </div>

        <button onClick={onCommencer}
          className="mt-4 w-full min-h-[3.25rem] rounded-xl bg-quai-gold text-quai-navy font-semibold text-base inline-flex items-center justify-center gap-2 hover:bg-quai-goldlt transition-colors">
          <Icon name="phone" size="sm" /> {d.a_appeler > 0 ? 'Commencer les appels' : 'Voir ma liste'}
        </button>

        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-white/60 mb-1">
            <span>{appeles} personne{appeles > 1 ? 's' : ''} déjà appelée{appeles > 1 ? 's' : ''} sur {d.contacts ?? 0}</span><span>{pct} %</span>
          </div>
          <div className="h-1.5 bg-white/15 rounded-full overflow-hidden"><div className="h-full bg-quai-gold rounded-full" style={{ width: `${pct}%` }} /></div>
        </div>
      </section>

      {d.texte
        ? <section className="bg-white border-l-4 border-quai-gold rounded-r-xl px-4 py-3 text-sm text-quai-text whitespace-pre-line leading-relaxed">{d.texte}</section>
        : estAdmin && <p className="text-[11px] text-quai-muted text-center">Le texte de présentation se rédige dans Mission Acquéreurs › Paramètres › Scripts.</p>}

      <section>
        <Titre>Ce que ça a donné</Titre>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Chiffre valeur={d.joints} libelle="personnes jointes" icon="phone-call" />
          <Chiffre valeur={d.requalifies} libelle="requalifiés" icon="check-circle-2" />
          <Chiffre valeur={d.estimations_acceptees} libelle={`estimations calées${d.estimations_proposees ? ` (${d.estimations_proposees} proposées)` : ''}`} icon="calendar-check" />
          <Chiffre valeur={d.courtage_accords} libelle={`rendez-vous courtage${d.courtage_proposes ? ` (${d.courtage_proposes} proposés)` : ''}`} icon="users" />
        </div>
      </section>

      <section>
        <Titre>Le fichier</Titre>
        <div className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border text-sm">
          {[['Contacts dans le fichier', d.contacts], ['Projets d’achat dans Modelo', d.projets], ['Projets remis à jour', d.projets_gardes],
            ['Fiches en double ou périmées, à archiver', d.fiches_nettoyees], ['Vendeurs repérés', d.vendeurs]].map(([l, n]) => (
            <div key={l} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-quai-muted">{l}</span><b className="text-quai-navy font-display text-lg">{n ?? '–'}</b>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Titre>Dans Modelo</Titre>
        <div className="grid grid-cols-2 gap-2">
          <Chiffre valeur={d.reportes_modelo} libelle="contacts reportés dans Modelo" icon="file-check" />
          <Chiffre valeur={d.en_attente_modelo} libelle="contacts en attente de report" icon="file-up" />
        </div>
        {d.a_reporter != null && (d.a_reporter > 0 || d.a_valider > 0) && (
          <button onClick={onAdmin} className="mt-2 w-full text-left rounded-xl border border-amber-300 bg-amber-50 text-quai-navy px-4 py-3 text-sm flex items-center gap-3">
            <Icon name="alert-triangle" size="sm" className="text-amber-700 shrink-0" />
            <span className="flex-1">
              {d.a_valider > 0 && <span className="block"><b>{d.a_valider}</b> archivage{d.a_valider > 1 ? 's' : ''} à valider</span>}
              {d.a_reporter > 0 && <span className="block"><b>{d.a_reporter}</b> contact{d.a_reporter > 1 ? 's' : ''} à reporter dans Modelo</span>}
            </span>
            <Icon name="chevron-right" size="sm" className="text-quai-muted shrink-0" />
          </button>
        )}
      </section>
    </div>
  )
}
