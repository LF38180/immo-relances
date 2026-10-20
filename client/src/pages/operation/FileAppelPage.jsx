import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import FicheAppel from './FicheAppel'

// La file d'appel du conseiller : ce qu'il lui reste à faire, dans l'ordre.
//
// L'ordre vient du contrat : les rappels promis d'abord (un rendez-vous
// téléphonique manqué annule le bénéfice de l'appel précédent), puis les
// fiches dont l'objectif est de récupérer une adresse — les plus longues et
// les plus urgentes — puis le reste.

const GROUPES = [
  ['rappels_dus', 'Rappels promis', 'Ils attendent votre appel à l’heure dite'],
  ['adresse_jamais_appeles', 'Adresse à récupérer', 'Ils n’ont pas reçu le courrier : l’adresse est l’objectif'],
  ['jamais_appeles', 'Jamais appelés', null],
  ['a_relancer', 'À relancer', 'Sans réponse depuis plus de 48 h, à une autre heure'],
  ['a_revoir', 'À revoir', null],
]

export default function FileAppelPage() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [ouverte, setOuverte] = useState(null)   // id_modelo de la fiche ouverte

  const charger = () => api.get('/operation/file')
    .then(r => setData(r.data))
    .catch(() => { setErreur(true); toast.error('Chargement impossible') })

  useEffect(() => { charger() }, [])

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger votre file d’appel.</p>
  if (!data) return <p className="p-6 text-quai-muted">Chargement…</p>

  const { file, compteurs, groupes, plage } = data

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">

        <Entete compteurs={compteurs} plage={plage} />

        {!file.length && (
          <div className="bg-white border border-quai-border rounded-xl p-8 text-center">
            <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-3" />
            <p className="font-medium text-quai-navy">Votre liste est à jour.</p>
            <p className="text-sm text-quai-muted mt-1">
              Plus personne à appeler pour le moment.
            </p>
          </div>
        )}

        {GROUPES.map(([cle, titre, aide]) => {
          const n = groupes[cle] || 0
          if (!n) return null
          const debut = GROUPES.slice(0, GROUPES.findIndex(g => g[0] === cle))
            .reduce((s, g) => s + (groupes[g[0]] || 0), 0)
          // La file est déjà ordonnée côté serveur ; on la redécoupe pour
          // l'affichage, mais sans la réordonner.
          const lot = file.filter(c => {
            const i = file.indexOf(c)
            return i >= debut && i < debut + n
          })
          if (!lot.length) return null
          return (
            <section key={cle}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h2 className="text-sm font-semibold text-quai-navy">{titre}</h2>
                <span className="text-xs text-quai-muted">{lot.length}</span>
              </div>
              {aide && <p className="text-[11px] text-quai-muted mb-1.5 leading-snug">{aide}</p>}
              <div className="space-y-1.5">
                {lot.map(c => (
                  <CarteContact key={c.id_modelo} contact={c} onOuvrir={() => setOuverte(c.id_modelo)} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {ouverte && (
        <FicheAppel
          idModelo={ouverte}
          onFermer={() => setOuverte(null)}
          onEnregistre={() => { charger() }}
        />
      )}
    </div>
  )
}

function Entete({ compteurs, plage }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <img src="/operation/sceau-badge.png" alt="" className="w-11 h-11 rounded shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold text-quai-navy leading-tight">
            Opération anciens clients
          </h1>
          <p className="text-xs text-quai-muted">
            <b className="text-quai-navy">{compteurs.restants}</b> à appeler
            {compteurs.clos > 0 && <> · {compteurs.clos} clos</>}
            {' · '}{compteurs.portefeuille} au total
          </p>
        </div>
      </div>

      {/* Les plages légales sont rappelées, jamais imposées : le conseiller
          connaît la règle et en répond. */}
      {!plage.ok && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
          <Icon name="alert-triangle" size="sm" className="inline mr-1" />
          {plage.raison}
        </div>
      )}
    </div>
  )
}

function CarteContact({ contact: c, onOuvrir }) {
  const tel = c.tel_portable || c.tel_fixe
  const grave = (c.avertissements || []).find(a => a.niveau === 'grave')

  return (
    <div className={`bg-white border rounded-xl p-3 ${grave ? 'border-amber-300' : 'border-quai-border'}`}>
      <div className="flex items-start gap-3">
        <button onClick={onOuvrir} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-quai-navy">
              {c.civilite} {c.prenom} {c.nom}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-navy text-white font-medium">
              script {c.script}
            </span>
            {c.objectif_principal === 'ADRESSE' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold/25 text-quai-navy font-medium">
                adresse
              </span>
            )}
          </div>

          {c.entete?.prenom_a_dire && (
            <div className="text-xs text-quai-navy mt-0.5">
              Dossier suivi avant par <b>{c.entete.prenom_a_dire}</b>
            </div>
          )}

          <div className="text-[11px] text-quai-muted mt-0.5">
            {c.commune}
            {c.appels_total > 0 && <> · {c.appels_total} appel{c.appels_total > 1 ? 's' : ''}</>}
          </div>

          {grave && (
            <div className="text-[11px] text-amber-800 mt-1.5 leading-snug">
              <Icon name="alert-triangle" size="sm" className="inline mr-0.5" /> {grave.texte}
            </div>
          )}
        </button>

        {/* Le numéro est cliquable : sur un téléphone, c'est l'appel qui part. */}
        {tel && (
          <a href={`tel:${tel}`}
            className="shrink-0 w-11 h-11 rounded-full bg-quai-navy text-white grid place-items-center
                       hover:bg-quai-navymd transition-colors"
            aria-label={`Appeler ${c.prenom} ${c.nom}`}>
            <Icon name="phone" size="sm" />
          </a>
        )}
      </div>
    </div>
  )
}
