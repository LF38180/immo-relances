import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'
import SaisieAdresse from '../../components/SaisieAdresse'
import { Initiales, Pastille } from './ui'

// La carte des quartiers de Grenoble : chargée seulement quand « Grenoble »
// figure dans les secteurs d'une recherche.
const QuartiersGrenoble = lazy(() => import('./QuartiersGrenoble'))
const avecGrenoble = (s) => String(s || '').split(',').some(x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim() === 'grenoble')

// L'écran d'appel du Fichier Acquéreurs (cahier, section 4). Il suit l'appel
// dans l'ordre : ouverture, coordonnées, projet (par fiche gardée), vendre
// pour acheter, issue. Une personne peut avoir plusieurs fiches : chacune
// reçoit une décision (garder, fusionner, archiver) avant de passer au suivant.

const NIVEAUX = [['', '—'], ['INDISPENSABLE', 'Indispensable'], ['IMPORTANT', 'Important'], ['OPTIONNEL', 'Optionnel'], ['REDHIBITOIRE', 'Rédhibitoire']]
const CRITERES = ['Surface du séjour', 'Balcon', 'Terrasse', 'Jardin', 'Ascenseur', 'Dernier étage', 'Cave', 'Sous-sol', 'Piscine', 'État intérieur', 'Chauffage', 'Accès PMR']
const DEPUIS_MODELO = { jardin: 'Jardin', ascenseur: 'Ascenseur', piscine: 'Piscine', pmr: 'Accès PMR', dernier_etage: 'Dernier étage', balcon: 'Balcon', terrasse: 'Terrasse', cave: 'Cave' }
const AVEC_VALEUR = ['Surface du séjour', 'État intérieur', 'Chauffage']
const FIN_VALIDE = [['ACCORD', 'Oui, accord de principe bancaire'], ['SIMULATION', 'Oui, simulation faite'], ['COMPTANT', 'Oui, achat comptant'], ['EN_COURS', 'En cours'], ['NON', 'Non, rien de fait']]
// Les mêmes issues que l'opération anciens clients, dans le même ordre :
// l'issue se choisit en premier, et l'écran ne s'ouvre que sur « Joint ».
// Troisième valeur : la teinte une fois choisie (vert = joint, rouge = refus).
const ISSUES = [['JOINT', 'Joint', 'emerald'], ['REPONDEUR', 'Répondeur'], ['PAS_DE_REPONSE', 'Pas de réponse'], ['A_RAPPELER', 'À rappeler'],
  ['FAUX_NUMERO', 'Faux numéro'], ['ERREUR_IDENTITE', 'Pas la bonne personne'], ['DECEDE', 'Décédé'],
  ['REFUS_FERME', 'Refus — ne plus appeler', 'red'], ['SMS', 'SMS envoyé'], ['MAIL', 'Mail envoyé']]
const TENTATIVES = ['REPONDEUR', 'PAS_DE_REPONSE', 'SMS', 'MAIL', 'FAUX_NUMERO']
// Joint : la suite donnée au projet.
const STATUTS = [['REQUALIFIE', 'Requalifié'], ['A_RAPPELER', 'À rappeler'], ['EN_PAUSE', 'En pause'], ['ABANDONNE', 'Abandonné'], ['DEJA_ACHETE', 'Déjà acheté']]
const ACTIONS = ['Visite', 'Estimation', 'Rendez-vous de signature', 'Alerte Modelo à créer', 'Rappel', 'Retour au conseiller']
// Le mandat de recherche (complément au cahier, 18/11).
const RDV_SIGNATURE = 'Rendez-vous de signature'
const ETATS_MANDAT = [['NON_PROPOSE', 'Pas proposé'], ['PROPOSE', 'Proposé'], ['ACCEPTE', 'Accepté'], ['REFUSE', 'Refusé'], ['A_REPROPOSER', 'À reproposer']]
const aujourdhui = () => new Date().toLocaleDateString('fr-CA')
const jj = (s) => s ? new Date(String(s).includes('T') || String(s).length <= 10 ? s : String(s).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR') : ''
const euros = (n) => Number(n) > 0 ? Math.round(Number(n)).toLocaleString('fr-FR') + ' €' : ''

// La suite donnée déduite de l'état du projet (partie 2), sur les recherches gardées :
// un projet actif = requalifié ; sinon en pause, déjà acheté ou abandonné.
// « À rappeler » ne se déduit pas : c'est l'agent qui le choisit.
function statutDepuisProjets(n) {
  const etats = Object.values(n.fiches || {}).filter(f => f.decision === 'GARDER').map(f => f.projet?.etat_projet).filter(Boolean)
  if (etats.includes('ACTIF')) return 'REQUALIFIE'
  if (etats.includes('EN_PAUSE')) return 'EN_PAUSE'
  if (etats.includes('DEJA_ACHETE')) return 'DEJA_ACHETE'
  if (etats.includes('ABANDONNE')) return 'ABANDONNE'
  return null
}
// Déjà acheté, abandonné : les recherches sans décision partent à l'archivage,
// motif déjà écrit. Plus besoin de le retaper sur chacune.
function appliquerStatut(n, v) {
  n.statut_final = v
  const motif = v === 'DEJA_ACHETE' ? 'a déjà acheté' : v === 'ABANDONNE' ? 'projet abandonné' : null
  if (motif) for (const f of Object.values(n.fiches)) if (!f.decision) { f.decision = 'ARCHIVER'; f.motif = motif }
}

function manques(p = {}) {
  const m = []
  if (p.etat_projet !== 'ACTIF') m.push('projet actif')
  if (!(Number(p.budget_max) > 0)) m.push('budget')
  if (!String(p.secteurs || '').trim()) m.push('secteur')
  if (!p.date_emmenagement && !(Number(p.urgence) >= 1)) m.push('délai')
  if (!p.mode_financement) m.push('mode de financement')
  if (!p.financement_valide) m.push('financement validé ou non')
  return m
}

function Choix({ options, valeur, onChange, petit }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(valeur === v ? null : v)}
          className={`rounded-lg border px-2.5 min-h-[2.75rem] md:min-h-0 ${petit ? 'py-1 text-xs' : 'py-1.5 text-sm'} transition-colors ${valeur === v ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-text hover:bg-quai-light'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Partie({ num, ancre, titre, aide, script, children, ouverte, onBasculer, faite }) {
  return (
    <section id={ancre} className={`bg-white border rounded-xl mb-2.5 scroll-mt-40 transition-colors ${ouverte ? 'border-quai-gold/70 shadow-sm' : 'border-quai-border'}`}>
      <button type="button" onClick={onBasculer} className="w-full text-left px-3 py-3 flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${faite ? 'bg-emerald-600 text-white' : ouverte ? 'bg-quai-navy text-quai-gold' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
          {faite ? <Icon name="check-circle-2" size="sm" /> : (num ?? <Icon name="search" size="sm" />)}
        </span>
        <span className="font-display font-semibold text-quai-navy flex-1 leading-tight">{titre}{aide && <span className="font-sans font-normal text-xs text-quai-muted"> · {aide}</span>}</span>
        <Icon name={ouverte ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted" />
      </button>
      {ouverte && (
        <div className="px-3 pb-3.5">
          {script && <BlocScript>{script}</BlocScript>}
          {children}
        </div>
      )}
    </section>
  )
}

// Ce que l'agent dit : un encart à part, pour ne pas le confondre avec ce
// qu'il saisit.
const BlocScript = ({ children }) => (
  <div className="border-l-4 border-quai-gold bg-quai-gold/10 rounded-r-lg px-3 py-2.5 text-[13px] text-quai-text mb-3 whitespace-pre-line leading-relaxed">{children}</div>
)

// Où j'en suis dans l'appel : les parties, cochées au fur et à mesure. Un
// clic ouvre la partie et y fait défiler l'écran.
function Etapes({ etapes, onAller }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar mt-3 pt-3 border-t border-quai-border">
      {etapes.map((e, i) => (
        <li key={e.k} className="flex items-center gap-1 shrink-0">
          {i > 0 && <span className={`w-3 h-px ${e.fait ? 'bg-emerald-500' : 'bg-quai-border'}`} aria-hidden="true" />}
          <button type="button" onClick={() => onAller(e)}
            className={`text-[11px] px-2 py-1 rounded-full border inline-flex items-center gap-1 whitespace-nowrap transition-colors ${e.fait ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-quai-muted border-quai-border hover:border-quai-gold'}`}>
            {e.fait && <Icon name="check-circle-2" size="sm" />}{e.l}
          </button>
        </li>
      ))}
    </ol>
  )
}

// Un <label> qui entoure des boutons transmet le clic au premier d'entre eux :
// toucher le libellé cochait « Actif » ou « Propriétaire » sans qu'on le voie.
// Autour d'un groupe de boutons, c'est donc un simple groupe, pas un label.
const Champ = ({ label, children }) => (children?.type === Choix
  ? <div role="group" aria-label={label}><span className="block text-[11px] text-quai-muted mb-0.5">{label}</span>{children}</div>
  : <label className="block"><span className="text-[11px] text-quai-muted">{label}</span>{children}</label>)

// Dates proposées d'un clic pour un rappel : demain 10 h, dans deux jours 18 h,
// dans une semaine. Jamais un samedi ni un dimanche.
const pad = (n) => String(n).padStart(2, '0')
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
function dansJours(n, h) {
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0)
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1)
  return local(d)
}
const RACCOURCIS = [['Demain 10 h', () => dansJours(1, 10)], ['Demain 18 h', () => dansJours(1, 18)], ['Dans 2 jours', () => dansJours(2, 10)], ['Dans 1 semaine', () => dansJours(7, 10)]]
const horsPlage = (v) => { const m = /T(\d{2}):(\d{2})/.exec(v || ''); if (!m) return false
  const j = new Date(v).getDay(), t = +m[1] * 60 + +m[2]
  return j === 0 || j === 6 || t < 600 || (t >= 780 && t < 840) || t >= 1200 }
function ChoixDate({ valeur, onChange }) {
  return (
    <div>
      <input type="datetime-local" className="input max-w-[14rem] mt-0.5" value={valeur || ''} onChange={e => onChange(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {RACCOURCIS.map(([l, f]) => <button key={l} type="button" onClick={() => onChange(f())} className="text-xs px-2.5 py-1.5 min-h-[2.75rem] md:min-h-0 rounded-full border border-quai-border bg-white text-quai-navy hover:border-quai-gold">{l}</button>)}
      </div>
      {valeur && valeur < local(new Date()) && <p className="text-[11px] text-amber-800 mt-1">Cette date est déjà passée.</p>}
      {valeur && valeur >= local(new Date()) && horsPlage(valeur) && <p className="text-[11px] text-amber-800 mt-1">En dehors des horaires d’appel (lundi au vendredi, 10 h-13 h et 14 h-20 h).</p>}
    </div>
  )
}

// Ce qui est saisi survit à un rechargement : une coupure réseau ou un onglet
// fermé par erreur ne doit pas faire perdre un appel de vingt minutes.
const cleBrouillon = (id) => `acq-brouillon-${id}`
const lireBrouillon = (id) => { try { return JSON.parse(localStorage.getItem(cleBrouillon(id)) || 'null') } catch { return null } }
const ecrireBrouillon = (id, v) => { try { localStorage.setItem(cleBrouillon(id), JSON.stringify(v)) } catch { /* stockage indisponible */ } }
const effacerBrouillon = (id) => { try { localStorage.removeItem(cleBrouillon(id)) } catch { /* idem */ } }

// L'état de départ d'une recherche à l'écran. Si elle a déjà été traitée, on
// repart de ce qui est enregistré : sa décision, son motif, et son projet —
// en remettant TOUS les critères dans la liste (seuls ceux qui avaient un
// niveau sont stockés, les autres doivent rester proposables).
function ficheVierge(f) {
  const depuisModelo = (f.criteres_obligatoires || '').split(', ').map(x => DEPUIS_MODELO[x])
  const stockes = Array.isArray(f.requalif?.criteres) ? f.requalif.criteres : []
  const criteres = CRITERES.map(k => stockes.find(x => x.critere === k)
    || { critere: k, valeur: '', niveau: !f.requalif && depuisModelo.includes(k) ? 'INDISPENSABLE' : '' })
  const base = f.requalif
    ? { ...f.requalif, secteurs: Array.isArray(f.requalif.secteurs) ? f.requalif.secteurs.join(', ') : (f.requalif.secteurs || '') }
    : { etat_projet: null, type_bien: f.type_bien || '', budget_min: f.budget_min || '', budget_max: f.budget_max || '',
        surface_min: f.surface_min || '', pieces: f.pieces_min || '', chambres: f.chambres_min || '', secteurs: f.communes || '' }
  return { decision: f.decision || null, fusion_dans: f.fusion_dans || '', motif: f.motif_archivage || '', projet: { ...base, criteres } }
}

// Le dernier SMS envoyé, gardé sur l'appareil : on envoie souvent le même
// (repris de l'opération anciens clients).
const CLE_DERNIER_SMS = 'acq-dernier-sms'
const dernierSms = () => { try { return localStorage.getItem(CLE_DERNIER_SMS) || '' } catch { return '' } }

export default function AcqAppel({ id, position, onSuivant, onRetour, onPasser, horsFile, revenir, demo, lecture = false, entrantInitial = false }) {
  const [d, setD] = useState(null)
  const [s, setS] = useState(null)       // la saisie
  const [ouv, setOuv] = useState({ fiches: true, p0: true })
  const [envoi, setEnvoi] = useState(false)
  const cle = useRef(null)
  // Un brouillon repris d'une autre fois : on le dit, avec sa date.
  const [repris, setRepris] = useState(null)
  // C'est la personne qui rappelle (fiche ouverte depuis « Il vous rappelle ? ») :
  // ni la plage ni le plafond ne s'appliquent à un appel qu'elle passe elle-même.
  const [entrant, setEntrant] = useState(entrantInitial)

  useEffect(() => {
    setD(null); setS(null); setRepris(null); cle.current = `${id}-${Date.now()}`
    // Démonstration : les données arrivent toutes faites, rien n'est lu ni
    // écrit sur le serveur.
    ;(demo ? Promise.resolve({ data: demo }) : api.get(`/acquereurs/contacts/${id}`)).then(r => {
      setD(r.data)
      const c = r.data.contact
      const init = {
        issue: null, rappel_le: '', texte: '', sms_foulee: false, ouverture: null, notes: '', consentement_rappel: false, stop_mail: false, achat: '',
        coordonnees: {
          tel_portable: { etat: null, avant: c.tel_portable || '', apres: '' },
          tel_fixe: { etat: null, avant: c.tel_fixe || '', apres: '' },
          email: { etat: null, avant: c.email || '', apres: '' },
          adresse: { etat: null, avant: { adresse: c.adresse || '', code_postal: c.code_postal || '', commune: c.commune || '' }, apres: { adresse: '', code_postal: '', commune: '' } },
        },
        fiches: Object.fromEntries(r.data.fiches.map(f => [f.id_fiche, ficheVierge(f)])),
        // Ce que les appels d'avant ont appris et qui reste vrai : la situation
        // de logement et le mandat. Sans cela tout repartait à vide au rappel,
        // et le report Modelo perdait la ligne SITUATION.
        vendre: { ...(r.data.memoire?.vendre || {}) }, marine: {},
        mandat: { etat: null, type: 'NON_PRECISE', date_acceptation: '', motif_refus: '', ...(r.data.memoire?.mandat || {}) },
        statut_final: null, prochaine_action: null, date_prochaine_action: '',
      }
      // Le brouillon porte l'identifiant de sa fiche : on ne reprend jamais
      // celui d'une autre personne.
      const b = demo ? null : lireBrouillon(id)
      if (b && b._id === id) {
        // Le brouillon est remis d'aplomb avec les fiches d'aujourd'hui : un
        // réimport a pu en ajouter une (ou en retirer) depuis qu'il a été écrit.
        const fiches = Object.fromEntries(r.data.fiches.map(f => [f.id_fiche, b.fiches?.[f.id_fiche] || ficheVierge(f)]))
        // La clé d'envoi suit le brouillon : après un rechargement de page, un
        // appel déjà parti n'est pas enregistré une seconde fois.
        if (b._cle) cle.current = b._cle
        // L'issue n'est pas reprise : elle se choisit à chaque appel.
        setS({ ...init, ...b, issue: null, fiches, coordonnees: { ...init.coordonnees, ...(b.coordonnees || {}) } })
        const touche = b.ouverture || b.notes || b.statut_final || Object.values(b.coordonnees || {}).some(x => x?.etat)
        if (touche && b._le) setRepris(b._le)
      } else setS({ ...init, _id: id, _cle: cle.current, _le: new Date().toISOString() })
    }).catch(() => setD({ erreur: true }))
  }, [id])
  // Au changement de fiche, `s` est encore celle d'avant pendant un rendu :
  // sans ce contrôle, la saisie de la personne précédente était recopiée
  // dans le brouillon de la suivante.
  useEffect(() => { if (s && s._id === id && !demo) ecrireBrouillon(id, s) }, [id, s, demo])
  // Ce qui bloque (stop, plafond) et ce qui avertit (l'heure) change dans la
  // journée : l'écran le redemande chaque minute.
  useEffect(() => {
    if (demo) return
    const t = setInterval(() => {
      api.get(`/acquereurs/contacts/${id}/blocages`).then(r => setD(prev => prev && prev.contact ? { ...prev, blocages: r.data.blocages, alertes: r.data.alertes || [] } : prev)).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [id, demo])

  const c = d?.contact
  const gardees = useMemo(() => s ? Object.entries(s.fiches).filter(([, f]) => f.decision === 'GARDER').map(([k]) => k) : [], [s])
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  if (d.erreur) return <p className="p-6 text-sm text-red-700">La fiche n’a pas pu être chargée. <button className="underline" onClick={onRetour}>Revenir</button></p>
  if (!s) return null

  const maj = (chemin, valeur) => setS(prev => {
    const n = structuredClone(prev); let o = n
    for (const k of chemin.slice(0, -1)) o = o[k]
    o[chemin[chemin.length - 1]] = valeur
    // La « suite donnée » redit l'état du projet saisi plus haut : elle se remplit
    // toute seule, tant que l'agent ne l'a pas choisie lui-même.
    const dernier = chemin[chemin.length - 1]
    if ((dernier === 'etat_projet' || dernier === 'decision') && !n._statut_manuel) {
      const auto = statutDepuisProjets(n)
      if (auto) appliquerStatut(n, auto)
    }
    return n
  })
  const bloque = !entrant && d.blocages.length > 0
  // « Remplie » : quelque chose a été saisi PENDANT cet appel. Les décisions
  // déjà enregistrées lors d'un appel précédent ne comptent pas — sinon
  // l'alerte sautait à chaque répondeur sur une personne déjà jointe.
  const remplie = s.ouverture === 'OK' || !!s.statut_final || Object.values(s.coordonnees).some(x => x.etat)
    || d.fiches.some(f => (s.fiches[f.id_fiche]?.decision || null) !== (f.decision || null))
  const script = (p) => {
    const t = d.scripts?.[p]
    if (!t) return `Emplacement du script (partie ${p}) : à rédiger dans Mission Acquéreurs › Paramètres.`
    return t.replace(/\{civilite\}/g, c.civilite || '').replace(/\{prenom\}/g, c.prenom || '').replace(/\{nom\}/g, c.nom || '')
  }
  // Le projet et la suite donnée sont ouverts d'office : le premier clic doit
  // donc les replier, pas les « ouvrir » une seconde fois.
  const basculer = (k) => setOuv(o => ({ ...o, [k]: !(o[k] ?? (k.startsWith('p2') || k === 'p4')) }))

  const finDemo = (msg) => { toast.success(`Démonstration : ${msg}. Rien n’est enregistré.`); onSuivant() }
  const tentative = async (issue, canal = 'APPEL') => {
    if (envoi) return
    if (demo) return finDemo(canal === 'SMS' ? 'SMS noté' : canal === 'MAIL' ? 'mail noté' : 'tentative notée')
    // Repris de l'opération : une fiche déjà remplie qu'on enregistre en
    // « répondeur » ou « pas de réponse », c'est presque toujours une erreur
    // de bouton. On demande avant de perdre la conversation.
    if (remplie && !window.confirm(`La fiche est remplie, mais l’issue choisie est « ${ISSUES.find(x => x[0] === s.issue)?.[1]} ». Enregistrer quand même ?`)) return
    setEnvoi(true)
    try {
      const foulee = canal === 'APPEL' && issue !== 'FAUX_NUMERO' && s.sms_foulee
      await api.post(`/acquereurs/contacts/${id}/tentative`, { issue, canal, cle: cle.current + '-' + issue + canal, notes: s.notes || null,
        sms: foulee || undefined, texte: canal !== 'APPEL' || foulee ? (s.texte || '').trim() || null : null })
      if ((canal === 'SMS' || foulee) && (s.texte || '').trim()) { try { localStorage.setItem(CLE_DERNIER_SMS, s.texte.trim()) } catch { /* stockage indisponible */ } }
      effacerBrouillon(id)
      toast.success(canal === 'SMS' ? 'SMS noté' : canal === 'MAIL' ? 'Mail noté' : issue === 'FAUX_NUMERO' ? 'Faux numéro noté' : foulee ? 'Tentative et SMS notés' : 'Tentative notée')
      onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }

  // `impose` : la conversation a eu lieu, mais l'issue retenue est « à
  // rappeler ». Tout ce qui a été saisi part quand même — avant, changer
  // l'issue de « Joint » à « À rappeler » jetait la saisie sans prévenir.
  const cloturer = async (impose = null) => {
    if (envoi) return
    const statut = impose?.statut || s.statut_final
    const dateAction = impose ? impose.date : s.date_prochaine_action
    const mandat = s.mandat || { etat: null }
    const mandatVisible = statut === 'REQUALIFIE' || Object.values(s.fiches).some(f => f.decision === 'GARDER' && f.projet?.etat_projet === 'ACTIF')
    const sansProjet = ['A_RAPPELER', 'ERREUR_IDENTITE', 'DECEDE'].includes(statut)
    if (!statut) return toast.error('Choisissez la suite donnée.')
    if (statut === 'A_RAPPELER' && !dateAction) return toast.error('Précisez quand rappeler.')
    if (mandat.etat === 'ACCEPTE' && !mandat.date_acceptation) return toast.error('Mandat de recherche accepté : indiquez la date d’acceptation.')
    const vide = Object.entries(s.coordonnees).find(([k, x]) => ['MODIFIE', 'AJOUTE'].includes(x.etat) && !(k === 'adresse' ? x.apres?.adresse : String(x.apres || '').trim()))
    if (vide) return toast.error('Coordonnées : indiquez la nouvelle valeur, ou choisissez « Confirmé ».')
    if (!sansProjet) {
      const oubli = Object.values(s.fiches).filter(f => !f.decision).length
      if (oubli) return toast.error(`Décision manquante sur ${oubli} recherche${oubli > 1 ? 's' : ''}.`)
    }
    const fiches = Object.fromEntries(Object.entries(s.fiches).filter(([, f]) => f.decision).map(([k, f]) => [k, {
      decision: f.decision, fusion_dans: f.fusion_dans || null, motif: f.motif,
      projet: f.decision === 'GARDER' ? { ...f.projet, secteurs: String(f.projet.secteurs || '').split(',').map(x => x.trim()).filter(Boolean),
        criteres: (f.projet.criteres || []).filter(x => x.niveau) } : null,
    }]))
    const coordonnees = Object.fromEntries(Object.entries(s.coordonnees).filter(([, x]) => x.etat))
    if (demo) return finDemo('appel enregistré')
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/cloture`, {
        cle: cle.current + '-cloture', statut_final: statut, prochaine_action: impose ? 'Rappel' : s.prochaine_action,
        date_prochaine_action: dateAction || null, notes: s.notes || null, consentement_rappel: s.consentement_rappel,
        joint: true, coordonnees, vendre: s.vendre, marine: s.marine, fiches, entrant,
        stop_mail: s.stop_mail || undefined, achat: statut === 'DEJA_ACHETE' ? (s.achat || '').trim() || null : null,
        mandat: mandatVisible && mandat.etat ? mandat : null,
      })
      effacerBrouillon(id)
      toast.success('Appel enregistré')
      onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }
  const neplus = async () => {
    if (!window.confirm('Enregistrer que cette personne ne souhaite plus être contactée ? Elle sort de votre file et de l’opération anciens clients ; l’administration est prévenue pour les autres missions.')) return
    if (demo) return finDemo('opposition notée')
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/cloture`, { cle: cle.current + '-npc', statut_final: 'NE_PLUS_CONTACTER', notes: s.notes || null })
      effacerBrouillon(id); toast.success('Opposition enregistrée'); onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }

  // Un seul bouton en bas : il fait ce que l'issue choisie demande.
  const enregistrer = async () => {
    const i = s.issue
    if (!i) return toast.error('Choisissez l’issue de l’appel.')
    if (TENTATIVES.includes(i)) return tentative(i === 'SMS' || i === 'MAIL' ? 'PAS_DE_REPONSE' : i, i === 'SMS' ? 'SMS' : i === 'MAIL' ? 'MAIL' : 'APPEL')
    if (i === 'REFUS_FERME') return neplus()
    if (i === 'JOINT') return cloturer()
    if (i === 'A_RAPPELER' && !s.rappel_le) return toast.error('Précisez quand rappeler.')
    // La personne a été jointe, la fiche est remplie, et on convient de se
    // rappeler : la saisie part avec l'appel.
    if (i === 'A_RAPPELER' && remplie) return cloturer({ statut: 'A_RAPPELER', date: s.rappel_le })
    if (remplie && !window.confirm(`La fiche est remplie, mais l’issue choisie est « ${ISSUES.find(x => x[0] === i)?.[1]} » : la saisie ne sera pas gardée. Enregistrer quand même ?`)) return
    if (demo) return finDemo('appel enregistré')
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/cloture`, { cle: cle.current + '-' + i, statut_final: i, entrant,
        date_prochaine_action: i === 'A_RAPPELER' ? s.rappel_le : null, prochaine_action: i === 'A_RAPPELER' ? 'Rappel' : null, notes: s.notes || null })
      effacerBrouillon(id); toast.success('Appel enregistré'); onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }

  const statutChoisi = s.statut_final
  const joint = s.issue === 'JOINT'
  // Le mandat de recherche se propose à un contact requalifié ou en passe de
  // l'être : dès qu'une recherche est gardée avec un projet actif.
  const mandat = s.mandat || { etat: null, type: 'NON_PRECISE', date_acceptation: '', motif_refus: '' }
  const mandatVisible = statutChoisi === 'REQUALIFIE' || gardees.some(k => s.fiches[k].projet?.etat_projet === 'ACTIF')
  const etapes = [
    { k: 'fiches', ancre: 'acq-fiches', l: 'Recherches', fait: Object.values(s.fiches).every(f => f.decision) },
    { k: 'p0', ancre: 'acq-p0', l: 'Ouverture', fait: s.ouverture === 'OK' },
    { k: 'p1', ancre: 'acq-p1', l: 'Coordonnées', fait: Object.values(s.coordonnees).every(x => x.etat) },
    ...gardees.map(k => ({ k: 'p2' + k, ancre: 'acq-p2' + k, l: gardees.length > 1 ? `Projet ${k}` : 'Projet', fait: manques(s.fiches[k].projet).length === 0 })),
    { k: 'p3', ancre: 'acq-p3', l: 'Vendre', fait: !!s.vendre.statut_logement },
    ...(mandatVisible ? [{ k: 'pm', ancre: 'acq-pm', l: 'Mandat', fait: !!mandat.etat }] : []),
    { k: 'p4', ancre: 'acq-p4', l: 'Suite', fait: !!s.statut_final },
  ]
  // Requalifié = le projet est toujours d'actualité (décision du 20/11). Ce qui manque
  // à la fiche n'empêche plus d'enregistrer : c'est un simple rappel.
  const projetActif = gardees.some(k => s.fiches[k].projet?.etat_projet === 'ACTIF')
  const statutAuto = statutDepuisProjets(s)
  const manquesReq = gardees.length ? gardees.flatMap(k => manques(s.fiches[k].projet).map(m => gardees.length > 1 ? `${m} (recherche ${k})` : m)) : ['au moins une recherche gardée']
  const tels = [...new Set([c.tel_portable, c.tel_fixe].filter(Boolean))]
  // Pourquoi le bouton du bas est grisé : dit en clair, juste au-dessus.
  const raison = lecture ? 'Lecture seule : vous regardez l’écran de l’agent. Pour agir sur une fiche, ouvrez-la depuis l’onglet Contacts.'
    : !s.issue ? 'Choisissez l’issue de l’appel.'
    : bloque && s.issue !== 'MAIL' ? d.blocages[0]
    : joint && !statutChoisi ? 'Il manque : la suite donnée.'
    : joint && statutChoisi === 'REQUALIFIE' && !projetActif ? 'Requalifié : le projet doit être « Actif » sur au moins une recherche gardée.'
    : null
  const versSuite = () => { setOuv(o => ({ ...o, p4: true })); setTimeout(() => document.getElementById('acq-p4')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }
  // Au rappel : ce qui avait été convenu, et la dernière note, sous les yeux.
  const dernierAppel = d.appels[0]
  const derniereNote = d.appels.find(a => a.notes)
  const quand = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || '')); return m ? `${m[3]}/${m[2]}${m[4] ? ` à ${m[4]} h ${m[5]}` : ''}` : '' }
  const horodate = (v) => new Date(String(v).replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  // Déjà acheté, abandonné : toutes les recherches sans décision partent à
  // l'archivage, motif déjà écrit. Plus besoin de le retaper sur chacune.
  // Choix fait à la main : il prime ensuite sur le remplissage automatique, sauf si
  // l'agent recoche exactement ce que l'état du projet donnait.
  const choisirStatut = (v) => setS(prev => {
    const n = structuredClone(prev)
    appliquerStatut(n, v)
    n._statut_manuel = !!v && v !== statutDepuisProjets(n)
    return n
  })

  return (
    <div className="p-3 max-w-3xl mx-auto pb-32">
      <div className="flex items-center gap-2 mb-2 text-xs text-quai-muted">
        <button onClick={onRetour} className="inline-flex items-center gap-1 hover:text-quai-navy py-2 -my-2 pr-2"><Icon name="arrow-left" size="sm" /> Ma file</button>
        {revenir && <button onClick={revenir.aller} className="inline-flex items-center gap-1 text-quai-navy underline py-2 -my-2">{revenir.libelle}</button>}
        <span className="ml-auto">{position}</span>

      </div>

      {/* En-tête : qui j'appelle, et le bouton pour l'appeler */}
      <div className="bg-white border border-quai-border rounded-2xl p-3.5 mb-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <Initiales prenom={c.prenom} nom={c.nom} taille="lg" ton="marine" />
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold text-xl text-quai-navy leading-tight">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
            <div className="text-xs text-quai-muted truncate">{[c.email, c.commune].filter(Boolean).join(' · ') || 'Pas d’e-mail connu'}</div>
          </div>
          {/* Tous les numéros connus : sur un sans-réponse, on essaie le fixe.
              Appel interdit (stop, plafond, hors file) : le bouton ne compose pas. */}
          {tels.length === 0 ? <Pastille ton="ambre">Pas de téléphone</Pastille> : (
            <div className="w-full sm:w-auto flex flex-wrap gap-1.5">
              {/* Téléphone barré = appel interdit pour CETTE personne. En lecture seule
                  (l'admin regarde l'écran de l'agent), le numéro ne compose pas mais
                  il n'est pas barré : sinon toutes les fiches semblaient bloquées. */}
              {tels.map((t, i) => bloque || lecture
                ? <span key={t} title={bloque ? 'Appel interdit pour cette personne' : 'Lecture seule : le numéro ne se compose pas depuis cet écran'}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 ${bloque ? 'bg-quai-light text-quai-muted border-quai-border' : 'bg-white text-quai-navy border-quai-border'}`}>
                    <Icon name={bloque ? 'phone-off' : 'phone'} size="sm" /> {t}</span>
                : <a key={t} href={`tel:${t.replace(/\s/g, '')}`} className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl font-semibold px-4 py-2.5 transition-colors ${i === 0 ? 'bg-quai-gold text-quai-navy hover:bg-quai-goldlt' : 'bg-white text-quai-navy border border-quai-gold hover:bg-quai-light'}`}>
                    <Icon name="phone" size="sm" /> {t}
                  </a>)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Pastille ton="or">{c.source === 'DELEGUE' ? 'Délégué' : 'Orphelin'}{c.anciens_conseillers ? ` · ancien conseiller : ${c.anciens_conseillers}` : ''}</Pastille>
          <Pastille ton={c.appels_ce_mois >= 3 ? 'ambre' : 'neutre'}>{c.appels_ce_mois} appel{c.appels_ce_mois > 1 ? 's' : ''} ce mois sur 4</Pastille>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {c.stop_tel ? <Pastille ton="rouge">Stop tél.</Pastille> : null}
          {c.stop_mail ? <Pastille ton="rouge">Stop mail</Pastille> : null}
          {d.appel_recent && <Pastille ton="ambre">Appelé le {jj(d.appel_recent.le)} par {d.appel_recent.par} ({d.appel_recent.module})</Pastille>}
        </div>
        {c.statut === 'A_RAPPELER' && c.rappel_le && (
          <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
            <b>Rappel convenu : {quand(c.rappel_le)}.</b>
          </div>
        )}
        {derniereNote && (
          <div className="mt-2.5 bg-quai-gold/10 border-l-4 border-quai-gold rounded-r-lg px-3 py-2">
            <div className="text-[11px] text-quai-muted">Votre dernière note · {horodate(derniereNote.horodatage)}</div>
            <p className="text-[13px] text-quai-text mt-0.5 whitespace-pre-line">{derniereNote.notes}</p>
          </div>
        )}
        {repris && (
          <div className="mt-2.5 rounded-lg bg-quai-light border border-quai-border text-xs text-quai-text px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="flex-1">Saisie commencée le {new Date(repris).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}, reprise ici.</span>
            <button type="button" className="underline text-quai-navy py-2 -my-2" onClick={() => { effacerBrouillon(id); onRetour() }}>Effacer et repartir de zéro</button>
          </div>
        )}
        {(c.derniere_note_date || c.derniere_note_extrait) && (
          <div className="mt-2.5 bg-quai-light rounded-lg px-3 py-2">
            <div className="text-[11px] text-quai-muted">Dernière note Modelo{c.derniere_note_date ? ` · ${jj(c.derniere_note_date)}` : ''}{c.derniere_note_auteur ? ` · ${c.derniere_note_auteur}` : ''}</div>
            {c.derniere_note_extrait && <p className="text-[13px] text-quai-text mt-0.5 line-clamp-3">« {c.derniere_note_extrait} »</p>}
          </div>
        )}
        {horsFile && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-amber-800">Fiche ouverte hors de l’ordre de la file.</span>
            {!demo && (
              <label className="inline-flex items-center gap-1.5 text-quai-navy cursor-pointer">
                <input type="checkbox" className="w-5 h-5" checked={entrant} onChange={e => setEntrant(e.target.checked)} />
                C’est la personne qui m’a rappelé (le plafond et les stops ne s’appliquent pas)
              </label>
            )}
          </div>
        )}
        {/* Comme dans l'opération : ce qui est déjà dans Modelo, et ce qui attend. */}
        {c.modelo_reporte_le
          ? <p className="text-[11px] text-emerald-700 mt-1">Mise à jour Modelo faite le {new Date(String(c.modelo_reporte_le).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}{c.dernier_appel_le && c.dernier_appel_le > c.modelo_reporte_le ? ' · du nouveau depuis, à reporter' : ''}</p>
          : c.appels_total > 0 && <p className="text-[11px] text-quai-muted mt-1">Pas encore reporté dans Modelo.</p>}
        {d.appels.length > 0 && (
          <details className="mt-1.5" open={d.appels.length <= 3}>
            <summary className="text-[11px] text-quai-navy cursor-pointer py-1">Historique dans l’appli ({d.appels.length})</summary>
            <ul className="text-[11px] text-quai-muted mt-1 space-y-0.5">
              {d.appels.map(a => <li key={a.id}>{new Date(String(a.horodatage).replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {a.canal === 'SMS' ? 'SMS envoyé' : a.canal === 'MAIL' ? 'mail envoyé' : (STATUTS.find(x => x[0] === a.statut_final)?.[1] || ISSUES.find(x => x[0] === a.issue)?.[1] || a.issue)}{a.canal === 'APPEL' && a.texte ? ' + SMS' : ''}{a.texte ? ` : « ${a.texte} »` : ''}{a.notes ? ` · ${a.notes}` : ''} · {a.madame_fichier}</li>)}
            </ul>
          </details>
        )}
        {bloque && (
          <div className="mt-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2.5 flex gap-2">
            <Icon name="phone-off" size="sm" className="shrink-0 mt-0.5" /><div>{d.blocages.map(b => <div key={b}>{b}</div>)}</div>
          </div>
        )}
        {!bloque && !entrant && (d.alertes || []).length > 0 && (
          <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2.5 flex gap-2">
            <Icon name="alert-triangle" size="sm" className="shrink-0 mt-0.5" /><div>{d.alertes.map(b => <div key={b}>{b}</div>)}<div className="text-[11px] mt-0.5">Simple rappel : l’appel peut être enregistré.</div></div>
          </div>
        )}
        {joint && <Etapes etapes={etapes} onAller={(e) => { setOuv(o => ({ ...o, [e.k]: true })); setTimeout(() => document.getElementById(e.ancre)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />}
      </div>

      {/* L'issue, en premier, comme dans l'opération anciens clients */}
      {joint ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 mb-2.5 flex items-center gap-2">
          <Icon name="check-circle-2" size="sm" className="text-emerald-700" />
          <span className="text-sm font-medium text-emerald-900 flex-1">Joint</span>
          <button type="button" className="text-xs text-quai-navy underline py-2 -my-1" onClick={() => maj(['issue'], null)}>Changer l’issue</button>
        </div>
      ) : (
      <div className="bg-white border border-quai-border rounded-xl p-3.5 mb-2.5">
        <div className="font-display font-semibold text-quai-navy mb-0.5">Issue de l’appel</div>
        <p className="text-xs text-quai-muted mb-2.5">{d.conseil_tentative || 'Le seul champ obligatoire. Le reste s’ouvre si la personne décroche.'}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {ISSUES.filter(([v]) => v !== 'MAIL' || !c.stop_mail).map(([v, l, teinte]) => (
            <button key={v} type="button" onClick={() => { maj(['issue'], s.issue === v ? null : v); if (v === 'JOINT') setTimeout(() => document.getElementById('acq-p0')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}
              className={`px-2.5 py-2.5 rounded-lg border text-xs font-medium transition-colors min-h-[3rem] ${
                s.issue === v
                  ? teinte === 'red' ? 'bg-red-600 text-white border-red-600'
                    : teinte === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-quai-navy text-white border-quai-navy'
                  : teinte === 'emerald' ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                    : teinte === 'red' ? 'border-quai-border text-red-700 bg-white hover:border-red-300'
                    : 'border-quai-border text-quai-navy bg-white hover:border-quai-gold'}`}>
              {l}
            </button>
          ))}
        </div>
        {s.issue === 'A_RAPPELER' && <div className="mt-2"><span className="text-[11px] text-quai-muted">Rappeler le</span><ChoixDate valeur={s.rappel_le} onChange={v => maj(['rappel_le'], v)} />
          {remplie && <p className="text-[11px] text-emerald-800 mt-1">Ce que vous avez saisi pendant la conversation sera enregistré avec ce rappel.</p>}</div>}
        {s.issue === 'REPONDEUR' && d.scripts?.repondeur && <div className="mt-2.5"><BlocScript>{script('repondeur')}</BlocScript></div>}
        {['REPONDEUR', 'PAS_DE_REPONSE'].includes(s.issue) && (
          <label className="mt-2 flex items-center gap-2 text-sm text-quai-navy py-1.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5" checked={!!s.sms_foulee} onChange={e => maj(['sms_foulee'], e.target.checked)} />
            J’ai envoyé un SMS dans la foulée <span className="text-[11px] text-quai-muted">(une seule tentative comptée)</span>
          </label>
        )}
        {(['SMS', 'MAIL'].includes(s.issue) || (['REPONDEUR', 'PAS_DE_REPONSE'].includes(s.issue) && s.sms_foulee)) && (
          <div className="mt-2">
            <span className="text-[11px] text-quai-muted">Texte {s.issue === 'MAIL' ? 'du mail' : 'du SMS'} que vous avez envoyé (facultatif, il part dans la note Modelo)</span>
            <textarea className="input min-h-[4rem] mt-0.5" value={s.texte || ''} onChange={e => maj(['texte'], e.target.value)} />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {d.scripts?.sms && <button type="button" className="btn-secondary btn-sm" onClick={() => maj(['texte'], script('sms'))}>Utiliser le modèle</button>}
              {s.issue !== 'MAIL' && dernierSms() && <button type="button" className="btn-secondary btn-sm" onClick={() => maj(['texte'], dernierSms())}>Reprendre mon dernier SMS</button>}
              {s.texte && <button type="button" className="btn-secondary btn-sm" onClick={() => { try { navigator.clipboard.writeText(s.texte); toast.success('Texte copié') } catch { /* presse-papiers indisponible */ } }}>Copier</button>}
            </div>
          </div>
        )}
        {s.issue === 'REFUS_FERME' && <p className="text-sm text-red-700 mt-2">La personne sort de votre file et de l’opération anciens clients, et un stop téléphone partira dans Modelo. L’administration est prévenue si elle figure dans une autre mission.</p>}
        {s.issue === 'DECEDE' && <p className="text-sm text-quai-muted mt-2">Toutes ses recherches seront proposées à l’archivage, après validation.</p>}
        {s.issue === 'ERREUR_IDENTITE' && <p className="text-sm text-quai-muted mt-2">La personne sort de la file. Ses recherches ne sont pas archivées : l’administration vérifie la fiche.</p>}
        {s.issue && s.issue !== 'JOINT' && <Champ label="Note (facultatif)"><textarea className="input min-h-[3rem] mt-0.5" value={s.notes} onChange={e => maj(['notes'], e.target.value)} /></Champ>}
      </div>
      )}

      {/* Les recherches */}
      <Partie ancre="acq-fiches" titre={`${d.fiches.length} recherche${d.fiches.length > 1 ? 's' : ''} dans Modelo`} aide={joint ? 'une décision pour chacune' : 'ce que Modelo sait'}
        ouverte={ouv.fiches} onBasculer={() => basculer('fiches')} faite={Object.values(s.fiches).every(f => f.decision)}>
        {d.fiches.map(f => {
          const x = s.fiches[f.id_fiche]
          return (
            <div key={f.id_fiche} className="border border-quai-border rounded-lg p-2.5 mb-2">
              <button type="button" className="w-full text-left" onClick={() => basculer('f' + f.id_fiche)}>
                <div className="text-sm text-quai-navy flex items-center gap-1.5">
                  <Icon name={ouv['f' + f.id_fiche] ? 'chevron-down' : 'chevron-right'} size="sm" className="text-quai-muted" />
                  <span className="flex-1">N° {f.id_fiche} · {f.type_recherche === 'Location' ? 'Location · ' : ''}{f.type_bien || '?'} · {[euros(f.budget_min), euros(f.budget_max)].filter(Boolean).join(' à ') || 'budget ?'} · {f.localisation_mode === 'zone dessinée sur la carte' ? 'zone dessinée sur la carte' : (f.communes || f.codes_postaux || 'secteur ?')}</span>
                  <span className="text-[11px] text-quai-muted">{f.modifiee_periode || ''}</span>
                </div>
              </button>
              {ouv['f' + f.id_fiche] && (
                <div className="text-xs text-quai-muted mt-1.5 ml-6 space-y-0.5">
                  {f.surface_min ? <div>Surface min. {f.surface_min} m²{f.pieces_min ? ` · ${f.pieces_min} pièces` : ''}{f.chambres_min ? ` · ${f.chambres_min} chambres` : ''}</div> : null}
                  {f.criteres_obligatoires && <div>Obligatoire dans Modelo : {f.criteres_obligatoires}</div>}
                  {f.priorite && <div>Priorité : {f.priorite}</div>}
                  <div>Alerte mail : {f.alerte_mail ? 'oui' : 'non'}{f.ancien_conseiller ? ` · ancien conseiller : ${f.ancien_conseiller}` : ''}</div>
                  {f.precisions && <div className="whitespace-pre-line">Précisions : {f.precisions}</div>}
                  {f.observations && <div className="whitespace-pre-line">Observations : {f.observations}</div>}
                </div>
              )}
              {joint && <div className="mt-2 ml-6">
                <Choix petit valeur={x.decision} onChange={v => maj(['fiches', f.id_fiche, 'decision'], v)}
                  options={[['GARDER', 'Garder'], ...(d.fiches.length > 1 ? [['FUSIONNER', 'Fusionner dans…']] : []), ['ARCHIVER', 'Archiver']]} />
                {x.decision === 'FUSIONNER' && (
                  <select className="input mt-1.5" value={x.fusion_dans} onChange={e => maj(['fiches', f.id_fiche, 'fusion_dans'], e.target.value)}>
                    <option value="">Dans quelle recherche gardée ?</option>
                    {d.fiches.filter(y => y.id_fiche !== f.id_fiche && s.fiches[y.id_fiche]?.decision === 'GARDER').map(y => <option key={y.id_fiche} value={y.id_fiche}>N° {y.id_fiche} · {y.type_bien}</option>)}
                  </select>
                )}
                {x.decision === 'ARCHIVER' && (
                  <div className="mt-1.5">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {['projet ancien', 'projet abandonné', 'a déjà acheté', 'doublon'].map(m => <button key={m} type="button" onClick={() => maj(['fiches', f.id_fiche, 'motif'], m)}
                        className={`text-xs px-2.5 py-1.5 min-h-[2.75rem] md:min-h-0 rounded-full border ${x.motif === m ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-navy hover:border-quai-gold'}`}>{m}</button>)}
                    </div>
                    <input className="input" placeholder="Motif de l’archivage" aria-label="Motif de l’archivage" value={x.motif} onChange={e => maj(['fiches', f.id_fiche, 'motif'], e.target.value)} />
                  </div>
                )}
              </div>}
            </div>
          )
        })}
      </Partie>

      {joint && <>
      <Partie num="0" ancre="acq-p0" titre="Ouverture" script={script('0')} ouverte={ouv.p0} onBasculer={() => basculer('p0')} faite={s.ouverture === 'OK'}>
        <div className="flex flex-wrap gap-2">
          <button className={s.ouverture === 'OK' ? 'btn-primary' : 'btn-secondary'} disabled={bloque}
            onClick={() => { maj(['ouverture'], 'OK'); setOuv(o => ({ ...o, p0: false, p1: true })) }}>Accepte de poursuivre</button>
          <button className="btn-secondary text-red-700" disabled={envoi} onClick={neplus}>Ne souhaite plus être contacté(e)</button>
        </div>
      </Partie>

      <Partie num="1" ancre="acq-p1" titre="Coordonnées" aide="une fois pour la personne" script={script('1')} ouverte={ouv.p1} onBasculer={() => basculer('p1')}
        faite={Object.values(s.coordonnees).every(x => x.etat)}>
        <button type="button" className="btn-secondary btn-sm mb-1" onClick={() => setS(prev => { const n = structuredClone(prev)
          for (const [k, x] of Object.entries(n.coordonnees)) { const a = k === 'adresse' ? (x.avant.adresse || x.avant.commune) : x.avant; if (!x.etat) x.etat = a ? 'CONFIRME' : 'SANS' }
          return n })}>Tout est bon</button>
        {[['tel_portable', 'Portable', '06 12 34 56 78'], ['tel_fixe', 'Fixe', '04 76 00 00 00'], ['email', 'E-mail', 'nom@exemple.fr'], ['adresse', 'Adresse postale']].map(([k, l, ph]) => {
          const x = s.coordonnees[k]
          const avant = k === 'adresse' ? [x.avant.adresse, x.avant.code_postal, x.avant.commune].filter(Boolean).join(' ') : x.avant
          const opts = avant ? [['CONFIRME', 'Confirmé'], ['MODIFIE', 'Modifié'], ['A_SUPPRIMER', 'À supprimer']] : [['AJOUTE', 'Ajouter'], ['SANS', 'Pas d’info']]
          return (
            <div key={k} className="border-t border-quai-border py-2 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm"><span className="text-quai-muted text-xs">{l}</span> · {avant || <span className="text-quai-muted">non renseigné</span>}</span>
                <Choix petit valeur={x.etat} onChange={v => maj(['coordonnees', k, 'etat'], v)} options={opts} />
              </div>
              {['MODIFIE', 'AJOUTE'].includes(x.etat) && (k === 'adresse'
                ? <div className="mt-1.5"><SaisieAdresse label="Nouvelle adresse" valeur={x.apres.adresse}
                    onSaisir={v => maj(['coordonnees', 'adresse', 'apres'], { ...x.apres, adresse: v })}
                    onChoisir={a => maj(['coordonnees', 'adresse', 'apres'], a)} />
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      <input className="input" placeholder="Code postal" aria-label="Code postal" inputMode="numeric" maxLength={5} value={x.apres.code_postal} onChange={e => maj(['coordonnees', 'adresse', 'apres'], { ...x.apres, code_postal: e.target.value })} />
                      <input className="input" placeholder="Commune" aria-label="Commune" value={x.apres.commune} onChange={e => maj(['coordonnees', 'adresse', 'apres'], { ...x.apres, commune: e.target.value })} />
                    </div></div>
                : <input className="input mt-1.5" placeholder={ph} aria-label={`${l} : nouvelle valeur`} autoComplete="off"
                    {...(k === 'email' ? { type: 'email', inputMode: 'email', autoCapitalize: 'none' } : { type: 'tel', inputMode: 'tel' })}
                    value={x.apres} onChange={e => maj(['coordonnees', k, 'apres'], e.target.value)} />)}
            </div>
          )
        })}
        <label className="mt-2 flex items-center gap-2 text-sm text-quai-navy py-1.5 cursor-pointer border-t border-quai-border pt-2.5">
          <input type="checkbox" className="w-5 h-5" checked={!!s.stop_mail} onChange={e => maj(['stop_mail'], e.target.checked)} />
          Ne veut plus recevoir de mails <span className="text-[11px] text-quai-muted">(stop mail dans Modelo)</span>
        </label>
        <p className="text-[11px] text-quai-muted mt-1">L’ancienne valeur est gardée et part en note dans Modelo.</p>
      </Partie>

      {gardees.length === 0 && <div className="text-xs text-quai-muted bg-white border border-dashed border-quai-border rounded-xl p-3 mb-2.5">La partie 2 (projet, critères, financement) s’ouvre dès qu’une recherche est « gardée ».</div>}
      {gardees.map(k => {
        const p = s.fiches[k].projet
        const set = (champ, v) => maj(['fiches', k, 'projet', champ], v)
        const fermeProjet = ['ABANDONNE', 'DEJA_ACHETE'].includes(p.etat_projet)
        return (
          <Partie key={k} num="2" ancre={`acq-p2${k}`} titre="Projet d’achat" aide={gardees.length > 1 ? `recherche n° ${k}` : 'sur la recherche gardée'} script={script('2.1')}
            ouverte={ouv['p2' + k] ?? true} onBasculer={() => basculer('p2' + k)} faite={manques(p).length === 0}>
            <div className="space-y-3">
              <Champ label="État du projet"><Choix valeur={p.etat_projet} onChange={v => set('etat_projet', v)}
                options={[['ACTIF', 'Actif'], ['EN_PAUSE', 'En pause'], ['ABANDONNE', 'Abandonné'], ['DEJA_ACHETE', 'Déjà acheté']]} /></Champ>
              {p.etat_projet === 'DEJA_ACHETE' && <Champ label="Acheté où, chez qui ?"><input className="input" value={p.achete_ou_chez_qui || ''} onChange={e => set('achete_ou_chez_qui', e.target.value)} /></Champ>}
              {!fermeProjet && <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Champ label="Type d’achat"><Choix petit valeur={p.type_achat} onChange={v => set('type_achat', v)} options={[['RP', 'Résidence principale'], ['RS', 'Secondaire'], ['INVESTISSEMENT', 'Investissement']]} /></Champ>
                  <Champ label="Motivation"><Choix petit valeur={p.motivation} onChange={v => set('motivation', v)} options={[['ENVIE', 'Envie'], ['OBLIGATION', 'Obligation'], ['OPPORTUNITE', 'Opportunité']]} /></Champ>
                </div>
                <Champ label="Pourquoi ce projet ?"><input className="input" value={p.motivation_texte || ''} onChange={e => set('motivation_texte', e.target.value)} /></Champ>
                <Champ label="Urgence, de 1 à 10"><Choix petit valeur={p.urgence ? String(p.urgence) : null} onChange={v => set('urgence', v || '')} options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(n => [n, n])} /></Champ>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Champ label="Emménagement souhaité"><input className="input" placeholder="printemps 2027" value={p.date_emmenagement || ''} onChange={e => set('date_emmenagement', e.target.value)} /></Champ>
                  <Champ label="Cherche depuis"><input className="input" value={p.recherche_depuis || ''} onChange={e => set('recherche_depuis', e.target.value)} /></Champ>
                  <Champ label="Décideurs"><input className="input" placeholder="couple, parents…" value={p.decideurs || ''} onChange={e => set('decideurs', e.target.value)} /></Champ>
                </div>
                <Champ label="Ce qui le ferait passer à 10"><input className="input" value={p.passer_a_10 || ''} onChange={e => set('passer_a_10', e.target.value)} /></Champ>
                <Champ label="Déjà vu (combien, quelles agences, pourquoi ça n’a pas abouti)"><input className="input" value={p.deja_vu || ''} onChange={e => set('deja_vu', e.target.value)} /></Champ>
              </>}
            </div>
            {!fermeProjet && <>
              <h4 className="font-display font-semibold text-quai-navy mt-5 mb-2 pt-4 border-t border-quai-border">2.2 Critères</h4>
              {d.scripts?.['2.2'] && <BlocScript>{script('2.2')}</BlocScript>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Champ label="Type de bien"><select className="input" value={p.type_bien || ''} onChange={e => set('type_bien', e.target.value)}>
                  {['', 'Appartement', 'Maison', 'Terrain', 'Immobilier Pro', 'Fonds de commerce', 'Parking', 'Autre'].map(t => <option key={t} value={t}>{t || '—'}</option>)}</select></Champ>
                <Champ label="Budget min. (€)"><input className="input" inputMode="numeric" value={p.budget_min || ''} onChange={e => set('budget_min', e.target.value.replace(/\D/g, ''))} /></Champ>
                <Champ label="Budget max. annoncé (€)"><input className="input" inputMode="numeric" value={p.budget_max || ''} onChange={e => set('budget_max', e.target.value.replace(/\D/g, ''))} /></Champ>
                <Champ label="Surface min. acceptée (m²)"><input className="input" inputMode="numeric" value={p.surface_min || ''} onChange={e => set('surface_min', e.target.value.replace(/\D/g, ''))} /></Champ>
                <Champ label="Pièces min."><input className="input" inputMode="numeric" value={p.pieces || ''} onChange={e => set('pieces', e.target.value.replace(/\D/g, ''))} /></Champ>
                <Champ label="Chambres min."><input className="input" inputMode="numeric" value={p.chambres || ''} onChange={e => set('chambres', e.target.value.replace(/\D/g, ''))} /></Champ>
              </div>
              {Number(p.budget_max) > 0 && <p className="text-[11px] text-quai-muted mt-1">Exporté vers Modelo : {euros(Number(p.budget_max) * 1.1)} (budget annoncé + 10 %).</p>}
              <Champ label="Secteurs (séparés par des virgules)"><input className="input mt-0.5" placeholder="Meylan, Corenc" value={p.secteurs || ''} onChange={e => set('secteurs', e.target.value)} /></Champ>
              {avecGrenoble(p.secteurs) && (
                <Suspense fallback={<p className="text-sm text-quai-muted animate-pulse mt-2">Chargement…</p>}>
                  <QuartiersGrenoble key={k} secteurs={p.secteurs} valeur={Array.isArray(p.quartiers_grenoble) ? p.quartiers_grenoble : []}
                    onChange={v => set('quartiers_grenoble', v)} lecture={lecture}
                    zoneModelo={(d.fiches || []).find(x => String(x.id_fiche) === String(k))?.localisation_mode === 'zone dessinée sur la carte'} />
                </Suspense>
              )}
              <div className="mt-2 divide-y divide-quai-border border border-quai-border rounded-lg">
                {(p.criteres || []).map((x, i) => (
                  <div key={x.critere} className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
                    <span className="text-sm flex-1 min-w-[8rem]">{x.critere}</span>
                    {AVEC_VALEUR.includes(x.critere) && <input className="input max-w-[10rem]" placeholder="valeur" value={x.valeur} onChange={e => maj(['fiches', k, 'projet', 'criteres', i, 'valeur'], e.target.value)} />}
                    <select className="input max-w-[10rem]" value={x.niveau} onChange={e => maj(['fiches', k, 'projet', 'criteres', i, 'niveau'], e.target.value)}>
                      {NIVEAUX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-quai-muted mt-1">Seul « Indispensable » filtre les biens que Modelo lui proposera (il refuse de visiter sans). « Important », « Optionnel » et « Rédhibitoire » restent écrits dans les Précisions, sans filtrer.</p>
              {/* Vérifié dans Modelo le 19/11 : un séjour minimum obligatoire écarte aussi
                  les biens dont la surface du séjour n'a pas été saisie. */}
              {(p.criteres || []).some(x => x.critere === 'Surface du séjour' && x.niveau === 'INDISPENSABLE') && (
                <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                  Surface du séjour en « Indispensable » : Modelo écartera aussi les biens dont le séjour n’est pas renseigné. À réserver à une vraie exigence ; sinon mettez « Important ».
                </p>
              )}
              <div className="mt-2"><Champ label="Autres critères, avec ses mots (étage, exposition, vue, travaux, stationnement, calme…)">
                <textarea className="input min-h-[4rem] mt-0.5" maxLength={1000} value={p.criteres_libre || ''} onChange={e => set('criteres_libre', e.target.value)} /></Champ>
                <p className="text-[11px] text-quai-muted mt-1">Texte libre : il part tel quel dans les Précisions de la recherche, dans Modelo.</p></div>

              <h4 className="font-display font-semibold text-quai-navy mt-5 mb-2 pt-4 border-t border-quai-border">2.3 Financement</h4>
              {d.scripts?.['2.3'] && <BlocScript>{script('2.3')}</BlocScript>}
              <div className="space-y-2">
                <Champ label="Mode"><Choix petit valeur={p.mode_financement} onChange={v => set('mode_financement', v)} options={[['Crédit', 'Crédit'], ['Comptant', 'Comptant']]} /></Champ>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Champ label="Apport (€)"><input className="input" inputMode="numeric" value={p.apport || ''} onChange={e => set('apport', e.target.value.replace(/\D/g, ''))} /></Champ>
                  <Champ label="dont revente (€)"><input className="input" inputMode="numeric" value={p.apport_revente || ''} onChange={e => set('apport_revente', e.target.value.replace(/\D/g, ''))} /></Champ>
                  <Champ label="Mensualité acceptée (€)"><input className="input" inputMode="numeric" value={p.mensualite || ''} onChange={e => set('mensualite', e.target.value.replace(/\D/g, ''))} /></Champ>
                  <Champ label="Banque ou courtier"><input className="input" value={p.banque_ou_courtier || ''} onChange={e => set('banque_ou_courtier', e.target.value)} /></Champ>
                </div>
                <Champ label="Financement validé ?"><Choix petit valeur={p.financement_valide} onChange={v => set('financement_valide', v)} options={FIN_VALIDE} /></Champ>
                {['ACCORD', 'SIMULATION'].includes(p.financement_valide) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Champ label="Par qui"><select className="input" value={p.financement_par || ''} onChange={e => set('financement_par', e.target.value)}>{['', 'Banque', 'Courtier', 'Marine (Le Quai)'].map(x => <option key={x}>{x}</option>)}</select></Champ>
                    <Champ label="Nom"><input className="input" value={p.financement_nom || ''} onChange={e => set('financement_nom', e.target.value)} /></Champ>
                    <Champ label="Date"><input type="date" className="input" value={p.financement_date || ''} onChange={e => set('financement_date', e.target.value)} /></Champ>
                    <Champ label="Montant validé (€)"><input className="input" inputMode="numeric" value={p.financement_montant || ''} onChange={e => set('financement_montant', e.target.value.replace(/\D/g, ''))} /></Champ>
                  </div>
                )}
                {p.financement_valide === 'COMPTANT' && <Champ label="Origine des fonds (facultatif)"><input className="input" value={p.origine_fonds || ''} onChange={e => set('origine_fonds', e.target.value)} /></Champ>}
                {/* Marine est proposée à CHAQUE acquéreur, qu'il ait déjà vu une banque ou
                    un courtier ou non (demande de Lilas, 20/11). Deux exceptions : il paie
                    comptant, ou c'est déjà Marine qui a validé son financement. */}
                {(() => {
                  const comptant = p.mode_financement === 'Comptant' || p.financement_valide === 'COMPTANT'
                  const dejaMarine = p.financement_par === 'Marine (Le Quai)'
                  if (comptant || dejaMarine) return null
                  const pasValide = ['EN_COURS', 'NON'].includes(p.financement_valide)
                  return (
                    <div className={`rounded-lg border text-sm p-2.5 flex flex-wrap items-center gap-2 ${pasValide ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-quai-light border-quai-border text-quai-text'}`}>
                      <span className="flex-1 min-w-[12rem]">
                        {pasValide ? 'Financement pas validé : proposer un rendez-vous avec Marine.'
                          : ['ACCORD', 'SIMULATION'].includes(p.financement_valide) ? 'Même s’il a déjà vu une banque ou un courtier : proposer un rendez-vous avec Marine, pour comparer.'
                          : 'À proposer à chaque fois : un rendez-vous avec Marine, notre courtière.'}
                      </span>
                      <button className={s.marine.proposee ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => maj(['marine'], { ...s.marine, proposee: !s.marine.proposee })}>{s.marine.proposee ? 'Marine proposée' : 'Proposer Marine'}</button>
                      {s.marine.proposee && <label className="text-xs inline-flex items-center gap-1.5 py-1.5 cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={!!s.marine.accord} onChange={e => maj(['marine'], { ...s.marine, accord: e.target.checked })} /> le client est d’accord</label>}
                    </div>
                  )
                })()}
              </div>
            </>}
          </Partie>
        )
      })}

      <Partie num="3" ancre="acq-p3" titre="Vendre pour acheter" aide="une fois pour la personne" script={script('3')} ouverte={ouv.p3} onBasculer={() => basculer('p3')} faite={!!s.vendre.statut_logement}>
        <div className="space-y-2">
          <Champ label="Logement actuel"><Choix petit valeur={s.vendre.statut_logement} onChange={v => maj(['vendre'], v === 'PROPRIETAIRE' ? { ...s.vendre, statut_logement: v } : { statut_logement: v, depuis: s.vendre.depuis })} options={[['PROPRIETAIRE', 'Propriétaire'], ['LOCATAIRE', 'Locataire'], ['HEBERGE', 'Hébergé']]} /></Champ>
          <Champ label="Depuis"><input className="input max-w-[12rem]" placeholder="2015" inputMode="numeric" value={s.vendre.depuis || ''} onChange={e => maj(['vendre', 'depuis'], e.target.value)} /></Champ>
          {s.vendre.statut_logement === 'PROPRIETAIRE' && <>
            <Champ label="Doit-il vendre pour acheter ?"><Choix petit valeur={s.vendre.doit_vendre} onChange={v => maj(['vendre', 'doit_vendre'], v)} options={[['OUI', 'Oui'], ['NON', 'Non']]} /></Champ>
            {s.vendre.doit_vendre === 'OUI' && <>
              <Champ label="Où en est la revente ?"><Choix petit valeur={s.vendre.etat_revente} onChange={v => maj(['vendre', 'etat_revente'], v)}
                options={[['PAS_SORTIE', 'Pas encore lancée'], ['ESTIMEE', 'Estimée'], ['EN_VENTE', 'En vente'], ['SOUS_OFFRE', 'Sous offre'], ['SOUS_COMPROMIS', 'Sous compromis'], ['PRET_RELAIS', 'Prêt relais']]} /></Champ>
              <SaisieAdresse label="Adresse du bien à vendre" valeur={s.vendre.adresse_bien_a_vendre || ''}
                onSaisir={v => maj(['vendre', 'adresse_bien_a_vendre'], v)} onChoisir={a => maj(['vendre', 'adresse_bien_a_vendre'], [a.adresse, a.code_postal, a.commune].filter(Boolean).join(' '))} />
              {['PAS_SORTIE', undefined, null].includes(s.vendre.etat_revente) && (
                <div className="rounded-lg bg-quai-gold/15 border border-quai-gold/50 p-2.5 text-sm">
                  <div className="font-semibold text-quai-navy mb-1">Bien pas encore estimé : proposer une estimation</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className={s.vendre.estimation_proposee ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => maj(['vendre', 'estimation_proposee'], !s.vendre.estimation_proposee)}>{s.vendre.estimation_proposee ? 'Estimation proposée' : 'Proposer une estimation'}</button>
                    {s.vendre.estimation_proposee && <label className="text-xs inline-flex items-center gap-1.5 py-1.5 cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={!!s.vendre.estimation_acceptee} onChange={e => maj(['vendre', 'estimation_acceptee'], e.target.checked)} /> acceptée</label>}
                    {s.vendre.estimation_acceptee && <input type="datetime-local" className="input max-w-[14rem]" aria-label="Date du rendez-vous d’estimation" value={s.vendre.date_rdv_estimation || ''} onChange={e => maj(['vendre', 'date_rdv_estimation'], e.target.value)} />}
                  </div>
                </div>
              )}
            </>}
          </>}
        </div>
      </Partie>

      {mandatVisible && (
        <Partie num="4" ancre="acq-pm" titre="Le mandat de recherche" aide="pour un contact requalifié" script={d.scripts?.mandat ? script('mandat') : null}
          ouverte={ouv.pm} onBasculer={() => basculer('pm')} faite={!!mandat.etat}>
          <div className="rounded-lg bg-quai-light border border-quai-border px-3 py-2.5 text-[13px] text-quai-text mb-3">
            <div className="font-medium text-quai-navy mb-1">À qui le proposer</div>
            <ul className="list-disc pl-4 space-y-0.5 text-quai-muted">
              <li>Celui qui cherche depuis des mois.</li>
              <li>Celui qui est inscrit dans plusieurs agences et ne reçoit rien.</li>
              <li>Celui qui a un besoin rare ou très précis.</li>
              <li>L’investisseur.</li>
            </ul>
          </div>
          <div className="space-y-2.5">
            <Champ label="Mandat de recherche"><Choix petit valeur={mandat.etat} options={ETATS_MANDAT}
              onChange={v => setS(prev => {
                const n = structuredClone(prev)
                n.mandat = { type: 'NON_PRECISE', date_acceptation: '', motif_refus: '', ...(n.mandat || {}), etat: v }
                // Accepté : la date d'aujourd'hui par défaut, et la suite est le rendez-vous de signature.
                if (v === 'ACCEPTE') { if (!n.mandat.date_acceptation) n.mandat.date_acceptation = aujourdhui(); n.prochaine_action = RDV_SIGNATURE }
                else if (n.prochaine_action === RDV_SIGNATURE) n.prochaine_action = null
                return n
              })} /></Champ>
            {['PROPOSE', 'ACCEPTE', 'A_REPROPOSER'].includes(mandat.etat) && (
              <Champ label="Type de mandat (facultatif)"><Choix petit valeur={mandat.type} onChange={v => maj(['mandat'], { ...mandat, type: v || 'NON_PRECISE' })}
                options={[['SIMPLE', 'Simple'], ['EXCLUSIF', 'Exclusif'], ['NON_PRECISE', 'À préciser']]} /></Champ>
            )}
            {mandat.etat === 'ACCEPTE' && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Champ label="Accepté le"><input type="date" className="input" value={mandat.date_acceptation} onChange={e => maj(['mandat'], { ...mandat, date_acceptation: e.target.value })} /></Champ>
                  <Champ label="Rendez-vous de signature le (facultatif)"><input type="datetime-local" className="input" value={s.date_prochaine_action} onChange={e => maj(['date_prochaine_action'], e.target.value)} /></Champ>
                </div>
                <p className="text-[11px] text-emerald-900">{s.date_prochaine_action ? 'La prochaine action devient « Rendez-vous de signature ».' : 'Sans date, le mandat est noté « accepté, rendez-vous de signature à fixer ».'} La signature se fait hors de l’appli.</p>
              </div>
            )}
            {mandat.etat === 'REFUSE' && <Champ label="Motif du refus (court)"><input className="input" maxLength={300} value={mandat.motif_refus} onChange={e => maj(['mandat'], { ...mandat, motif_refus: e.target.value })} /></Champ>}
          </div>
        </Partie>
      )}

      <Partie num={mandatVisible ? '5' : '4'} ancre="acq-p4" titre="Suite donnée" script={script('4')} ouverte={ouv.p4 ?? true} onBasculer={() => basculer('p4')} faite={!!statutChoisi}>
        <div className="space-y-2.5">
          <Choix valeur={statutChoisi} onChange={choisirStatut} options={STATUTS} />
          {statutAuto && statutChoisi === statutAuto && <p className="text-[11px] text-quai-muted">Rempli d’après l’état du projet saisi plus haut. À changer seulement si la conversation est à reprendre (« À rappeler »).</p>}
          {statutAuto && statutChoisi && statutChoisi !== statutAuto && statutChoisi !== 'A_RAPPELER' && <p className="text-sm text-amber-800">Attention : l’état du projet saisi plus haut donnerait « {STATUTS.find(x => x[0] === statutAuto)?.[1]} ».</p>}
          {statutChoisi === 'REQUALIFIE' && !projetActif && <p className="text-sm text-red-700">Requalifié : le projet doit être « Actif » sur au moins une recherche gardée.</p>}
          {statutChoisi === 'REQUALIFIE' && projetActif && manquesReq.filter(m => !m.startsWith('projet actif')).length > 0 && <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Requalifié. Pour une fiche complète, il resterait à préciser : {manquesReq.filter(m => !m.startsWith('projet actif')).join(', ')}. Ce n’est pas obligatoire.</p>}
          {statutChoisi === 'DEJA_ACHETE' && <Champ label="Acheté où, chez qui ? (part dans la note Modelo)"><input className="input" value={s.achat || ''} onChange={e => maj(['achat'], e.target.value)} /></Champ>}
          {['DEJA_ACHETE', 'ABANDONNE'].includes(statutChoisi) && <p className="text-[11px] text-quai-muted">Les recherches sans décision sont passées en « Archiver ». L’archivage sera validé par l’administration avant de partir dans Modelo.</p>}
          <Champ label="Prochaine action"><Choix petit valeur={s.prochaine_action} onChange={v => maj(['prochaine_action'], v)} options={ACTIONS.map(a => [a, a])} /></Champ>
          {(s.prochaine_action || statutChoisi === 'A_RAPPELER') && <div><span className="text-[11px] text-quai-muted">{statutChoisi === 'A_RAPPELER' ? 'Rappeler le' : 'Date'}</span>
            {statutChoisi === 'A_RAPPELER' ? <ChoixDate valeur={s.date_prochaine_action} onChange={v => maj(['date_prochaine_action'], v)} />
              : <input type="datetime-local" className="input max-w-[14rem] mt-0.5 block" aria-label="Date de la prochaine action" value={s.date_prochaine_action} onChange={e => maj(['date_prochaine_action'], e.target.value)} />}</div>}
          <label className="text-sm flex items-center gap-2 py-1.5 cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={s.consentement_rappel} onChange={e => maj(['consentement_rappel'], e.target.checked)} /> Consent à être recontacté(e) par l’agence</label>
          <Champ label="Note (faits utiles à la recherche, jamais d’appréciation sur la personne)">
            <textarea className="input min-h-[4rem]" value={s.notes} onChange={e => maj(['notes'], e.target.value)} /></Champ>
        </div>
      </Partie>

      </>}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-quai-border p-2.5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-3xl mx-auto">
          {raison && (joint && !lecture && !bloque
            ? <button type="button" onClick={versSuite} className="block w-full text-left text-[11px] text-amber-800 mb-1.5 underline">{raison}</button>
            : <p className={`text-[11px] mb-1.5 ${bloque && s.issue ? 'text-red-700' : 'text-quai-muted'}`}>{raison}</p>)}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onPasser || onRetour}>{onPasser ? 'Passer' : 'Retour'}</button>
            <button className="btn-primary flex-1 min-h-[2.75rem]" disabled={envoi || !!raison} onClick={enregistrer}>
              {envoi ? 'Enregistrement…' : lecture ? 'Lecture seule' : 'Enregistrer et suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
