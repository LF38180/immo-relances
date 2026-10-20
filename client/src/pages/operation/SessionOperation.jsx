import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import EcranAppel from './EcranAppel'

// Session d'appel enchaînée, sur le modèle de celle de Chrystelle : un contact
// plein écran, on appelle, on note, on passe au suivant. Pas de liste, pas de
// choix entre deux appels.
//
// C'est ce qui fait la différence sur 149 appels : aucune décision à prendre
// entre deux fiches, et personne n'est sauté.
export default function SessionOperation() {
  const [file, setFile] = useState([])
  const [infos, setInfos] = useState(null)
  const [index, setIndex] = useState(0)
  const [fini, setFini] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(false)
  const [bilan, setBilan] = useState({ faits: 0, joints: 0, rdv: 0, adresses: 0, sansReponse: 0 })
  const [listeOuverte, setListeOuverte] = useState(false)

  const charger = useCallback(() => {
    setChargement(true)
    api.get('/operation/file')
      .then(r => {
        setFile(r.data.file)
        setInfos(r.data)
        setIndex(0)
        setFini(false)
      })
      .catch(() => { setErreur(true); toast.error('Chargement impossible') })
      .finally(() => setChargement(false))
  }, [])

  useEffect(() => { charger() }, [charger])

  const contact = file[index]

  // Après un appel enregistré : on avance. La fiche traitée reste dans la file
  // locale — la recharger ferait perdre la place de l'agent.
  const suivant = (resume) => {
    setBilan(b => ({
      faits: b.faits + 1,
      joints: b.joints + (resume.issue === 'JOINT' ? 1 : 0),
      rdv: b.rdv + (resume.rdv ? 1 : 0),
      adresses: b.adresses + (resume.adresse ? 1 : 0),
      sansReponse: b.sansReponse + (['PAS_DE_REPONSE', 'REPONDEUR'].includes(resume.issue) ? 1 : 0),
    }))
    if (index + 1 >= file.length) setFini(true)
    else setIndex(i => i + 1)
  }

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger votre liste d’appels.</p>
  if (chargement) return <p className="p-6 text-quai-muted">Chargement…</p>

  if (fini || !file.length) return (
    <Termine bilan={bilan} vide={!file.length} onRecharger={charger} />
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Progression
        index={index} total={file.length} bilan={bilan}
        plage={infos?.plage}
        onListe={() => setListeOuverte(true)}
      />

      <EcranAppel
        key={contact.id_modelo}
        contact={contact}
        onEnregistre={suivant}
        onPasser={() => (index + 1 >= file.length ? setFini(true) : setIndex(i => i + 1))}
      />

      {/* La liste reste accessible : un agent veut parfois choisir qui il
          rappelle, par exemple avant un rendez-vous. Mais ce n'est pas la vue
          par défaut. */}
      {listeOuverte && (
        <Liste file={file} index={index}
          onChoisir={i => { setIndex(i); setListeOuverte(false) }}
          onFermer={() => setListeOuverte(false)} />
      )}
    </div>
  )
}

function Progression({ index, total, bilan, plage, onListe }) {
  const pct = Math.round((index / total) * 100)
  return (
    <div className="bg-white border-b border-quai-border px-3 py-2 shrink-0">
      {/* Alignée sur la colonne de contenu : sur un écran large, un compteur
          collé au bord gauche et des chiffres à l'autre bout se lisent mal. */}
      <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
        <span className="text-quai-muted">
          Appel <b className="text-quai-navy">{index + 1}</b> / {total}
        </span>
        <div className="flex items-center gap-2.5 text-[11px]">
          {bilan.rdv > 0 && (
            <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
              <Icon name="calendar-check" size="sm" />{bilan.rdv}
            </span>
          )}
          {bilan.adresses > 0 && (
            <span className="text-quai-navy font-medium inline-flex items-center gap-1">
              <Icon name="map-pin" size="sm" />{bilan.adresses}
            </span>
          )}
          {bilan.faits > 0 && <span className="text-quai-muted">{bilan.faits} fait{bilan.faits > 1 ? 's' : ''}</span>}
          <button onClick={onListe} className="text-quai-muted hover:text-quai-navy p-1" aria-label="Voir la liste">
            <Icon name="table" size="sm" />
          </button>
        </div>
      </div>
      <div className="h-1.5 bg-quai-border rounded-full overflow-hidden">
        <div className="h-full bg-quai-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      {plage && !plage.ok && (
        <div className="text-[11px] text-amber-800 mt-1.5 leading-snug">
          <Icon name="alert-triangle" size="sm" className="inline mr-0.5" />{plage.raison}
        </div>
      )}
      </div>
    </div>
  )
}

function Termine({ bilan, vide, onRecharger }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-quai-light">
      <div className="text-center max-w-sm">
        <Icon name="trophy" size="xl" className="text-quai-gold mx-auto mb-3" />
        <h2 className="text-xl font-display font-bold text-quai-navy">
          {vide ? 'Personne à appeler' : 'Série terminée'}
        </h2>
        {!vide && (
          <div className="grid grid-cols-2 gap-2 my-5">
            <Chiffre valeur={bilan.faits} libelle="appels passés" />
            <Chiffre valeur={bilan.joints} libelle="personnes jointes" couleur="text-emerald-600" />
            <Chiffre valeur={bilan.rdv} libelle="actualisations calées" couleur="text-quai-gold" />
            <Chiffre valeur={bilan.adresses} libelle="adresses récupérées" />
          </div>
        )}
        {vide && <p className="text-sm text-quai-muted mt-1 mb-5">Votre liste est à jour.</p>}
        <button onClick={onRecharger} className="btn-primary inline-flex items-center gap-2">
          <Icon name="refresh-cw" size="sm" /> Recharger la liste
        </button>
      </div>
    </div>
  )
}

function Chiffre({ valeur, libelle, couleur = 'text-quai-navy' }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className={`text-2xl font-bold tabular-nums ${couleur}`}>{valeur}</div>
      <div className="text-[11px] text-quai-muted leading-snug">{libelle}</div>
    </div>
  )
}

// La liste complète, en secours. Permet de sauter directement à quelqu'un.
function Liste({ file, index, onChoisir, onFermer }) {
  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div className="bg-white w-full md:max-w-lg h-[85vh] md:h-auto md:max-h-[85vh]
                      rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-quai-border flex items-center justify-between">
          <span className="font-semibold text-quai-navy text-sm">Toute la liste ({file.length})</span>
          <button onClick={onFermer} className="text-quai-muted hover:text-quai-navy p-1">
            <Icon name="x" size="sm" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-quai-border/60">
          {file.map((c, i) => (
            <button key={c.id_modelo} onClick={() => onChoisir(i)}
              className={`w-full text-left px-4 py-2.5 hover:bg-quai-light transition-colors ${
                i === index ? 'bg-quai-gold/10' : ''} ${i < index ? 'opacity-50' : ''}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-quai-muted w-6 shrink-0 tabular-nums">{i + 1}</span>
                <span className="text-sm text-quai-navy flex-1 truncate">
                  {c.civilite} {c.prenom} {c.nom}
                </span>
                {c.objectif_principal === 'ADRESSE' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold/25 text-quai-navy">adresse</span>
                )}
              </div>
              <div className="text-[11px] text-quai-muted pl-8">{c.commune}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
