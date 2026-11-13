import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import EcranAppel from './EcranAppel'

const RecapSession = lazy(() => import('./RecapSession'))

// Session d'appel enchaînée, sur le modèle de celle de Chrystelle : un contact
// plein écran, on appelle, on note, on passe au suivant. Pas de liste, pas de
// choix entre deux appels.
//
// C'est ce qui fait la différence sur 149 appels : aucune décision à prendre
// entre deux fiches, et personne n'est sauté.
export default function SessionOperation({ ficheAOuvrir, onFicheOuverte, retour }) {
  const [file, setFile] = useState([])
  const [infos, setInfos] = useState(null)
  const [index, setIndex] = useState(0)
  const [fini, setFini] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(false)
  // Le bilan vient du serveur : un compteur local repartait à zéro dès qu'on
  // rechargeait la page, et un agent qui reprend à 14h ne voyait plus sa
  // matinée. Sur trois semaines, c'est ce qui fait tenir.
  const [bilan, setBilan] = useState({ faits: 0, joints: 0, rdv: 0, fiches: 0, sansReponse: 0 })
  const [cumul, setCumul] = useState(null)

  const chargerCumul = useCallback(() => {
    api.get('/operation/mon-acces').then(r => setCumul(r.data.bilan)).catch(() => {})
  }, [])
  useEffect(() => { chargerCumul() }, [chargerCumul])
  const [listeOuverte, setListeOuverte] = useState(false)
  const [recapOuvert, setRecapOuvert] = useState(false)
  // Tous ses contacts, appelés ou non : le seul chemin vers une fiche une fois
  // la liste d'appels terminée (un client répond à un SMS, il faut le noter).
  const [contactsOuverts, setContactsOuverts] = useState(false)
  const ouvrirDepuisContacts = (id) => {
    api.get(`/operation/contacts/${id}`)
      .then(r => { setOrigine('contacts'); setHorsFile(r.data.contact); setContactsOuverts(false) })
      .catch(err => toast.error(err.messageLisible || 'Fiche inaccessible'))
  }

  // Contact trouvé par la recherche : un client rappelle, on le traite sans
  // perdre sa place dans la file.
  const [horsFile, setHorsFile] = useState(null)
  // « rappel » quand l'agent a cherché un client qui vient de rappeler ;
  // « ouverte » quand la fiche vient du listing ou du suivi. Le bandeau de
  // l'écran d'appel ne dit pas la même chose dans les deux cas.
  const [origine, setOrigine] = useState('rappel')
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState([])

  useEffect(() => {
    if (recherche.trim().length < 2) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get('/operation/recherche', { params: { q: recherche.trim() } })
        .then(r => setResultats(r.data)).catch(() => setResultats([]))
    }, 250)
    return () => clearTimeout(t)
  }, [recherche])

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

  // Une fiche ouverte depuis le listing ou le suivi. On la recharge au lieu de
  // la prendre telle quelle : les écrans de pilotage renvoient des lignes de
  // tableau, sans en-tête de script ni avertissements, et l'écran d'appel a
  // besoin des deux. L'identifiant suffit donc à l'appelant.
  useEffect(() => {
    if (!ficheAOuvrir) return
    const id = ficheAOuvrir.id_modelo || ficheAOuvrir
    api.get(`/operation/contacts/${id}`)
      .then(r => { setOrigine('ouverte'); setHorsFile(r.data.contact) })
      .catch(() => { toast.error('Fiche inaccessible'); retour?.aller() })
      .finally(() => onFicheOuverte?.())
  }, [ficheAOuvrir, onFicheOuverte])

  const contact = horsFile || file[index]

  // Après un appel enregistré : on avance. La fiche traitée reste dans la file
  // locale — la recharger ferait perdre la place de l'agent.
  const suivant = (resume) => {
    setBilan(b => ({
      faits: b.faits + 1,
      joints: b.joints + (resume.issue === 'JOINT' ? 1 : 0),
      rdv: b.rdv + (resume.rdv ? 1 : 0),
      fiches: (b.fiches || 0) + (resume.fiche ? 1 : 0),
      sansReponse: b.sansReponse + (['PAS_DE_REPONSE', 'REPONDEUR', 'SMS'].includes(resume.issue) ? 1 : 0),
    }))
    // Un rappel entrant ne fait pas avancer la file : on y revient où on en
    // était.
    chargerCumul()
    if (horsFile) { setHorsFile(null); setRecherche(''); setResultats([]); retour?.aller(); return }
    if (index + 1 >= file.length) setFini(true)
    else setIndex(i => i + 1)
  }

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger votre liste d’appels.</p>
  if (chargement) return <p className="p-6 text-quai-muted">Chargement…</p>

  if (!horsFile && retour && ficheAOuvrir) return <p className="p-6 text-quai-muted">Chargement…</p>
  if (!horsFile && (fini || !file.length)) return (
    <>
      <Termine bilan={bilan} vide={!file.length} infos={infos} onRecharger={charger}
        onRecap={() => setRecapOuvert(true)} onContacts={() => setContactsOuverts(true)} />
      {contactsOuverts && <MesContacts onChoisir={ouvrirDepuisContacts} onFermer={() => setContactsOuverts(false)} />}
      {recapOuvert && (
        <Suspense fallback={null}><RecapSession onFermer={() => setRecapOuvert(false)} /></Suspense>
      )}
    </>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Progression
        index={index} total={file.length} bilan={bilan} cumul={cumul}
        plage={infos?.plage}
        horsFile={!!horsFile} origine={origine}
        onContacts={() => setContactsOuverts(true)}
        recherche={recherche} setRecherche={setRecherche} resultats={resultats}
        onOuvrirHorsFile={c => { setOrigine('rappel'); setHorsFile(c); setRecherche(''); setResultats([]) }}
        onListe={() => setListeOuverte(true)}
        onRecap={() => setRecapOuvert(true)}
      />

      <EcranAppel
        key={contact.id_modelo}
        contact={contact}
        horsFile={!!horsFile}
        origine={origine}
        onEnregistre={suivant}
        libelleRetour={retour?.label}
        onPasser={() => {
          if (horsFile) { setHorsFile(null); retour?.aller(); return }
          if (index + 1 >= file.length) setFini(true); else setIndex(i => i + 1)
        }}
      />

      {/* La liste reste accessible : un agent veut parfois choisir qui il
          rappelle, par exemple avant un rendez-vous. Mais ce n'est pas la vue
          par défaut. */}
      {listeOuverte && (
        <Liste file={file} index={index}
          onChoisir={i => { setIndex(i); setHorsFile(null); setListeOuverte(false) }}
          onFermer={() => setListeOuverte(false)} />
      )}

      {recapOuvert && (
        <Suspense fallback={null}><RecapSession onFermer={() => setRecapOuvert(false)} /></Suspense>
      )}
      {contactsOuverts && <MesContacts onChoisir={ouvrirDepuisContacts} onFermer={() => setContactsOuverts(false)} />}
    </div>
  )
}

// Tous mes contacts, où qu'ils en soient. On cherche, on ouvre, on complète.
const OU_EN_EST = {
  JOINT: 'joint', REPONDEUR: 'répondeur', PAS_DE_REPONSE: 'pas de réponse', A_RAPPELER: 'à rappeler',
  FAUX_NUMERO: 'faux numéro', ERREUR_IDENTITE: 'pas la bonne personne', DECEDE: 'décédé',
  REFUS_FERME: 'refus', SUIVI_ANCIEN_CONSEILLER: 'parti avec son conseiller',
}
function MesContacts({ onChoisir, onFermer }) {
  const [liste, setListe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [q, setQ] = useState('')
  const [seulement, setSeulement] = useState('')     // '' | 'sms' | 'appeles'
  useEffect(() => {
    api.get('/operation/mes-contacts').then(r => setListe(r.data))
      .catch(err => setErreur(err.messageLisible || 'Chargement impossible.'))
  }, [])
  useEffect(() => {
    const echap = (ev) => { if (ev.key === 'Escape') onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  const motif = q.trim().toLowerCase()
  const chiffres = motif.replace(/\D/g, '')
  const visibles = (liste || []).filter(c => {
    if (seulement === 'sms' && c.dernier_canal !== 'SMS') return false
    if (seulement === 'appeles' && !c.appels) return false
    if (!motif) return true
    if (`${c.nom || ''} ${c.prenom || ''} ${c.nom || ''} ${c.commune || ''}`.toLowerCase().includes(motif)) return true
    return chiffres.length >= 4 && `${c.tel_portable || ''}${c.tel_fixe || ''}`.replace(/\D/g, '').includes(chiffres)
  })
  const nbSms = (liste || []).filter(c => c.dernier_canal === 'SMS').length
  const nbAppeles = (liste || []).filter(c => c.appels).length
  const jour = (d) => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
  const puce = (actif) => `text-xs px-2.5 py-1.5 rounded-full border transition-colors ${actif
    ? 'bg-quai-navy text-white border-quai-navy' : 'border-quai-border text-quai-muted hover:border-quai-gold'}`

  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label="Mes contacts"
        className="bg-white w-full md:max-w-lg h-[90vh] md:h-[85vh] rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-quai-border">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-quai-navy text-sm">Mes contacts{liste ? ` (${liste.length})` : ''}</span>
            <button onClick={onFermer} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy p-2 -mr-2">
              <Icon name="x" size="sm" />
            </button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Nom, commune ou numéro…"
            className="w-full mt-2 px-3 py-2 text-sm rounded-lg border border-quai-border min-h-[2.75rem]
                       focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button onClick={() => setSeulement('')} className={puce(!seulement)}>Tous</button>
            <button onClick={() => setSeulement(seulement === 'appeles' ? '' : 'appeles')} className={puce(seulement === 'appeles')}>
              Déjà appelés <span className="opacity-70">{nbAppeles}</span>
            </button>
            {nbSms > 0 && (
              <button onClick={() => setSeulement(seulement === 'sms' ? '' : 'sms')} className={puce(seulement === 'sms')}>
                SMS envoyé <span className="opacity-70">{nbSms}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-quai-border/60">
          {erreur && <p className="p-4 text-sm text-quai-navy">{erreur}</p>}
          {!erreur && !liste && <p className="p-4 text-sm text-quai-muted">Chargement…</p>}
          {liste && !visibles.length && <p className="p-4 text-sm text-quai-muted">Aucun contact ne correspond.</p>}
          {visibles.slice(0, 200).map(c => (
            <button key={c.id_modelo} onClick={() => onChoisir(c.id_modelo)}
              className="w-full text-left px-4 py-2.5 hover:bg-quai-light transition-colors">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-quai-navy flex-1 truncate">{c.civilite} {c.prenom} {c.nom}</span>
                {c.actualisation === 'ACCEPTEE' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">estimation</span>
                )}
              </div>
              <div className="text-[11px] text-quai-muted">
                {[c.commune,
                  c.appels
                    ? `${c.dernier_canal === 'SMS' ? 'SMS envoyé' : (OU_EN_EST[c.derniere_issue] || 'appelé')} le ${jour(c.dernier_le)}`
                    : 'jamais appelé',
                  c.stop_telephone ? 'ne plus appeler' : null].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
          {visibles.length > 200 && (
            <p className="p-3 text-[11px] text-quai-muted text-center">200 premiers affichés sur {visibles.length}. Affinez la recherche.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Progression({ index, total, bilan, cumul, plage, horsFile, origine, onContacts, recherche, setRecherche,
                      resultats, onOuvrirHorsFile, onListe, onRecap }) {
  const pct = total ? Math.round((index / total) * 100) : 0
  return (
    <div className="bg-white border-b border-quai-border px-3 py-2 shrink-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
          <span className="text-quai-muted">
            {horsFile
              ? <span className="text-quai-gold font-medium">{origine === 'contacts' ? 'Depuis mes contacts' : origine === 'ouverte' ? 'Fiche ouverte' : 'Rappel entrant'}</span>
              : <>Fiche <b className="text-quai-navy">{index + 1}</b> / {total}</>}
          </span>
          <div className="flex items-center gap-2.5 text-[11px]">
            {/* Les quatre objectifs depuis le début de l'opération, pas depuis
                l'ouverture de l'onglet. */}
            {cumul && (
              <span className="text-quai-muted hidden sm:inline">
                <b className="text-quai-navy">{cumul.estimations}</b> est. ·
                {' '}<b className="text-quai-navy">{cumul.soiree}</b> soirée ·
                {' '}<b className="text-quai-navy">{cumul.panneaux}</b> pann. ·
                {' '}<b className="text-quai-navy">{cumul.fiches_a_jour}</b> fiches
              </span>
            )}
            {/* Deux boutons nommés plutôt que deux icônes : « où j'en suis »
                se lit sans deviner. À faire = ce qui reste dans la file ;
                effectués = les appels du jour, corrigeables. */}
            <button onClick={onListe}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-quai-border text-quai-navy hover:border-quai-gold">
              <Icon name="table" size="sm" /> À faire <b>{Math.max(total - index, 0)}</b>
            </button>
            <button onClick={onRecap}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-quai-border text-quai-navy hover:border-quai-gold">
              <Icon name="history" size="sm" /> Effectués <b>{bilan.faits}</b>
            </button>
            <button onClick={onContacts}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-quai-border text-quai-navy hover:border-quai-gold">
              <Icon name="users" size="sm" /> Mes contacts
            </button>
          </div>
        </div>

        <div className="h-1.5 bg-quai-border rounded-full overflow-hidden">
          <div className="h-full bg-quai-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Un client rappelle : on le retrouve sans quitter la session, et on
            revient ensuite exactement où on en était. */}
        <div className="relative mt-2">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted pointer-events-none">
            <Icon name="search" size="sm" />
          </span>
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Il vous rappelle ? Nom ou numéro…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-quai-border bg-white
                       min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
          {resultats.length > 0 && (
            <ul className="absolute z-[1100] left-0 right-0 mt-1 bg-white border border-quai-border
                           rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {resultats.map(c => (
                <li key={c.id_modelo}>
                  <button onClick={() => onOuvrirHorsFile(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-quai-light transition-colors">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-quai-navy flex-1 truncate">
                        {c.civilite} {c.prenom} {c.nom}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-light text-quai-muted shrink-0">
                        script {c.script}
                      </span>
                    </div>
                    <div className="text-[11px] text-quai-muted">
                      {[c.tel_portable || c.tel_fixe, c.commune].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
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

function Termine({ bilan, vide, infos, onRecharger, onRecap, onContacts }) {
  const enAttente = infos?.groupes?.sans_reponse_en_attente || 0
  const retour = infos?.prochain_retour ? new Date(infos.prochain_retour) : null
  const quand = retour && retour.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
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
            <Chiffre valeur={bilan.rdv} libelle="estimations calées" couleur="text-quai-gold" />
            <Chiffre valeur={bilan.fiches} libelle="fiches mises à jour" />
          </div>
        )}
        {vide && <p className="text-sm text-quai-muted mt-1 mb-5">Votre liste est à jour.</p>}
        {enAttente > 0 && quand && (
          <p className="text-sm text-quai-navy bg-white border border-quai-border rounded-xl p-3 mb-4 leading-snug">
            {enAttente} {enAttente > 1 ? 'personnes n’ont pas répondu' : 'personne n’a pas répondu'}.
            {' '}On les rappelle 48 h après le dernier essai : le premier revient {quand}.
          </p>
        )}
        <p className="text-[11px] text-quai-muted mb-3 leading-snug">
          Un client vous a répondu ? Retrouvez sa fiche dans « Mes contacts » pour la compléter.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button onClick={onRecharger} className="btn-primary inline-flex items-center gap-2">
            <Icon name="refresh-cw" size="sm" /> Recharger la liste
          </button>
          <button onClick={onContacts} className="btn-secondary inline-flex items-center gap-2">
            <Icon name="users" size="sm" /> Mes contacts
          </button>
          {bilan.faits > 0 && (
            <button onClick={onRecap} className="btn-secondary inline-flex items-center gap-2">
              <Icon name="history" size="sm" /> Revoir mes appels
            </button>
          )}
        </div>
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
                {c.courrier_etat !== 'ENVOYE' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-quai-light text-quai-muted">
                    courrier non envoyé
                  </span>
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
