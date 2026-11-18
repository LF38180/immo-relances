import { useState, useEffect } from 'react'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

// Page d'accueil du Fichier Acquéreurs, sur le modèle de l'opération anciens
// clients : où j'en suis, ce que ça a donné, et le bouton pour commencer.
// Pas de compteur « affaires conclues » (cahier, section 6).
function Chiffre({ valeur, libelle, accent }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${accent ? 'border-quai-gold bg-quai-gold/10' : 'border-quai-border bg-white'}`}>
      <div className="text-2xl font-bold text-quai-navy">{valeur ?? '–'}</div>
      <div className="text-[11px] text-quai-muted leading-snug">{libelle}</div>
    </div>
  )
}
const Titre = ({ children }) => <div className="text-[11px] font-semibold text-quai-muted uppercase tracking-wide mb-1.5">{children}</div>

export default function AcqAccueil({ onCommencer, onAdmin, estAdmin }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/accueil').then(r => setD(r.data)).catch(() => setD({})) }, [])
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  const jour = (s) => s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="text-center pt-2">
        <div className="w-16 h-16 rounded-xl bg-quai-navy grid place-items-center mx-auto mb-3"><Icon name="users" size="lg" className="text-quai-gold" /></div>
        <h1 className="font-display text-2xl font-bold text-quai-navy">Fichier Acquéreurs</h1>
        <p className="text-sm text-quai-muted mt-1">On remet à jour les projets d’achat qui dorment dans Modelo, un appel à la fois.</p>
      </div>

      {d.texte
        ? <div className="bg-white border border-quai-border rounded-xl p-4 text-sm text-quai-text whitespace-pre-line leading-relaxed">{d.texte}</div>
          : estAdmin && <p className="text-[11px] text-quai-muted text-center">Le texte de présentation se rédige dans Mission Acquéreurs › Paramètres › Scripts.</p>}

      <div>
        <Titre>Aujourd’hui</Titre>
        <div className="grid grid-cols-3 gap-2">
          <Chiffre valeur={d.a_appeler} libelle="appels à faire" accent />
          <Chiffre valeur={d.rappels_dus} libelle="rappels convenus à faire" />
          <Chiffre valeur={d.en_attente} libelle="sans réponse en attente" />
        </div>
        {d.en_attente > 0 && d.prochain_retour && <p className="text-[11px] text-quai-muted mt-1">Le premier sans-réponse revient {jour(d.prochain_retour)}.</p>}
      </div>

      <div>
        <Titre>Le fichier</Titre>
        <div className="grid grid-cols-3 gap-2">
          <Chiffre valeur={d.contacts} libelle="contacts" />
          <Chiffre valeur={d.projets} libelle="projets d’achat dans Modelo" />
          <Chiffre valeur={d.jamais_appeles} libelle="jamais appelés" />
        </div>
      </div>

      <div>
        <Titre>Ce que ça a donné</Titre>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Chiffre valeur={d.joints} libelle="personnes jointes" />
          <Chiffre valeur={d.requalifies} libelle="requalifiés" />
          <Chiffre valeur={d.projets_gardes} libelle="projets à jour" />
          <Chiffre valeur={d.fiches_nettoyees} libelle="fiches en double ou périmées" />
          <Chiffre valeur={d.vendeurs} libelle="vendeurs repérés" />
          <Chiffre valeur={d.estimations_acceptees} libelle={`estimations calées${d.estimations_proposees ? ` (${d.estimations_proposees} proposées)` : ''}`} />
          <Chiffre valeur={d.courtage_accords} libelle={`rendez-vous courtage${d.courtage_proposes ? ` (${d.courtage_proposes} proposés)` : ''}`} />
        </div>
      </div>

      <div>
        <Titre>Dans Modelo</Titre>
        <div className="grid grid-cols-2 gap-2">
          <Chiffre valeur={d.reportes_modelo} libelle="contacts reportés dans Modelo" />
          <Chiffre valeur={d.en_attente_modelo} libelle="contacts en attente de report" />
        </div>
      </div>

      {d.a_reporter != null && (
        <button onClick={onAdmin} className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm ${d.a_reporter || d.a_valider ? 'border-amber-300 bg-amber-50 text-quai-navy' : 'border-quai-border bg-white text-quai-muted'}`}>
          {d.a_valider > 0 && <div><b>{d.a_valider}</b> archivage{d.a_valider > 1 ? 's' : ''} à valider</div>}
          {d.a_reporter > 0 ? <div><b>{d.a_reporter}</b> contact{d.a_reporter > 1 ? 's' : ''} avec du nouveau à reporter dans Modelo <span className="text-quai-muted">· Administration</span></div> : <div>Modelo à jour : rien à reporter.</div>}
        </button>
      )}

      <button onClick={onCommencer} className="btn-primary w-full min-h-[3.25rem] text-base inline-flex items-center justify-center gap-2">
        <Icon name="phone" size="sm" /> {d.a_appeler > 0 ? 'Commencer les appels' : 'Voir ma liste'}
      </button>
    </div>
  )
}
