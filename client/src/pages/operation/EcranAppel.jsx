import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import SaisieAdresse from '../../components/SaisieAdresse'

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
  ['DECEDE', 'Décédé', null],
  ['REFUS_FERME', 'Refus — ne plus appeler', 'red'],
]

export default function EcranAppel({ contact: c, onEnregistre, onPasser, horsFile, origine, demo }) {
  // Durée de l'appel, mesurée depuis l'ouverture de la fiche. Le manager s'en
  // sert comme signal : un appel qui passe de six minutes à quatre-vingt-dix
  // secondes, c'est quelqu'un qui expédie.
  const [ouvertA] = useState(() => Date.now())
  const [issue, setIssue] = useState('')
  const [rappelLe, setRappelLe] = useState('')
  const [notes, setNotes] = useState('')
  const [res, setRes] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [scriptOuvert, setScriptOuvert] = useState(false)

  // Raccourcis : l'agent est au casque, une main sur le clavier. Chaque aller
  // à la souris lui fait quitter la conversation, et ça s'entend.
  useEffect(() => {
    const touche = (ev) => {
      const dansUnChamp = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)
      if (ev.key === 'Escape' && scriptOuvert) { setScriptOuvert(false); return }
      if (dansUnChamp) return
      // 1 à 8 : les huit issues, dans l'ordre affiché.
      if (/^[1-8]$/.test(ev.key)) {
        const choix = ISSUES[Number(ev.key) - 1]
        if (choix) { setIssue(choix[0]); ev.preventDefault() }
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [scriptOuvert])

  // Le serveur calcule l'avertissement ; on récupère le domaine pour le dire
  // à l'agent.
  const avMail = (c.avertissements_mail || []).find(a => a.code === 'MAIL_AGENT')
  const mailAgent = avMail
    ? { domaine: (avMail.texte.match(/\(([^)]+)\)/) || [, 'professionnel'])[1] }
    : null

  const e = c.entete || {}
  const tel = c.tel_portable || c.tel_fixe
  const champ = (k, v) => setRes(r => ({ ...r, [k]: v }))

  const enregistrer = async () => {
    if (!issue) return toast.error('Indiquez comment s’est terminé l’appel')
    if (issue === 'A_RAPPELER' && !rappelLe) return toast.error('Précisez quand rappeler')
    setEnvoi(true)

    // En démonstration, rien ne part : l'écran se comporte exactement comme en
    // vrai, mais la fiche est fictive et la saisie n'est pas enregistrée. On
    // peut donc la dérouler deux fois de suite devant la salle.
    if (demo) {
      toast.success('Démonstration — rien n’a été enregistré')
      onEnregistre({ issue, rdv: res.actualisation === 'ACCEPTEE', fiche: false })
      return
    }

    try {
      const { data } = await api.post(`/operation/contacts/${c.id_modelo}/appel`,
        { issue, rappel_le: rappelLe || null, notes: notes.trim() || null,
          duree_sec: Math.round((Date.now() - ouvertA) / 1000) })

      // Ce que l'agent a saisi est enregistré quelle que soit l'issue.
      //
      // La condition précédente ne gardait que les appels « Joint » : un client
      // qui dit « rappelez-moi jeudi, mais notez ma nouvelle adresse » voyait
      // son adresse jetée, et le message affiché disait « Enregistré ».
      // Le consentement téléphonique se perdait de la même façon.
      const aSaisi = Object.keys(res).length > 0
      if (aSaisi) await api.put(`/operation/contacts/${c.id_modelo}/resultat`, res)

      // Le message dit ce qui est parti, pour que l'agent n'ait pas à le croire.
      const parti = []
      if (res.adresse_maj) parti.push('adresse')
      if (res.actualisation === 'ACCEPTEE') parti.push('estimation calée')
      if (res.soiree === 1) parti.push('soirée')
      if (res.panneau === 1) parti.push('panneau')
      if (res.recommandation_nom) parti.push('recommandation')
      if (res.consentement_tel != null) parti.push('consentement')
      if (res.fiche_confirmee === 1) parti.push('fiche confirmée')
      toast.success(
        (parti.length ? 'Enregistré — ' + parti.join(', ') : 'Enregistré')
        + (data.hors_cadre ? ' (hors cadre, tracé)' : ''))

      onEnregistre({
        issue,
        rdv: res.actualisation === 'ACCEPTEE',
        // La fiche compte comme mise à jour dès qu'on a recueilli quelque chose
        // de durable — c'est le quatrième objectif, au même rang que les trois
        // propositions.
        fiche: aSaisi && !!(res.adresse_maj || res.statut_actuel || res.projet
          || res.toujours_proprietaire != null || res.fiche_confirmee === 1),
      })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enregistrement impossible')
      setEnvoi(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-quai-light">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-3 md:p-4 space-y-3 pb-4">

          {/* Qui j'appelle, et avec quoi. */}
          <div className="bg-quai-navy text-white rounded-xl p-4">
            {horsFile && (
              <div className="text-[11px] text-quai-goldlt mb-1.5 inline-flex items-center gap-1">
                <Icon name="phone-call" size="sm" />
                {origine === 'ouverte'
                  ? ' Fiche ouverte depuis le suivi'
                  : ' Hors de votre liste — rappel entrant'}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-gold text-quai-navy font-bold">
                SCRIPT {c.script}
              </span>
              {/* Le vocabulaire de la feuille imprimée : ce dont l'agent a
                  besoin avant de décrocher, c'est de savoir quel script il
                  prend — pas un objectif inventé pour l'écran. */}
              {/* Le NPAI remplace « courrier non envoyé » : un pli revenu a bien
                  été envoyé, et afficher les deux brouillerait le message. */}
              {c.npai === 1 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-quai-navy font-bold">
                  courrier revenu
                </span>
              ) : c.courrier_etat !== 'ENVOYE' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-medium">
                  courrier non envoyé
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
                3 ou 4 en dépend. Le nom complet suit, en retrait : on prononce
                le prénom, mais si le client demande « Charlotte comment ? »,
                l'agent doit avoir la réponse sous les yeux. */}
            {e.prenom_a_dire && (
              <div className="text-sm text-quai-goldlt mt-1">
                Dossier suivi avant par <b>{e.prenom_a_dire}</b>
                {e.ancien_conseiller
                  && e.ancien_conseiller.toLowerCase() !== e.prenom_a_dire.toLowerCase() && (
                  <span className="text-white/60"> — {e.ancien_conseiller}</span>
                )}
              </div>
            )}

            {/* L'encart NPAI ci-dessous dit la même chose en plus clair :
                afficher les deux fait lire deux fois la même phrase. */}
            {c.npai !== 1 && (
              <div className="text-[11px] text-white/70 mt-2 leading-snug">{e.contexte}</div>
            )}

            {/* Le pli est revenu : l'agent doit le savoir avant de décrocher,
                parce que le client va dire « je n'ai rien reçu » et que la
                réponse n'est pas « si, on vous l'a envoyé ». Encart plein et
                non une ligne grise : c'est la seule chose qui change dans son
                appel par rapport aux autres fiches du même script. */}
            {c.npai === 1 && (
              <div className="mt-2 rounded-lg bg-amber-400/15 border border-amber-300/40 p-2.5">
                <div className="text-[11px] font-semibold text-amber-200 mb-0.5">
                  Son courrier nous est revenu
                </div>
                <p className="text-[11px] text-white/80 leading-snug">
                  Il n'a rien reçu, et ce n'est pas de sa faute : l'adresse que nous avons est
                  fausse. Ne lui dites pas qu'il a reçu la lettre — dites-lui qu'elle vous est
                  revenue, et profitez-en pour lui demander sa bonne adresse.
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-3 md:max-w-md">
              {tel ? (
                <a href={`tel:${tel}`}
                  className="flex-1 bg-white text-quai-navy rounded-lg py-3 font-semibold text-center
                             inline-flex items-center justify-center gap-2 md:text-lg">
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

            {/* Tous les avertissements, pas seulement les graves : « hors
                plage » était filtré et n'atteignait jamais l'agent, alors que
                la page d'accueil lui promet d'être prévenu. */}
            {(c.avertissements || []).map(a => (
              <div key={a.code} className={`text-[11px] rounded px-2 py-1.5 mt-2 leading-snug ${
                a.niveau === 'grave' ? 'bg-red-500/20 text-red-100' : 'bg-amber-400/20 text-amber-100'}`}>
                <Icon name="alert-triangle" size="sm" className="inline mr-1" />{a.texte}
              </div>
            ))}

            {/* Ce qui demande un arbitrage avant de parler. Stocké depuis le
                début, affiché jusqu'ici seulement sur l'écran de répartition. */}
            {c.point_attention && (
              <div className="text-[11px] bg-amber-400/25 text-amber-50 rounded px-2 py-1.5 mt-2 leading-snug">
                <Icon name="alert-triangle" size="sm" className="inline mr-1" />{c.point_attention}
              </div>
            )}

            {/* L'historique : « on m'a déjà appelé la semaine dernière » ne doit
                pas prendre l'agent au dépourvu. */}
            {c.appels_total > 0 && (
              <div className="text-[11px] text-white/70 bg-white/10 rounded px-2 py-1.5 mt-2 leading-snug">
                {c.appels_total} appel{c.appels_total > 1 ? 's' : ''} déjà passé{c.appels_total > 1 ? 's' : ''}
                {c.dernier_appel_le && <> · dernier le {new Date(c.dernier_appel_le.replace(' ', 'T') + 'Z')
                  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</>}
                {c.dernier_par && <> par {c.dernier_par}</>}
                {c.derniere_issue && <> ({c.derniere_issue.replace(/_/g, ' ').toLowerCase()})</>}
                {c.derniere_note && <div className="italic mt-0.5">« {c.derniere_note} »</div>}
              </div>
            )}
          </div>

          {/* Ce qu'il faut savoir avant de décrocher. */}
          <Carte titre="À avoir en tête">
            <Ligne label="Rôle" valeur={c.role === 'ACQUEREUR' ? 'Acquéreur' : c.role === 'VENDEUR' ? 'Vendeur' : 'Indéterminé'} />
            {c.bien_concerne && <Ligne label="Bien" valeur={c.bien_concerne} />}
            {c.partie_au_registre && <Ligne label="Au registre" valeur={c.partie_au_registre} />}
            {c.commune && <Ligne label="Commune" valeur={c.commune} />}
          </Carte>

          {/* Quatrième objectif : la fiche à jour. Il ne se propose pas au
              client, il se recueille — et il concerne les 1 088, pas seulement
              les fiches sans adresse valide. */}
          <Carte titre="Mise à jour de la fiche" ouverte>
            <div className="bg-quai-light rounded p-2">
              <div className="text-[11px] text-quai-muted leading-snug">
                Au dossier : {[c.adresse, c.code_postal, c.commune].filter(Boolean).join(', ') || 'rien'}
              </div>
              {/* « Rien n'a changé » est une information, pas une absence
                  d'information : sans ce bouton, un agent qui vérifie et trouve
                  tout bon ne laisse aucune trace, et la fiche n'est pas comptée
                  comme à jour. */}
              <button type="button"
                onClick={() => champ('fiche_confirmee', res.fiche_confirmee === 1 ? null : 1)}
                className={`mt-2 w-full text-xs px-3 py-2 rounded-lg border transition-colors min-h-[2.5rem] ${
                  res.fiche_confirmee === 1
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white border-quai-border text-quai-navy hover:border-quai-gold'}`}>
                {res.fiche_confirmee === 1
                  ? '✓ Vérifié avec lui — rien n’a changé'
                  : 'Tout est déjà bon'}
              </button>
            </div>
            {/* Information, pas consigne. */}
            {/* Pour un NPAI, l'encart en tête l'a déjà dit. Cette phrase sert
                aux fiches dont l'adresse était douteuse dès l'import. */}
            {c.adresse_fiable === 0 && c.npai !== 1 && (
              <p className="text-[11px] text-quai-muted leading-snug">
                Sa fiche porte l'adresse du bien qu'il a vendu — il n'y habite plus.
              </p>
            )}
            {/* Les propositions remplissent code postal et commune d'un coup :
                deux champs de moins à saisir, et plus de commune mal
                orthographiée recueillie à l'oral. */}
            <SaisieAdresse
              valeur={res.adresse_maj}
              onSaisir={v => champ('adresse_maj', v)}
              onChoisir={a => setRes(r => ({ ...r,
                adresse_maj: a.adresse, code_postal_maj: a.code_postal, commune_maj: a.commune }))}
            />
            <div className="grid grid-cols-3 gap-2">
              <Saisie label="Code postal" value={res.code_postal_maj || ''} onChange={v => champ('code_postal_maj', v)} />
              <div className="col-span-2">
                <Saisie label="Commune" value={res.commune_maj || ''} onChange={v => champ('commune_maj', v)} />
              </div>
            </div>
            <Boutons label="Toujours propriétaire du bien ?" valeur={res.toujours_proprietaire}
              options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('toujours_proprietaire', v)} />
            {res.toujours_proprietaire === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Saisie label="Revendu quand ?" value={res.revendu_quand || ''} onChange={v => champ('revendu_quand', v)} />
                <Saisie label="Par quelle agence ?" value={res.revendu_par_qui || ''} onChange={v => champ('revendu_par_qui', v)} />
              </div>
            )}
            <Boutons label="Aujourd'hui" valeur={res.statut_actuel}
              options={[['PROPRIETAIRE', 'Propriétaire'], ['LOCATAIRE', 'Locataire'], ['HEBERGE', 'Hébergé']]}
              onChange={v => champ('statut_actuel', v)} />
            <Boutons label="Un projet ?" valeur={res.projet}
              options={[['VENTE', 'Vente'], ['ACHAT', 'Achat'], ['INVESTISSEMENT', 'Investissement'], ['AUCUN', 'Aucun']]}
              onChange={v => champ('projet', v)} />
            {res.projet && res.projet !== 'AUCUN' && (
              <Saisie label="D'ici combien de mois ?" type="number" value={res.projet_echeance || ''}
                onChange={v => champ('projet_echeance', v)} />
            )}
          </Carte>

          {/* Les trois propositions, dans l'ordre. Le panneau en dernier. */}
          <Carte titre="Les trois propositions" ouverte>
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

          {/* Tous scripts confondus. Les champs sont visibles d'emblée : repliés
              derrière la saisie d'un nom, l'agent ne savait pas qu'on attendait
              aussi un numéro et un motif — et un nom seul ne se rappelle pas. */}
          <Carte titre="Une personne à contacter ?"
            aide="Un ancien client satisfait en connaît souvent. Sans numéro ni motif, la recommandation reste lettre morte.">
            <Saisie label="Nom" value={res.recommandation_nom || ''}
              onChange={v => champ('recommandation_nom', v)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Saisie label="Téléphone" type="tel" value={res.recommandation_tel || ''}
                onChange={v => champ('recommandation_tel', v)} />
              <Saisie label="E-mail" type="email" value={res.recommandation_email || ''}
                onChange={v => champ('recommandation_email', v)} />
            </div>
            <Saisie label="Pourquoi — ce qu'elle cherche, son projet"
              value={res.recommandation_motif || ''} onChange={v => champ('recommandation_motif', v)} />
            <Boutons label="Qui fait le lien ?" valeur={res.recommandation_mode}
              options={[['JE_LAPPELLE', 'Je l\u2019appelle'], ['IL_FAIT_LE_LIEN', 'Il fait le lien']]}
              onChange={v => champ('recommandation_mode', v)} />
          </Carte>

          {c.email && (
            <Carte titre="Le courrier du président"
              aide={c.stop_mail
                ? 'Cette personne s’est opposée aux envois par mail.'
                : 'À envoyer depuis votre boîte @lequai-immobilier.com, avec le courrier en pièce jointe.'}>
              {/* Pas d'envoi depuis la fiche : un lien mailto ne peut pas
                  porter de pièce jointe, et le mail doit partir de la boîte du
                  conseiller. On donne donc l'adresse et le fichier. */}

              {/* Certaines fiches portent l'adresse d'un conseiller plutôt que
                  celle du client : l'envoyer reviendrait à s'écrire à soi-même.
                  On alerte sans rien effacer — l'adresse aide à retrouver la
                  bonne dans Modelo. */}
              {mailAgent && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug">
                  <div className="text-[13px] font-semibold text-red-800">
                    <Icon name="alert-triangle" size="sm" className="inline mr-1" />
                    Ce n’est pas l’adresse du client
                  </div>
                  <p className="text-[12px] text-red-700 mt-1 mb-0">
                    C’est celle d’un professionnel ({mailAgent.domaine}). Ne lui envoyez pas de mail
                    avant d’avoir la bonne adresse. Demandez-la au téléphone et notez-la ci-dessous.
                  </p>
                </div>
              )}

              <div>
                <span className="text-[11px] text-quai-muted">
                  {mailAgent ? 'Adresse enregistrée — à ne pas utiliser' : 'Son adresse mail'}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className={`flex-1 text-[13px] rounded px-2.5 py-2 select-all break-all leading-snug ${
                    mailAgent ? 'text-red-800 bg-red-50 line-through' : 'text-quai-navy bg-quai-light'}`}>
                    {c.email}
                  </code>
                  {!mailAgent && (
                    <button onClick={() => { navigator.clipboard?.writeText(c.email); toast.success('Adresse copiée') }}
                      className="px-3 py-2 rounded-lg border border-quai-border text-quai-muted
                                 hover:border-quai-gold hover:text-quai-navy text-xs min-h-[2.75rem] shrink-0">
                      Copier
                    </button>
                  )}
                </div>
              </div>

              {/* Quand l'adresse est fausse, c'est celle du client qu'on vient
                  chercher — au même endroit que le reste de la mise à jour. */}
              {mailAgent && (
                <Saisie label="Sa vraie adresse mail" type="email"
                  value={res.email_maj || ''} onChange={v => champ('email_maj', v)} />
              )}
              <a href="/operation/courrier-president.pdf" download
                className="btn-secondary w-full min-h-[2.75rem] inline-flex items-center justify-center gap-1.5 text-sm">
                <Icon name="download" size="sm" /> Télécharger le courrier
              </a>
              <Boutons label="Courrier envoyé ?" valeur={res.courrier_renvoye}
                options={[[1, 'Oui'], [0, 'Non']]} onChange={v => champ('courrier_renvoye', v)} />
            </Carte>
          )}

          <Carte titre="Comment s’est terminé l’appel ?" aide="Obligatoire pour passer au suivant.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {ISSUES.map(([v, l, teinte], i) => (
                <button key={v} onClick={() => setIssue(v)} title={`Touche ${i + 1}`}
                  className={`px-2.5 py-2.5 rounded-lg border text-xs font-medium transition-colors min-h-[3rem] ${
                    issue === v
                      ? teinte === 'red' ? 'bg-red-600 text-white border-red-600'
                        : teinte === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-quai-navy text-white border-quai-navy'
                      : 'border-quai-border text-quai-navy hover:border-quai-gold bg-white'}`}>
                  <span className="opacity-40 mr-1">{i + 1}</span>{l}
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
              <span className="text-[11px] text-quai-muted">Notes</span>
              <textarea value={notes} onChange={ev => setNotes(ev.target.value)} rows={2}
                className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                           focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
            </div>
          </Carte>
        </div>
      </div>

      {/* Barre d'action fixe : le geste qui enchaîne. */}
      <div className="border-t border-quai-border bg-white p-3 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <button onClick={onPasser}
            className="px-4 rounded-lg border border-quai-border text-quai-muted text-sm min-h-[3rem] whitespace-nowrap">
            {horsFile ? 'Revenir à ma liste' : 'Passer'}
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
