import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// L'écran d'appel. Il suit les cinq étapes du script plutôt qu'un formulaire à
// plat : un agent qui enchaîne vingt appels perd le fil sur une page unique.
//
// Le script lui-même est affiché en PDF (mis en page par l'agence). Ce qu'un
// PDF ne sait pas faire — substituer le prénom de l'ancien conseiller — est
// repris dans l'en-tête, toujours visible.

const ISSUES = [
  ['JOINT', 'Joint', 'Ouvre la suite'],
  ['REPONDEUR', 'Répondeur', 'Message laissé'],
  ['PAS_DE_REPONSE', 'Pas de réponse', null],
  ['A_RAPPELER', 'À rappeler', 'Créneau à préciser'],
  ['FAUX_NUMERO', 'Faux numéro', null],
  ['ERREUR_IDENTITE', 'Pas la bonne personne', null],
  ['SUIVI_ANCIEN_CONSEILLER', 'Parti avec son conseiller', null],
  ['REFUS_FERME', 'Refus — ne plus appeler', 'Retrait définitif'],
  ['DECEDE', 'Décédé', null],
]

export default function FicheAppel({ idModelo, onFermer, onEnregistre }) {
  const [data, setData] = useState(null)
  const [etape, setEtape] = useState(1)
  const [issue, setIssue] = useState('')
  const [rappelLe, setRappelLe] = useState('')
  const [notes, setNotes] = useState('')
  const [res, setRes] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [scriptOuvert, setScriptOuvert] = useState(false)

  useEffect(() => {
    api.get(`/operation/contacts/${idModelo}`)
      .then(r => { setData(r.data); setRes(r.data.contact.resultat || {}) })
      .catch(() => toast.error('Fiche introuvable'))
  }, [idModelo])

  if (!data) return (
    <div className="fixed inset-0 z-[1300] bg-black/40 grid place-items-center">
      <div className="bg-white rounded-xl px-6 py-4 text-quai-muted">Chargement…</div>
    </div>
  )

  const c = data.contact
  const e = c.entete
  const tel = c.tel_portable || c.tel_fixe
  const champ = (k, v) => setRes(r => ({ ...r, [k]: v }))

  const enregistrer = async () => {
    if (!issue) return toast.error('Indiquez comment s’est terminé l’appel')
    if (issue === 'A_RAPPELER' && !rappelLe) return toast.error('Précisez quand rappeler')
    setEnvoi(true)
    try {
      const { data: r } = await api.post(`/operation/contacts/${idModelo}/appel`,
        { issue, rappel_le: rappelLe || null, notes: notes.trim() || null })

      // Ce qui a été recueilli ne se saisit que si la personne a décroché.
      if (issue === 'JOINT' && Object.keys(res).length)
        await api.put(`/operation/contacts/${idModelo}/resultat`, res)

      toast.success(r.hors_cadre ? 'Appel enregistré (hors cadre, tracé)' : 'Appel enregistré')
      onEnregistre?.()
      onFermer()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enregistrement impossible')
    } finally { setEnvoi(false) }
  }

  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div className="bg-quai-light w-full md:max-w-2xl h-[95vh] md:h-auto md:max-h-[92vh]
                      rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={ev => ev.stopPropagation()}>

        <EnTete contact={c} entete={e} tel={tel} onFermer={onFermer}
          onScript={() => setScriptOuvert(true)} />

        <Etapes courante={etape} onChoisir={setEtape} objectifAdresse={c.objectif_principal === 'ADRESSE'} />

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {etape === 1 && <Ouverture contact={c} entete={e} onScript={() => setScriptOuvert(true)} />}
          {etape === 2 && <Nouvelles contact={c} res={res} champ={champ} />}
          {etape === 3 && <Propositions res={res} champ={champ} />}
          {etape === 4 && (
            <Cloture
              contact={c} issue={issue} setIssue={setIssue}
              rappelLe={rappelLe} setRappelLe={setRappelLe}
              notes={notes} setNotes={setNotes}
              res={res} champ={champ}
            />
          )}
          {etape === 5 && <Historique appels={data.appels} />}
        </div>

        <div className="border-t border-quai-border bg-white p-3 flex items-center gap-2">
          {etape > 1 && (
            <button onClick={() => setEtape(etape - 1)}
              className="text-sm px-3 py-2 rounded-lg border border-quai-border text-quai-muted min-h-[2.75rem]">
              Retour
            </button>
          )}
          {etape < 4 ? (
            <button onClick={() => setEtape(etape + 1)}
              className="btn-primary flex-1 min-h-[2.75rem]">Suivant</button>
          ) : (
            <button onClick={enregistrer} disabled={envoi || !issue}
              className="btn-primary flex-1 min-h-[2.75rem] disabled:opacity-50">
              {envoi ? 'Enregistrement…' : 'Enregistrer l’appel'}
            </button>
          )}
        </div>
      </div>

      {scriptOuvert && (
        <div className="fixed inset-0 z-[1400] bg-black/70 flex flex-col" onClick={() => setScriptOuvert(false)}>
          <div className="p-2 flex justify-between items-center text-white text-sm">
            <span>Script {e.script} — {e.titre}</span>
            <button onClick={() => setScriptOuvert(false)} className="px-3 py-2">Fermer</button>
          </div>
          <iframe src={e.pdf} title={`Script ${e.script}`} className="flex-1 bg-white"
            onClick={ev => ev.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// Toujours visible : c'est ce qui remplace ce qu'un PDF ne peut pas substituer.
function EnTete({ contact: c, entete: e, tel, onFermer, onScript }) {
  return (
    <div className="bg-quai-navy text-white p-3 shrink-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold text-quai-navy font-bold">
              SCRIPT {e.script}
            </span>
            {c.stop_telephone === 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 font-medium">Stop téléphone</span>
            )}
            {c.stop_mail === 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/80 font-medium">Stop mail</span>
            )}
          </div>

          <div className="font-display font-bold mt-1 leading-tight">{e.client}</div>

          {/* Le prénom à dire : la raison d'être de cet en-tête. */}
          {e.prenom_a_dire && (
            <div className="text-sm text-quai-goldlt mt-0.5">
              Dossier suivi avant par <b>{e.prenom_a_dire}</b>
            </div>
          )}

          {e.bien && <div className="text-[11px] text-white/70 mt-1 leading-snug">{e.bien}</div>}
          <div className="text-[11px] text-white/60 mt-1 leading-snug">{e.contexte}</div>
        </div>

        <button onClick={onFermer} className="text-white/70 hover:text-white p-1 shrink-0" aria-label="Fermer">
          <Icon name="x" size="sm" />
        </button>
      </div>

      <div className="flex gap-2 mt-2">
        {tel && (
          <a href={`tel:${tel}`}
            className="flex-1 bg-white text-quai-navy rounded-lg py-2.5 text-sm font-semibold
                       text-center inline-flex items-center justify-center gap-1.5">
            <Icon name="phone" size="sm" /> {tel}
          </a>
        )}
        <button onClick={onScript}
          className="px-3 rounded-lg bg-white/15 text-white text-sm inline-flex items-center gap-1.5 min-h-[2.75rem]">
          <Icon name="file-text" size="sm" /> Script
        </button>
      </div>

      {(c.avertissements || []).map(a => (
        <div key={a.code} className={`text-[11px] rounded px-2 py-1.5 mt-2 leading-snug ${
          a.niveau === 'grave' ? 'bg-red-500/20 text-red-100' : 'bg-amber-400/20 text-amber-100'}`}>
          <Icon name="alert-triangle" size="sm" className="inline mr-1" />{a.texte}
        </div>
      ))}
    </div>
  )
}

function Etapes({ courante, onChoisir, objectifAdresse }) {
  const noms = ['Ouverture', objectifAdresse ? 'Adresse' : 'Nouvelles', 'Propositions', 'Clôture', 'Historique']
  return (
    <div className="flex gap-0.5 px-2 pt-1 bg-white border-b border-quai-border overflow-x-auto scrollbar-none shrink-0">
      {noms.map((n, i) => (
        <button key={n} onClick={() => onChoisir(i + 1)}
          className={`px-2.5 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
            courante === i + 1 ? 'border-quai-gold text-quai-navy'
                               : 'border-transparent text-quai-muted'}`}>
          {n}
        </button>
      ))}
    </div>
  )
}

function Bloc({ titre, aide, children }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className="text-sm font-semibold text-quai-navy">{titre}</div>
      {aide && <p className="text-[11px] text-quai-muted mt-0.5 leading-snug">{aide}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  )
}

function Champ({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] text-quai-muted">{label}</span>
      <input {...props}
        className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                   min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
    </label>
  )
}

function Choix({ label, valeur, options, onChange }) {
  return (
    <div>
      <span className="text-[11px] text-quai-muted">{label}</span>
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

function Ouverture({ contact: c, entete: e, onScript }) {
  return (
    <>
      <Bloc titre="Le script" aide="Mis en page par l’agence — ouvrez-le pour le lire en entier.">
        <button onClick={onScript} className="btn-secondary w-full min-h-[2.75rem] inline-flex items-center justify-center gap-1.5">
          <Icon name="file-text" size="sm" /> Ouvrir le script {e.script}
        </button>
      </Bloc>

      <Bloc titre="Ce qu’il faut avoir en tête">
        <dl className="text-sm space-y-1.5">
          {e.prenom_a_dire && (
            <div className="flex gap-2">
              <dt className="text-quai-muted w-28 shrink-0 text-[11px] pt-0.5">Prénom à dire</dt>
              <dd className="font-semibold text-quai-navy">{e.prenom_a_dire}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-quai-muted w-28 shrink-0 text-[11px] pt-0.5">Rôle</dt>
            <dd className="text-quai-navy">{c.role === 'ACQUEREUR' ? 'Acquéreur' : c.role === 'VENDEUR' ? 'Vendeur' : 'Indéterminé'}</dd>
          </div>
          {c.bien_concerne && (
            <div className="flex gap-2">
              <dt className="text-quai-muted w-28 shrink-0 text-[11px] pt-0.5">Bien</dt>
              <dd className="text-quai-navy text-[13px] leading-snug">{c.bien_concerne}</dd>
            </div>
          )}
          {/* Sert à trancher une identité douteuse, en direct. */}
          {c.partie_au_registre && (
            <div className="flex gap-2">
              <dt className="text-quai-muted w-28 shrink-0 text-[11px] pt-0.5">Au registre</dt>
              <dd className="text-quai-navy text-[13px] leading-snug">{c.partie_au_registre}</dd>
            </div>
          )}
        </dl>
      </Bloc>
    </>
  )
}

function Nouvelles({ contact: c, res, champ }) {
  const cible = c.objectif_principal === 'ADRESSE'
  return (
    <>
      <Bloc
        titre={cible ? 'L’adresse — c’est l’objectif de cet appel' : 'Son adresse a-t-elle changé ?'}
        aide={cible
          ? 'Nous n’avons pas pu lui écrire. Une adresse valide suffit à faire de cet appel une réussite.'
          : 'À remplir seulement si elle a changé.'}>
        <div className="text-[11px] text-quai-muted bg-quai-light rounded p-2 leading-snug">
          Au dossier : {[c.adresse, c.code_postal, c.commune].filter(Boolean).join(', ') || 'rien'}
        </div>
        <Champ label="Adresse" value={res.adresse_maj || ''} onChange={ev => champ('adresse_maj', ev.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <Champ label="Code postal" value={res.code_postal_maj || ''} onChange={ev => champ('code_postal_maj', ev.target.value)} />
          <div className="col-span-2">
            <Champ label="Commune" value={res.commune_maj || ''} onChange={ev => champ('commune_maj', ev.target.value)} />
          </div>
        </div>
      </Bloc>

      <Bloc titre="Où en est-il ?">
        <Choix label="Toujours propriétaire du bien ?" valeur={res.toujours_proprietaire}
          options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('toujours_proprietaire', v)} />
        {res.toujours_proprietaire === 0 && (
          <>
            <Champ label="Revendu quand ?" value={res.revendu_quand || ''} onChange={ev => champ('revendu_quand', ev.target.value)} />
            <Champ label="Par quelle agence ?" value={res.revendu_par_qui || ''} onChange={ev => champ('revendu_par_qui', ev.target.value)} />
          </>
        )}
        <Choix label="Aujourd’hui" valeur={res.statut_actuel}
          options={[['PROPRIETAIRE', 'Propriétaire'], ['LOCATAIRE', 'Locataire'], ['HEBERGE', 'Hébergé']]}
          onChange={v => champ('statut_actuel', v)} />
        <Choix label="Un projet ?" valeur={res.projet}
          options={[['VENTE', 'Vente'], ['ACHAT', 'Achat'], ['INVESTISSEMENT', 'Investissement'], ['AUCUN', 'Aucun']]}
          onChange={v => champ('projet', v)} />
        {res.projet && res.projet !== 'AUCUN' && (
          <Champ label="D’ici combien de mois ?" type="number" min="0" value={res.projet_echeance || ''}
            onChange={ev => champ('projet_echeance', ev.target.value)} />
        )}
      </Bloc>
    </>
  )
}

// Les trois propositions, dans l'ordre du script. Le panneau reste en dernier.
function Propositions({ res, champ }) {
  return (
    <>
      <Bloc titre="1 · Actualisation de la valeur" aide="Offerte et sans engagement. C’est elle qui compte.">
        <Choix label="" valeur={res.actualisation}
          options={[['ACCEPTEE', 'Acceptée'], ['A_REPROPOSER', 'À reproposer'], ['REFUSEE', 'Refusée']]}
          onChange={v => champ('actualisation', v)} />
        {res.actualisation === 'ACCEPTEE' && (
          <Champ label="Rendez-vous le" type="date" value={res.date_rdv || ''}
            onChange={ev => champ('date_rdv', ev.target.value)} />
        )}
      </Bloc>

      <Bloc titre="2 · Soirée du 3 décembre" aide="Sur invitation.">
        <Choix label="" valeur={res.soiree} options={[[1, 'Oui'], [0, 'Non']]}
          onChange={v => champ('soiree', v)} />
      </Bloc>

      <Bloc titre="3 · Panneau « Vendu par Le Quai »" aide="« Et vous me dites non sans problème. »">
        <Choix label="" valeur={res.panneau} options={[[1, 'Oui'], [0, 'Non']]}
          onChange={v => champ('panneau', v)} />
      </Bloc>

      <Bloc titre="Une personne à contacter ?" aide="Un ancien client satisfait en connaît souvent.">
        <Champ label="Nom" value={res.recommandation_nom || ''}
          onChange={ev => champ('recommandation_nom', ev.target.value)} />
        {res.recommandation_nom && (
          <Choix label="Qui fait le lien ?" valeur={res.recommandation_mode}
            options={[['JE_LAPPELLE', 'Je l’appelle'], ['IL_FAIT_LE_LIEN', 'Il fait le lien']]}
            onChange={v => champ('recommandation_mode', v)} />
        )}
      </Bloc>
    </>
  )
}

function Cloture({ contact: c, issue, setIssue, rappelLe, setRappelLe, notes, setNotes, res, champ }) {
  return (
    <>
      <Bloc titre="Comment s’est terminé l’appel ?">
        <div className="grid grid-cols-2 gap-1.5">
          {ISSUES.map(([v, l, aide]) => (
            <button key={v} onClick={() => setIssue(v)}
              className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors min-h-[3rem] ${
                issue === v
                  ? v === 'REFUS_FERME' ? 'bg-red-600 text-white border-red-600'
                                        : 'bg-quai-navy text-white border-quai-navy'
                  : 'border-quai-border text-quai-navy hover:border-quai-gold'}`}>
              <div className="font-medium">{l}</div>
              {aide && <div className={`text-[10px] ${issue === v ? 'text-white/70' : 'text-quai-muted'}`}>{aide}</div>}
            </button>
          ))}
        </div>

        {issue === 'A_RAPPELER' && (
          <Champ label="Rappeler le" type="datetime-local" value={rappelLe}
            onChange={ev => setRappelLe(ev.target.value)} />
        )}

        {issue === 'REFUS_FERME' && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 leading-snug">
            Cette personne sera retirée définitivement, ici et sur les opérations suivantes.
            Le retrait est horodaté et conservé trois ans.
          </p>
        )}
      </Bloc>

      {issue === 'JOINT' && (
        <Bloc titre="Peut-on le rappeler à l’avenir ?"
          aide="La réponse est datée : c’est elle qui autorise les prochains appels.">
          <Choix label="" valeur={res.consentement_tel} options={[[1, 'Oui'], [0, 'Non']]}
            onChange={v => champ('consentement_tel', v)} />
        </Bloc>
      )}

      {issue === 'JOINT' && (
        <Bloc titre="Le courrier du président"
          aide={c.stop_mail ? 'Cette personne s’est opposée aux envois par mail.' : 'À renvoyer par mail depuis votre boîte.'}>
          <Choix label="" valeur={res.courrier_renvoye} options={[[1, 'Envoyé'], [0, 'Non']]}
            onChange={v => champ('courrier_renvoye', v)} />
          {c.email && (
            <a href={`mailto:${c.email}`} className="btn-secondary w-full min-h-[2.75rem] inline-flex items-center justify-center gap-1.5 text-sm">
              <Icon name="mail" size="sm" /> Écrire à {c.email}
            </a>
          )}
          <a href="/operation/courrier-president.pdf" download
            className="text-[11px] text-quai-navy underline block text-center">
            Télécharger le courrier à joindre
          </a>
        </Bloc>
      )}

      <Bloc titre="Notes" aide="Des faits uniquement : le client peut demander à lire sa fiche.">
        <textarea value={notes} onChange={ev => setNotes(ev.target.value)} rows={3}
          placeholder="Ce qu’il a dit, ce qu’il faut retenir…"
          className="w-full px-2.5 py-2 text-sm rounded-lg border border-quai-border
                     focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
      </Bloc>
    </>
  )
}

function Historique({ appels }) {
  if (!appels.length) return <p className="text-sm text-quai-muted text-center py-6">Premier appel.</p>
  return (
    <div className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border/60">
      {appels.map(a => (
        <div key={a.id} className="px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-quai-navy">{a.issue.replace(/_/g, ' ').toLowerCase()}</span>
            <span className="text-[11px] text-quai-muted">
              {new Date(a.horodatage).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="text-[11px] text-quai-muted">{a.conseiller}</div>
          {a.notes && <div className="text-[11px] text-quai-text mt-1 leading-snug">{a.notes}</div>}
          {a.hors_cadre && (
            <div className="text-[10px] text-amber-700 mt-0.5">Hors cadre : {a.hors_cadre.toLowerCase().replace(/_/g, ' ')}</div>
          )}
        </div>
      ))}
    </div>
  )
}
