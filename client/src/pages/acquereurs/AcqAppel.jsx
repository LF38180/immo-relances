import { useState, useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'
import SaisieAdresse from '../../components/SaisieAdresse'
import { Initiales, Pastille } from './ui'

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
          className={`rounded-lg border px-2.5 ${petit ? 'py-1 text-xs' : 'py-1.5 text-sm'} transition-colors ${valeur === v ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-text hover:bg-quai-light'}`}>
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

const Champ = ({ label, children }) => <label className="block"><span className="text-[11px] text-quai-muted">{label}</span>{children}</label>

// Ce qui est saisi survit à un rechargement : une coupure réseau ou un onglet
// fermé par erreur ne doit pas faire perdre un appel de vingt minutes.
const cleBrouillon = (id) => `acq-brouillon-${id}`
const lireBrouillon = (id) => { try { return JSON.parse(localStorage.getItem(cleBrouillon(id)) || 'null') } catch { return null } }
const ecrireBrouillon = (id, v) => { try { localStorage.setItem(cleBrouillon(id), JSON.stringify(v)) } catch { /* stockage indisponible */ } }
const effacerBrouillon = (id) => { try { localStorage.removeItem(cleBrouillon(id)) } catch { /* idem */ } }

// Le dernier SMS envoyé, gardé sur l'appareil : on envoie souvent le même
// (repris de l'opération anciens clients).
const CLE_DERNIER_SMS = 'acq-dernier-sms'
const dernierSms = () => { try { return localStorage.getItem(CLE_DERNIER_SMS) || '' } catch { return '' } }

export default function AcqAppel({ id, position, onSuivant, onRetour, horsFile, revenir, demo }) {
  const [d, setD] = useState(null)
  const [s, setS] = useState(null)       // la saisie
  const [ouv, setOuv] = useState({ fiches: true, p0: true })
  const [envoi, setEnvoi] = useState(false)
  const cle = useRef(null)

  useEffect(() => {
    setD(null); setS(null); cle.current = `${id}-${Date.now()}`
    // Démonstration : les données arrivent toutes faites, rien n'est lu ni
    // écrit sur le serveur.
    ;(demo ? Promise.resolve({ data: demo }) : api.get(`/acquereurs/contacts/${id}`)).then(r => {
      setD(r.data)
      const c = r.data.contact
      const init = {
        issue: null, rappel_le: '', texte: '', ouverture: null, notes: '', consentement_rappel: false,
        coordonnees: {
          tel_portable: { etat: null, avant: c.tel_portable || '', apres: '' },
          tel_fixe: { etat: null, avant: c.tel_fixe || '', apres: '' },
          email: { etat: null, avant: c.email || '', apres: '' },
          adresse: { etat: null, avant: { adresse: c.adresse || '', code_postal: c.code_postal || '', commune: c.commune || '' }, apres: { adresse: '', code_postal: '', commune: '' } },
        },
        fiches: Object.fromEntries(r.data.fiches.map(f => [f.id_fiche, {
          decision: null, fusion_dans: '', motif: '',
          projet: f.requalif || {
            etat_projet: null, type_bien: f.type_bien || '', budget_min: f.budget_min || '', budget_max: f.budget_max || '',
            surface_min: f.surface_min || '', pieces: f.pieces_min || '', chambres: f.chambres_min || '',
            secteurs: f.communes || '',
            criteres: CRITERES.map(k => ({ critere: k, valeur: '', niveau: (f.criteres_obligatoires || '').split(', ').map(x => DEPUIS_MODELO[x]).includes(k) ? 'INDISPENSABLE' : '' })),
          },
        }])),
        vendre: {}, marine: {}, mandat: { etat: null, type: 'NON_PRECISE', date_acceptation: '', motif_refus: '' },
        statut_final: null, prochaine_action: null, date_prochaine_action: '',
      }
      // Le brouillon porte l'identifiant de sa fiche : on ne reprend jamais
      // celui d'une autre personne.
      const b = demo ? null : lireBrouillon(id)
      setS(b && b._id === id ? b : { ...init, _id: id })
    }).catch(() => setD({ erreur: true }))
  }, [id])
  // Au changement de fiche, `s` est encore celle d'avant pendant un rendu :
  // sans ce contrôle, la saisie de la personne précédente était recopiée
  // dans le brouillon de la suivante.
  useEffect(() => { if (s && s._id === id && !demo) ecrireBrouillon(id, s) }, [id, s, demo])

  const c = d?.contact
  const gardees = useMemo(() => s ? Object.entries(s.fiches).filter(([, f]) => f.decision === 'GARDER').map(([k]) => k) : [], [s])
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  if (d.erreur) return <p className="p-6 text-sm text-red-700">Fiche introuvable. <button className="underline" onClick={onRetour}>Revenir</button></p>
  if (!s) return null

  const maj = (chemin, valeur) => setS(prev => {
    const n = structuredClone(prev); let o = n
    for (const k of chemin.slice(0, -1)) o = o[k]
    o[chemin[chemin.length - 1]] = valeur
    return n
  })
  const bloque = d.blocages.length > 0
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
    const remplie = s.ouverture === 'OK' || Object.values(s.fiches).some(f => f.decision)
    if (remplie && !window.confirm(`La fiche est remplie, mais l’issue choisie est « ${ISSUES.find(x => x[0] === s.issue)?.[1]} ». Enregistrer quand même ?`)) return
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/tentative`, { issue, canal, cle: cle.current + '-' + issue + canal, notes: s.notes || null,
        texte: canal !== 'APPEL' ? (s.texte || '').trim() || null : null })
      if (canal === 'SMS' && (s.texte || '').trim()) { try { localStorage.setItem(CLE_DERNIER_SMS, s.texte.trim()) } catch { /* stockage indisponible */ } }
      effacerBrouillon(id)
      toast.success(canal === 'SMS' ? 'SMS noté' : canal === 'MAIL' ? 'Mail noté' : issue === 'FAUX_NUMERO' ? 'Faux numéro noté' : 'Tentative notée')
      onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }

  const cloturer = async () => {
    if (envoi) return
    const mandat = s.mandat || { etat: null }
    const mandatVisible = s.statut_final === 'REQUALIFIE' || Object.values(s.fiches).some(f => f.decision === 'GARDER' && f.projet?.etat_projet === 'ACTIF')
    const sansProjet = ['A_RAPPELER', 'ERREUR_IDENTITE', 'DECEDE'].includes(s.statut_final)
    if (!s.statut_final) return toast.error('Choisissez l’issue de l’appel.')
    if (mandat.etat === 'ACCEPTE' && !mandat.date_acceptation) return toast.error('Mandat de recherche accepté : indiquez la date d’acceptation.')
    if (mandat.etat === 'ACCEPTE' && !s.date_prochaine_action) return toast.error('Mandat de recherche accepté : indiquez la date du rendez-vous de signature.')
    if (!sansProjet) {
      const oubli = Object.values(s.fiches).filter(f => !f.decision).length
      if (oubli) return toast.error(`Décision manquante sur ${oubli} recherche${oubli > 1 ? 's' : ''}.`)
    }
    const fiches = Object.fromEntries(Object.entries(s.fiches).map(([k, f]) => [k, {
      decision: f.decision, fusion_dans: f.fusion_dans || null, motif: f.motif,
      projet: f.decision === 'GARDER' ? { ...f.projet, secteurs: String(f.projet.secteurs || '').split(',').map(x => x.trim()).filter(Boolean),
        criteres: (f.projet.criteres || []).filter(x => x.niveau) } : null,
    }]))
    const coordonnees = Object.fromEntries(Object.entries(s.coordonnees).filter(([, x]) => x.etat))
    if (demo) return finDemo('appel enregistré')
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/cloture`, {
        cle: cle.current + '-cloture', statut_final: s.statut_final, prochaine_action: s.prochaine_action,
        date_prochaine_action: s.date_prochaine_action || null, notes: s.notes || null, consentement_rappel: s.consentement_rappel,
        joint: true, coordonnees, vendre: s.vendre, marine: s.marine, fiches,
        mandat: mandatVisible && mandat.etat ? mandat : null,
      })
      effacerBrouillon(id)
      toast.success('Appel enregistré')
      onSuivant()
    } catch (e) { toast.error(e.messageLisible || e.message) } finally { setEnvoi(false) }
  }
  const neplus = async () => {
    if (!window.confirm('Enregistrer que cette personne ne souhaite plus être contactée ? Elle sortira de toutes les files, dans tous les modules.')) return
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
    if (demo) return finDemo('appel enregistré')
    setEnvoi(true)
    try {
      await api.post(`/acquereurs/contacts/${id}/cloture`, { cle: cle.current + '-' + i, statut_final: i,
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
  const manquesReq = gardees.length ? gardees.flatMap(k => manques(s.fiches[k].projet).map(m => gardees.length > 1 ? `${m} (recherche ${k})` : m)) : ['au moins une recherche gardée']
  const tel = c.tel_portable || c.tel_fixe

  return (
    <div className="p-3 max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-2 mb-2 text-xs text-quai-muted">
        <button onClick={onRetour} className="inline-flex items-center gap-1 hover:text-quai-navy"><Icon name="arrow-left" size="sm" /> Ma file</button>
        {revenir && <button onClick={revenir.aller} className="inline-flex items-center gap-1 text-quai-navy underline">{revenir.libelle}</button>}
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
          {tel
            ? <a href={`tel:${tel.replace(/\s/g, '')}`} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-quai-gold text-quai-navy font-semibold px-4 py-2.5 hover:bg-quai-goldlt transition-colors">
                <Icon name="phone" size="sm" /> {tel}
              </a>
            : <Pastille ton="ambre">Pas de téléphone</Pastille>}
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
        {(c.derniere_note_date || c.derniere_note_extrait) && (
          <div className="mt-2.5 bg-quai-light rounded-lg px-3 py-2">
            <div className="text-[11px] text-quai-muted">Dernière note Modelo{c.derniere_note_date ? ` · ${jj(c.derniere_note_date)}` : ''}{c.derniere_note_auteur ? ` · ${c.derniere_note_auteur}` : ''}</div>
            {c.derniere_note_extrait && <p className="text-[13px] text-quai-text mt-0.5 line-clamp-3">« {c.derniere_note_extrait} »</p>}
          </div>
        )}
        {horsFile && <p className="text-[11px] text-amber-800 mt-1.5">Fiche ouverte hors de l’ordre de la file.</p>}
        {/* Comme dans l'opération : ce qui est déjà dans Modelo, et ce qui attend. */}
        {c.modelo_reporte_le
          ? <p className="text-[11px] text-emerald-700 mt-1">Mise à jour Modelo faite le {new Date(String(c.modelo_reporte_le).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}{c.dernier_appel_le && c.dernier_appel_le > c.modelo_reporte_le ? ' · du nouveau depuis, à reporter' : ''}</p>
          : c.appels_total > 0 && <p className="text-[11px] text-quai-muted mt-1">Pas encore reporté dans Modelo.</p>}
        {d.appels.length > 0 && (
          <details className="mt-1.5">
            <summary className="text-[11px] text-quai-navy cursor-pointer">Historique dans l’appli ({d.appels.length})</summary>
            <ul className="text-[11px] text-quai-muted mt-1 space-y-0.5">
              {d.appels.map(a => <li key={a.id}>{new Date(String(a.horodatage).replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {a.canal === 'SMS' ? 'SMS envoyé' : a.canal === 'MAIL' ? 'mail envoyé' : (STATUTS.find(x => x[0] === a.statut_final)?.[1] || ISSUES.find(x => x[0] === a.issue)?.[1] || a.issue)}{a.texte ? ` : « ${a.texte} »` : ''}{a.notes ? ` · ${a.notes}` : ''} · {a.madame_fichier}</li>)}
            </ul>
          </details>
        )}
        {bloque && (
          <div className="mt-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2.5 flex gap-2">
            <Icon name="phone-off" size="sm" className="shrink-0 mt-0.5" /><div>{d.blocages.map(b => <div key={b}>{b}</div>)}</div>
          </div>
        )}
        {joint && <Etapes etapes={etapes} onAller={(e) => { setOuv(o => ({ ...o, [e.k]: true })); setTimeout(() => document.getElementById(e.ancre)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />}
      </div>

      {/* L'issue, en premier, comme dans l'opération anciens clients */}
      <div className="bg-white border border-quai-border rounded-xl p-3.5 mb-2.5">
        <div className="font-display font-semibold text-quai-navy mb-0.5">Issue de l’appel</div>
        <p className="text-xs text-quai-muted mb-2.5">{d.conseil_tentative || 'Le seul champ obligatoire. Le reste s’ouvre si la personne décroche.'}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {ISSUES.filter(([v]) => v !== 'MAIL' || !c.stop_mail).map(([v, l, teinte]) => (
            <button key={v} type="button" onClick={() => maj(['issue'], s.issue === v ? null : v)}
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
        {s.issue === 'A_RAPPELER' && <Champ label="Rappeler le"><input type="datetime-local" className="input max-w-[14rem] mt-0.5" value={s.rappel_le} onChange={e => maj(['rappel_le'], e.target.value)} /></Champ>}
        {s.issue === 'REPONDEUR' && d.scripts?.repondeur && <div className="mt-2.5"><BlocScript>{script('repondeur')}</BlocScript></div>}
        {['SMS', 'MAIL'].includes(s.issue) && (
          <div className="mt-2">
            <span className="text-[11px] text-quai-muted">Texte {s.issue === 'SMS' ? 'du SMS' : 'du mail'} que vous avez envoyé (facultatif, il part dans la note Modelo)</span>
            <textarea className="input min-h-[4rem] mt-0.5" value={s.texte} onChange={e => maj(['texte'], e.target.value)} />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {d.scripts?.sms && <button type="button" className="btn-secondary btn-sm" onClick={() => maj(['texte'], script('sms'))}>Utiliser le modèle</button>}
              {s.issue === 'SMS' && dernierSms() && <button type="button" className="btn-secondary btn-sm" onClick={() => maj(['texte'], dernierSms())}>Reprendre mon dernier SMS</button>}
              {s.texte && <button type="button" className="btn-secondary btn-sm" onClick={() => { try { navigator.clipboard.writeText(s.texte); toast.success('Texte copié') } catch { /* presse-papiers indisponible */ } }}>Copier</button>}
            </div>
          </div>
        )}
        {s.issue === 'REFUS_FERME' && <p className="text-sm text-red-700 mt-2">La personne sortira de toutes les files, dans tous les modules, et un stop téléphone partira dans Modelo.</p>}
        {['ERREUR_IDENTITE', 'DECEDE'].includes(s.issue) && <p className="text-sm text-quai-muted mt-2">Toutes ses recherches seront proposées à l’archivage, après validation.</p>}
        {s.issue && s.issue !== 'JOINT' && <Champ label="Note (facultatif)"><textarea className="input min-h-[3rem] mt-0.5" value={s.notes} onChange={e => maj(['notes'], e.target.value)} /></Champ>}
      </div>

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
                    {d.fiches.filter(y => y.id_fiche !== f.id_fiche).map(y => <option key={y.id_fiche} value={y.id_fiche}>N° {y.id_fiche} · {y.type_bien}</option>)}
                  </select>
                )}
                {x.decision === 'ARCHIVER' && (
                  <input className="input mt-1.5" placeholder="Motif : projet ancien, abandonné, a acheté…" value={x.motif} onChange={e => maj(['fiches', f.id_fiche, 'motif'], e.target.value)} />
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
                      <input className="input" placeholder="Code postal" value={x.apres.code_postal} onChange={e => maj(['coordonnees', 'adresse', 'apres'], { ...x.apres, code_postal: e.target.value })} />
                      <input className="input" placeholder="Commune" value={x.apres.commune} onChange={e => maj(['coordonnees', 'adresse', 'apres'], { ...x.apres, commune: e.target.value })} />
                    </div></div>
                : <input className="input mt-1.5" placeholder={ph} value={x.apres} onChange={e => maj(['coordonnees', k, 'apres'], e.target.value)} />)}
            </div>
          )
        })}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Champ label="Urgence /10"><input type="number" min="1" max="10" className="input" value={p.urgence || ''} onChange={e => set('urgence', e.target.value)} /></Champ>
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
              <p className="text-[11px] text-quai-muted mt-1">Indispensable = il refuse de visiter sans (champ de rapprochement Modelo). Le reste part dans les Précisions.</p>

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
                {['EN_COURS', 'NON'].includes(p.financement_valide) && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-2.5 flex flex-wrap items-center gap-2">
                    <span className="flex-1">Financement pas validé : proposer un rendez-vous avec Marine.</span>
                    <button className={s.marine.proposee ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => maj(['marine'], { ...s.marine, proposee: !s.marine.proposee })}>{s.marine.proposee ? 'Marine proposée' : 'Proposer Marine'}</button>
                    {s.marine.proposee && <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" checked={!!s.marine.accord} onChange={e => maj(['marine'], { ...s.marine, accord: e.target.checked })} /> le client est d’accord</label>}
                  </div>
                )}
              </div>
            </>}
          </Partie>
        )
      })}

      <Partie num="3" ancre="acq-p3" titre="Vendre pour acheter" aide="une fois pour la personne" script={script('3')} ouverte={ouv.p3} onBasculer={() => basculer('p3')} faite={!!s.vendre.statut_logement}>
        <div className="space-y-2">
          <Champ label="Logement actuel"><Choix petit valeur={s.vendre.statut_logement} onChange={v => maj(['vendre', 'statut_logement'], v)} options={[['PROPRIETAIRE', 'Propriétaire'], ['LOCATAIRE', 'Locataire'], ['HEBERGE', 'Hébergé']]} /></Champ>
          <Champ label="Depuis"><input className="input max-w-[12rem]" placeholder="2015" value={s.vendre.depuis || ''} onChange={e => maj(['vendre', 'depuis'], e.target.value)} /></Champ>
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
                    {s.vendre.estimation_proposee && <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" checked={!!s.vendre.estimation_acceptee} onChange={e => maj(['vendre', 'estimation_acceptee'], e.target.checked)} /> acceptée</label>}
                    {s.vendre.estimation_acceptee && <input type="datetime-local" className="input max-w-[14rem]" value={s.vendre.date_rdv_estimation || ''} onChange={e => maj(['vendre', 'date_rdv_estimation'], e.target.value)} />}
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
                  <Champ label="Rendez-vous de signature le"><input type="datetime-local" className="input" value={s.date_prochaine_action} onChange={e => maj(['date_prochaine_action'], e.target.value)} /></Champ>
                </div>
                <p className="text-[11px] text-emerald-900">La prochaine action devient « Rendez-vous de signature ». La signature se fait hors de l’appli.</p>
              </div>
            )}
            {mandat.etat === 'REFUSE' && <Champ label="Motif du refus (court)"><input className="input" maxLength={300} value={mandat.motif_refus} onChange={e => maj(['mandat'], { ...mandat, motif_refus: e.target.value })} /></Champ>}
          </div>
        </Partie>
      )}

      <Partie num={mandatVisible ? '5' : '4'} ancre="acq-p4" titre="Suite donnée" script={script('4')} ouverte={ouv.p4 ?? true} onBasculer={() => basculer('p4')} faite={!!statutChoisi}>
        <div className="space-y-2.5">
          <Choix valeur={statutChoisi} onChange={v => maj(['statut_final'], v)} options={STATUTS} />
          {statutChoisi === 'REQUALIFIE' && manquesReq.length > 0 && <p className="text-sm text-red-700">Requalifié impossible, il manque : {manquesReq.join(', ')}.</p>}
          <Champ label="Prochaine action"><Choix petit valeur={s.prochaine_action} onChange={v => maj(['prochaine_action'], v)} options={ACTIONS.map(a => [a, a])} /></Champ>
          {(s.prochaine_action || statutChoisi === 'A_RAPPELER') && <Champ label={statutChoisi === 'A_RAPPELER' ? 'Rappeler le' : 'Date'}>
            <input type="datetime-local" className="input max-w-[14rem]" value={s.date_prochaine_action} onChange={e => maj(['date_prochaine_action'], e.target.value)} /></Champ>}
          <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={s.consentement_rappel} onChange={e => maj(['consentement_rappel'], e.target.checked)} /> Accepte d’être rappelé(e)</label>
          <Champ label="Note (faits utiles à la recherche, jamais d’appréciation sur la personne)">
            <textarea className="input min-h-[4rem]" value={s.notes} onChange={e => maj(['notes'], e.target.value)} /></Champ>
        </div>
      </Partie>

      </>}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-quai-border p-2.5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-3xl mx-auto flex gap-2">
          <button className="btn-secondary" onClick={onRetour}>Plus tard</button>
          <button className="btn-primary flex-1 min-h-[2.75rem]" disabled={envoi || !s.issue || (bloque && s.issue !== 'MAIL') || (joint && (!statutChoisi || (statutChoisi === 'REQUALIFIE' && manquesReq.length > 0)))} onClick={enregistrer}>
            {envoi ? 'Enregistrement…' : 'Enregistrer et suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}
