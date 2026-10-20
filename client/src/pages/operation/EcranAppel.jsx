import { useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// Un contact, plein écran. L'agent appelle, note, enregistre : le suivant
// s'affiche tout seul. Pas de retour à une liste entre deux appels.
//
// Les étapes du script sont des sections qu'on fait défiler, pas des onglets :
// sur un appel de trois minutes, chercher un onglet fait perdre le fil.

const ISSUES = [
  ['JOINT', 'Joint', 'emerald'],
  ['REPONDEUR', 'Répondeur', null],
  ['PAS_DE_REPONSE', 'Pas de réponse', null],
  ['A_RAPPELER', 'À rappeler', null],
  ['FAUX_NUMERO', 'Faux numéro', null],
  ['ERREUR_IDENTITE', 'Pas la bonne personne', null],
  ['SUIVI_ANCIEN_CONSEILLER', 'Parti avec son conseiller', null],
  ['DECEDE', 'Décédé', null],
  ['REFUS_FERME', 'Refus — ne plus appeler', 'red'],
]

export default function EcranAppel({ contact: c, onEnregistre, onPasser }) {
  const [issue, setIssue] = useState('')
  const [rappelLe, setRappelLe] = useState('')
  const [notes, setNotes] = useState('')
  const [res, setRes] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [scriptOuvert, setScriptOuvert] = useState(false)

  const e = c.entete || {}
  const tel = c.tel_portable || c.tel_fixe
  const cibleAdresse = c.objectif_principal === 'ADRESSE'
  const champ = (k, v) => setRes(r => ({ ...r, [k]: v }))

  const enregistrer = async () => {
    if (!issue) return toast.error('Indiquez comment s’est terminé l’appel')
    if (issue === 'A_RAPPELER' && !rappelLe) return toast.error('Précisez quand rappeler')
    setEnvoi(true)
    try {
      const { data } = await api.post(`/operation/contacts/${c.id_modelo}/appel`,
        { issue, rappel_le: rappelLe || null, notes: notes.trim() || null })

      if (issue === 'JOINT' && Object.keys(res).length)
        await api.put(`/operation/contacts/${c.id_modelo}/resultat`, res)

      toast.success(data.hors_cadre ? 'Enregistré (hors cadre, tracé)' : 'Enregistré')
      onEnregistre({ issue, rdv: res.actualisation === 'ACCEPTEE', adresse: !!res.adresse_maj })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enregistrement impossible')
      setEnvoi(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-quai-light">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 space-y-3 pb-4">

          {/* Qui j'appelle, et avec quoi. */}
          <div className="bg-quai-navy text-white rounded-xl p-4">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold text-quai-navy font-bold">
                SCRIPT {c.script}
              </span>
              {cibleAdresse && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-medium">
                  récupérer l’adresse
                </span>
              )}
              {c.stop_telephone === 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 font-medium">Stop téléphone</span>
              )}
            </div>

            <h2 className="font-display text-xl font-bold leading-tight">
              {c.civilite} {c.prenom} {c.nom}
            </h2>

            {/* Le prénom de l'ancien conseiller : la première phrase du script
                3 ou 4 en dépend. */}
            {e.prenom_a_dire && (
              <div className="text-sm text-quai-goldlt mt-1">
                Dossier suivi avant par <b>{e.prenom_a_dire}</b>
              </div>
            )}

            <div className="text-[11px] text-white/70 mt-2 leading-snug">{e.contexte}</div>

            <div className="flex gap-2 mt-3">
              {tel ? (
                <a href={`tel:${tel}`}
                  className="flex-1 bg-white text-quai-navy rounded-lg py-3 font-semibold text-center
                             inline-flex items-center justify-center gap-2">
                  <Icon name="phone" size="sm" /> {tel}
                </a>
              ) : (
                <div className="flex-1 bg-white/10 rounded-lg py-3 text-center text-sm text-white/60">
                  Aucun numéro
                </div>
              )}
              <button onClick={() => setScriptOuvert(true)}
                className="px-4 rounded-lg bg-white/15 text-white text-sm inline-flex items-center gap-1.5">
                <Icon name="file-text" size="sm" /> Script
              </button>
            </div>

            {(c.avertissements || []).filter(a => a.niveau === 'grave').map(a => (
              <div key={a.code} className="text-[11px] bg-red-500/20 text-red-100 rounded px-2 py-1.5 mt-2 leading-snug">
                <Icon name="alert-triangle" size="sm" className="inline mr-1" />{a.texte}
              </div>
            ))}
          </div>

          {/* Ce qu'il faut savoir avant de décrocher. */}
          <Carte titre="À avoir en tête">
            <Ligne label="Rôle" valeur={c.role === 'ACQUEREUR' ? 'Acquéreur' : c.role === 'VENDEUR' ? 'Vendeur' : 'Indéterminé'} />
            {c.bien_concerne && <Ligne label="Bien" valeur={c.bien_concerne} />}
            {c.partie_au_registre && <Ligne label="Au registre" valeur={c.partie_au_registre} />}
            {c.commune && <Ligne label="Commune" valeur={c.commune} />}
          </Carte>

          <Carte
            titre={cibleAdresse ? 'Son adresse — l’objectif de cet appel' : 'Son adresse a-t-elle changé ?'}
            aide={cibleAdresse
              ? 'Nous n’avons pas pu lui écrire. Une adresse valide suffit à faire de cet appel une réussite.'
              : 'À remplir seulement si elle a changé.'}
            ouverte={cibleAdresse}>
            <div className="text-[11px] text-quai-muted bg-quai-light rounded p-2 leading-snug">
              Au dossier : {[c.adresse, c.code_postal, c.commune].filter(Boolean).join(', ') || 'rien'}
            </div>
            <Saisie label="Adresse" value={res.adresse_maj || ''} onChange={v => champ('adresse_maj', v)} />
            <div className="grid grid-cols-3 gap-2">
              <Saisie label="Code postal" value={res.code_postal_maj || ''} onChange={v => champ('code_postal_maj', v)} />
              <div className="col-span-2">
                <Saisie label="Commune" value={res.commune_maj || ''} onChange={v => champ('commune_maj', v)} />
              </div>
            </div>
          </Carte>

          <Carte titre="Où en est-il ?">
            <Boutons label="Toujours propriétaire du bien ?" valeur={res.toujours_proprietaire}
              options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('toujours_proprietaire', v)} />
            {res.toujours_proprietaire === 0 && (
              <>
                <Saisie label="Revendu quand ?" value={res.revendu_quand || ''} onChange={v => champ('revendu_quand', v)} />
                <Saisie label="Par quelle agence ?" value={res.revendu_par_qui || ''} onChange={v => champ('revendu_par_qui', v)} />
              </>
            )}
            <Boutons label="Un projet ?" valeur={res.projet}
              options={[['VENTE', 'Vente'], ['ACHAT', 'Achat'], ['INVESTISSEMENT', 'Investissement'], ['AUCUN', 'Aucun']]}
              onChange={v => champ('projet', v)} />
            {res.projet && res.projet !== 'AUCUN' && (
              <Saisie label="D’ici combien de mois ?" type="number" value={res.projet_echeance || ''}
                onChange={v => champ('projet_echeance', v)} />
            )}
          </Carte>

          {/* Les trois propositions, dans l'ordre. Le panneau en dernier. */}
          <Carte titre="Les trois propositions">
            <Boutons label="1 · Actualisation de la valeur — offerte, sans engagement"
              valeur={res.actualisation}
              options={[['ACCEPTEE', 'Acceptée'], ['A_REPROPOSER', 'À reproposer'], ['REFUSEE', 'Refusée']]}
              onChange={v => champ('actualisation', v)} />
            {res.actualisation === 'ACCEPTEE' && (
              <Saisie label="Rendez-vous le" type="date" value={res.date_rdv || ''} onChange={v => champ('date_rdv', v)} />
            )}
            <Boutons label="2 · Soirée du 3 décembre" valeur={res.soiree}
              options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('soiree', v)} />
            <Boutons label="3 · Panneau « Vendu par Le Quai »" valeur={res.panneau}
              options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('panneau', v)} />
          </Carte>

          <Carte titre="Une personne à contacter ?">
            <Saisie label="Nom" value={res.recommandation_nom || ''} onChange={v => champ('recommandation_nom', v)} />
            {res.recommandation_nom && (
              <Boutons label="Qui fait le lien ?" valeur={res.recommandation_mode}
                options={[['JE_LAPPELLE', 'Je l’appelle'], ['IL_FAIT_LE_LIEN', 'Il fait le lien']]}
                onChange={v => champ('recommandation_mode', v)} />
            )}
          </Carte>

          {c.email && (
            <Carte titre="Le courrier du président"
              aide={c.stop_mail ? 'Cette personne s’est opposée aux envois par mail.' : 'À renvoyer depuis votre boîte.'}>
              <Boutons label="" valeur={res.courrier_renvoye} options={[[1, 'Envoyé'], [0, 'Non']]}
                onChange={v => champ('courrier_renvoye', v)} />
              <a href={`mailto:${c.email}`}
                className="btn-secondary w-full min-h-[2.75rem] inline-flex items-center justify-center gap-1.5 text-sm">
                <Icon name="mail" size="sm" /> Écrire à {c.email}
              </a>
              <a href="/operation/courrier-president.pdf" download
                className="text-[11px] text-quai-navy underline block text-center">
                Télécharger le courrier à joindre
              </a>
            </Carte>
          )}

          <Carte titre="Comment s’est terminé l’appel ?" aide="Obligatoire pour passer au suivant.">
            <div className="grid grid-cols-2 gap-1.5">
              {ISSUES.map(([v, l, teinte]) => (
                <button key={v} onClick={() => setIssue(v)}
                  className={`px-2.5 py-2.5 rounded-lg border text-xs font-medium transition-colors min-h-[3rem] ${
                    issue === v
                      ? teinte === 'red' ? 'bg-red-600 text-white border-red-600'
                        : teinte === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-quai-navy text-white border-quai-navy'
                      : 'border-quai-border text-quai-navy hover:border-quai-gold bg-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            {issue === 'A_RAPPELER' && (
              <Saisie label="Rappeler le" type="datetime-local" value={rappelLe} onChange={setRappelLe} />
            )}

            {issue === 'REFUS_FERME' && (
              <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 leading-snug">
                Retrait définitif, ici et sur les opérations suivantes. Horodaté, conservé trois ans.
              </p>
            )}

            {issue === 'JOINT' && (
              <Boutons label="Peut-on le rappeler à l’avenir ?" valeur={res.consentement_tel}
                options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('consentement_tel', v)} />
            )}

            <div>
              <span className="text-[11px] text-quai-muted">
                Notes — des faits uniquement, le client peut demander à lire sa fiche
              </span>
              <textarea value={notes} onChange={ev => setNotes(ev.target.value)} rows={2}
                className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                           focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
            </div>
          </Carte>
        </div>
      </div>

      {/* Barre d'action fixe : le geste qui enchaîne. */}
      <div className="border-t border-quai-border bg-white p-3 shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <button onClick={onPasser}
            className="px-4 rounded-lg border border-quai-border text-quai-muted text-sm min-h-[3rem]">
            Passer
          </button>
          <button onClick={enregistrer} disabled={envoi || !issue}
            className="btn-primary flex-1 min-h-[3rem] inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {envoi ? 'Enregistrement…' : <>Enregistrer et suivant <Icon name="arrow-right" size="sm" /></>}
          </button>
        </div>
      </div>

      {scriptOuvert && (
        <div className="fixed inset-0 z-[1400] bg-black/80 flex flex-col">
          <div className="p-2 flex justify-between items-center text-white text-sm">
            <span>Script {c.script} — {e.titre}</span>
            <button onClick={() => setScriptOuvert(false)} className="px-3 py-2">Fermer</button>
          </div>
          <iframe src={e.pdf} title={`Script ${c.script}`} className="flex-1 bg-white" />
        </div>
      )}
    </div>
  )
}

// Les sections sont repliées par défaut, sauf celle qui porte l'objectif de
// l'appel : l'écran reste court, et ce qui compte est déjà ouvert.
function Carte({ titre, aide, children, ouverte = false }) {
  const [open, setOpen] = useState(ouverte)
  return (
    <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left">
        <span className="text-sm font-semibold text-quai-navy">{titre}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted shrink-0" />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {aide && <p className="text-[11px] text-quai-muted leading-snug -mt-1">{aide}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

function Ligne({ label, valeur }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-quai-muted text-[11px] w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-quai-navy text-[13px] leading-snug">{valeur}</span>
    </div>
  )
}

function Saisie({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] text-quai-muted">{label}</span>
      <input type={type} value={value} onChange={ev => onChange(ev.target.value)}
        className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                   min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
    </label>
  )
}

function Boutons({ label, valeur, options, onChange }) {
  return (
    <div>
      {label && <span className="text-[11px] text-quai-muted">{label}</span>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(([v, l]) => (
          <button key={String(v)} onClick={() => onChange(valeur === v ? null : v)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors min-h-[2.5rem] ${
              valeur === v ? 'bg-quai-navy text-white border-quai-navy'
                           : 'border-quai-border text-quai-muted hover:border-quai-gold'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
