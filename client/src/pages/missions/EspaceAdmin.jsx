import { useState, useEffect, lazy, Suspense } from 'react'
import api from '../../utils/api'
import Layout from '../../components/Layout'
import ErrorBoundary from '../../components/ErrorBoundary'
import Icon from '../../components/ui/Icon'
import { ONGLETS } from './onglets'

// L'espace de l'admin, rangé par MISSION (18/11/2026).
//
// Avant : on arrivait sur le tableau de bord de la mission de Chrystelle, le
// suivi de Marine était un onglet de l'administration, et le Fichier
// Acquéreurs un bouton du menu. Maintenant : un accueil, trois missions au
// même rang avec les mêmes cinq onglets, puis ce qui vaut pour toute l'appli.
//
// Rien n'est reconstruit : chaque onglet affiche un écran qui existait déjà.
// Les espaces de Chrystelle, de Marine et de Lilas ne passent pas par ici.
const AccueilMissions = lazy(() => import('./AccueilMissions'))
const DashboardPage = lazy(() => import('../DashboardPage'))
const SupervisionPage = lazy(() => import('../SupervisionPage'))
const SessionHub = lazy(() => import('../SessionHub'))
const ContactsPage = lazy(() => import('../ContactsPage'))
const ScriptsPage = lazy(() => import('../ScriptsPage'))
const AdminPage = lazy(() => import('../AdminPage'))
const ImportModal = lazy(() => import('../../components/ImportModal'))
const VueCourtage = lazy(() => import('../SessionHub').then(m => ({ default: m.VueCourtage })))
const VueAgent = lazy(() => import('../SessionHub').then(m => ({ default: m.VueAgent })))
const ReportBandeau = lazy(() => import('../acquereurs/AcqAdmin').then(m => ({ default: m.ReportBandeau })))
const AcqSuivi = lazy(() => import('../acquereurs/AcqSuivi'))
const AcqListing = lazy(() => import('../acquereurs/AcqListing'))
const AcqAdmin = lazy(() => import('../acquereurs/AcqAdmin'))
const AcqHub = lazy(() => import('../acquereurs/AcqHub'))
const AcqAppel = lazy(() => import('../acquereurs/AcqAppel'))
const OperationHub = lazy(() => import('../operation/OperationHub'))
const DemoMission = lazy(() => import('./DemoMission'))

// `lettre` : le pictogramme du logo de la mission (E, A, C).
const MISSIONS = {
  estimes: { titre: 'Mission Estimés', court: 'Estimés', icon: 'phone', lettre: 'E' },
  acquereurs: { titre: 'Mission Acquéreurs', court: 'Acquéreurs', icon: 'users', lettre: 'A' },
  courtage: { titre: 'Mission Courtage', court: 'Courtage', icon: 'table', lettre: 'C' },
}
const AUTRES = {
  utilisateurs: { titre: 'Utilisateurs', icon: 'user', onglet: 'users' },
  activite: { titre: 'Activité', icon: 'history', onglet: 'activite' },
  donnees: { titre: 'Données', icon: 'database', onglet: 'donnees' },
}

const Attente = () => <div className="flex-1 p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>
// Un écran sans défilement propre (ceux du Fichier Acquéreurs, les panneaux).
const Defile = ({ children }) => <div className="flex-1 overflow-y-auto pb-24 md:pb-6 bg-quai-light">{children}</div>

function AVenir({ mission }) {
  return (
    <Defile>
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="card">
          <h2 className="font-semibold text-quai-navy mb-1">Report Modelo : à venir</h2>
          <p className="text-sm text-quai-muted leading-relaxed">
            Le report des appels de la {mission} dans Modelo n’est pas encore construit. Il suivra le même principe que
            pour la Mission Acquéreurs : un fichier à télécharger pour Exploration Modelo, puis l’import de son retour.
            Il attend ses réponses sur les identifiants des fiches.
          </p>
        </div>
      </div>
    </Defile>
  )
}

function ImportEstimes() {
  const [ouvert, setOuvert] = useState(false)
  const [fait, setFait] = useState(false)
  return (
    <Defile>
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="card">
          <h2 className="font-semibold text-quai-navy mb-1">Importer des contacts</h2>
          <p className="text-sm text-quai-muted leading-relaxed mb-3">
            Un fichier Excel ou CSV de contacts estimés. L’import vérifie les colonnes, signale les doublons,
            et n’écrase aucune fiche existante.
          </p>
          <button onClick={() => { setFait(false); setOuvert(true) }} className="btn-primary inline-flex items-center gap-1.5">
            <Icon name="upload" size="sm" /> Choisir un fichier
          </button>
          {fait && <p className="text-sm text-emerald-700 mt-3">Import terminé. Les fiches sont dans l’onglet Contacts.</p>}
        </div>
      </div>
      {ouvert && <Suspense fallback={null}><ImportModal onClose={() => setOuvert(false)} onImported={() => { setOuvert(false); setFait(true) }} /></Suspense>}
    </Defile>
  )
}

// En tête du Suivi de chaque mission, les deux mêmes accès : voir l'écran de
// l'agent, et la démonstration (quand elle existe pour la mission).
function AccesMission({ onEcran, onDemo, ecranActif }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={onEcran} className={`btn-sm inline-flex items-center gap-1.5 ${ecranActif ? 'btn-primary' : 'btn-secondary'}`}><Icon name="eye" size="sm" /> Écran de l’agent</button>
      {onDemo && <button onClick={onDemo} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="play" size="sm" /> Démonstration</button>}
    </div>
  )
}

// Le report Modelo d'une mission qui ne l'a pas encore : la place est prête.
function ReportAVenir() {
  return (
    <div className="rounded-xl border border-dashed border-quai-border bg-white px-3 py-2.5">
      <div className="text-sm font-semibold text-quai-navy">Report dans Modelo</div>
      <div className="text-[11px] text-quai-muted leading-snug">À venir pour cette mission : le fichier à reporter et l’import du retour apparaîtront ici, comme pour la Mission Acquéreurs.</div>
    </div>
  )
}

// L'écran de l'agent de la Mission Estimés, en lecture seule : sa file, ses
// rappels, ses appels du jour. S'il y a plusieurs agents, on choisit.
function EcranEstimes() {
  const [agents, setAgents] = useState(null), [id, setId] = useState(null)
  useEffect(() => {
    api.get('/admin/agents').then(r => { const a = r.data.filter(u => u.role === 'agent' && u.actif); setAgents(a); setId(a[0]?.id || null) }).catch(() => setAgents([]))
  }, [])
  if (!agents) return <Attente />
  if (!agents.length) return <p className="p-6 text-sm text-quai-muted">Aucun agent sur cette mission pour l’instant.</p>
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs bg-white border border-quai-border rounded-full px-3 py-1 text-quai-muted">Lecture seule</span>
        {agents.length > 1 && (
          <select className="input w-auto" value={id} onChange={e => setId(Number(e.target.value))} aria-label="Choisir l’agent">
            {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
          </select>
        )}
      </div>
      {id && <VueAgent id={String(id)} />}
    </div>
  )
}

// Les fiches du courtage, en lecture seule, filtrables par statut : c'est là
// qu'arrivent les cases du Suivi (« Simulations », « Dossiers en cours »…).
const STATUTS_COURTAGE = { '': 'Toutes', a_qualifier: 'À qualifier', en_relance: 'En relance', injoignable: 'Injoignable', simulation_faite: 'Simulation faite',
  dossier_en_cours: 'Dossier en cours', gagne: 'Gagné', perdu: 'Perdu', faux_numero: 'Faux numéro', ne_plus_contacter: 'Ne plus contacter' }
function FichesCourtage({ statutInitial = '' }) {
  const [statut, setStatut] = useState(statutInitial), [fiches, setFiches] = useState(null), [q, setQ] = useState('')
  useEffect(() => {
    setFiches(null)
    api.get('/courtage/fiches', { params: statut ? { statut } : {} }).then(r => setFiches(r.data)).catch(() => setFiches([]))
  }, [statut])
  const jour = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR') : ''
  const m = q.trim().toLowerCase()
  const visibles = (fiches || []).filter(f => !m || `${f.nom} ${f.prenom} ${f.telephone} ${f.mail}`.toLowerCase().includes(m))
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input flex-1 min-w-[12rem]" placeholder="Nom, téléphone ou e-mail…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input w-auto" value={statut} onChange={e => setStatut(e.target.value)} aria-label="Filtrer par statut">
          {Object.entries(STATUTS_COURTAGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {!fiches ? <p className="text-sm text-quai-muted animate-pulse">Chargement…</p> : (
        <ul className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border">
          {visibles.slice(0, 300).map(f => (
            <li key={f.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-quai-navy">{f.prenom} {f.nom}</span>
                <span className="text-[11px] text-quai-muted">{[f.telephone, f.mail].filter(Boolean).join(' · ')}</span>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full border border-quai-border bg-quai-light text-quai-navy">{STATUTS_COURTAGE[f.statut] || f.statut}</span>
              </div>
              <div className="text-[11px] text-quai-muted mt-0.5">
                {[f.montant_projet, f.reference_bien, f.date_contact && `message du ${jour(f.date_contact)}`, f.prochaine_relance && `relance le ${jour(f.prochaine_relance)}`].filter(Boolean).join(' · ')}
              </div>
            </li>
          ))}
          {!visibles.length && <li className="p-4 text-sm text-quai-muted">Aucune fiche.</li>}
        </ul>
      )}
      {visibles.length > 300 && <p className="text-[11px] text-quai-muted text-center mt-2">300 premières affichées sur {visibles.length}.</p>}
    </div>
  )
}

// Sous-onglets, quand un onglet regroupe plusieurs écrans existants.
function Pastilles({ choix, valeur, onChange }) {
  return (
    <div className="bg-quai-light px-4 md:px-6 pt-3 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
      {choix.map(([id, l]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${valeur === id ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-muted'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

function ContenuMission({ mission, onglet, setOnglet, sous, setSous, plein }) {
  if (mission === 'estimes') {
    if (onglet === 'suivi') {
      const v = sous || 'tableau'
      return (<>
        <div className="bg-quai-light px-4 md:px-6 pt-3 space-y-2 shrink-0">
          <AccesMission ecranActif={v === 'ecran'} onEcran={() => setSous(v === 'ecran' ? 'tableau' : 'ecran')} onDemo={() => plein({ type: 'demo', mission: 'estimes' })} />
          <ReportAVenir />
        </div>
        {v !== 'ecran' && <Pastilles valeur={v} onChange={setSous} choix={[['tableau', 'Tableau de bord'], ['personnes', 'Par personne']]} />}
        {v === 'tableau' && <DashboardPage
          onNavigate={(p) => p === 'contacts' ? setOnglet('contacts') : p === 'session' ? setSous('ecran') : p === 'supervision' ? setSous('personnes') : null}
          onVoir={(cible) => { if (cible === 'appels') return setSous('personnes'); setSous(cible === 'projets' ? 'statut:rdv_obtenu' : null); setOnglet('contacts') }} />}
        {v === 'personnes' && <SupervisionPage />}
        {v === 'ecran' && <Defile><EcranEstimes /></Defile>}
      </>)
    }
    if (onglet === 'contacts') return <ContactsPage statutInitial={String(sous || '').startsWith('statut:') ? sous.slice(7) : ''} />
    if (onglet === 'import') return <ImportEstimes />
    if (onglet === 'report') return <AVenir mission="Mission Estimés" />
    const v = sous || 'delais'
    return (<>
      <Pastilles valeur={v} onChange={setSous} choix={[['delais', 'Délais de relance'], ['scripts', 'Scripts d’appel'], ['fichiers', 'Fichiers et accès']]} />
      {v === 'delais' && <AdminPage onglet="params" partie="estimes" />}
      {v === 'scripts' && <ScriptsPage />}
      {v === 'fichiers' && <AdminPage onglet="fichiers" />}
    </>)
  }
  if (mission === 'courtage') {
    if (onglet === 'suivi') return (<>
      <div className="bg-quai-light px-4 md:px-6 pt-3 space-y-2 shrink-0">
        <AccesMission ecranActif={sous === 'ecran'} onEcran={() => setSous(sous === 'ecran' ? null : 'ecran')} onDemo={() => plein({ type: 'demo', mission: 'courtage' })} />
        <ReportAVenir />
      </div>
      {sous === 'ecran'
        ? <Defile><div className="max-w-4xl mx-auto p-4 md:p-6"><span className="inline-block text-xs bg-white border border-quai-border rounded-full px-3 py-1 text-quai-muted mb-3">Lecture seule</span><VueCourtage /></div></Defile>
        : <AdminPage onglet="courtage" onVoir={(cible) => { setSous(cible === 'boites' ? null : 'statut:' + cible); setOnglet('contacts') }} />}
    </>)
    if (onglet === 'contacts') {
      const filtre = String(sous || '').startsWith('statut:') ? sous.slice(7) : null
      const v = filtre != null || sous === 'fiches' ? 'fiches' : 'boites'
      return (<>
        <Pastilles valeur={v} onChange={(x) => setSous(x === 'fiches' ? 'fiches' : null)} choix={[['boites', 'Boîtes de relance'], ['fiches', 'Toutes les fiches']]} />
        <Defile><div className="max-w-4xl mx-auto p-4 md:p-6">
          {v === 'boites' ? <VueCourtage /> : <FichesCourtage key={filtre || 'toutes'} statutInitial={filtre || ''} />}
        </div></Defile>
      </>)
    }
    if (onglet === 'import') return <AdminPage onglet="imports" />
    if (onglet === 'report') return <AVenir mission="Mission Courtage" />
    return <AdminPage onglet="params" partie="courtage" />
  }
  // Mission Acquéreurs
  if (onglet === 'suivi') return (
    <Defile>
      <div className="max-w-3xl mx-auto px-3 md:px-4 pt-3 space-y-2">
        <AccesMission onEcran={() => plein({ type: 'acq', onglet: 'file' })} onDemo={() => plein({ type: 'acq', onglet: 'demo' })} />
        <ReportBandeau onDetail={() => setOnglet('report')} />
      </div>
      <AcqSuivi onVoir={(f) => { setSous(f); setOnglet('contacts') }} />
    </Defile>
  )
  if (onglet === 'contacts') return <Defile><AcqListing filtreInitial={sous || ''} onOuvrir={(id) => plein({ type: 'fiche', id })} /></Defile>
  if (onglet === 'import') return <Defile><AcqAdmin section="import" /></Defile>
  if (onglet === 'report') return <Defile><AcqAdmin section="report" /></Defile>
  return <Defile><AcqAdmin section="parametres" /></Defile>
}

export default function EspaceAdmin({ operation }) {
  const [page, setPage] = useState('accueil')
  const [onglet, setOngletBrut] = useState('suivi')
  const [sous, setSous] = useState(null)
  const [plein, setPlein] = useState(null)   // un écran hors du menu : opération, écran de l'agent, fiche
  const setOnglet = (o) => { setOngletBrut(o) }
  const aller = (p, o) => {
    if (p === 'operation') return setPlein({ type: 'operation' })
    setPage(p); setOngletBrut(o || 'suivi'); setSous(null)
  }

  if (plein) {
    const fermer = () => setPlein(null)
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="min-h-screen flex"><Attente /></div>}>
          {plein.type === 'operation' && <OperationHub onRetour={fermer} />}
          {plein.type === 'demo' && <DemoMission mission={plein.mission} onFermer={fermer} />}
          {plein.type === 'acq' && <AcqHub onRetour={fermer} libelleRetour="Mission Acquéreurs" ongletInitial={plein.onglet} />}
          {plein.type === 'fiche' && (
            <div className="h-ecran flex flex-col bg-quai-light">
              <header className="bg-quai-navy text-white px-3 py-2 flex items-center gap-2 shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                <div className="font-display font-semibold text-sm flex-1">Mission Acquéreurs</div>
                <button onClick={fermer} className="text-white/80 hover:text-white text-xs inline-flex items-center gap-1 px-2 py-2"><Icon name="arrow-left" size="sm" /> Contacts</button>
              </header>
              <main className="flex-1 overflow-y-auto">
                <AcqAppel key={plein.id} id={plein.id} horsFile position="Depuis les contacts" onSuivant={fermer} onRetour={fermer} />
              </main>
            </div>
          )}
        </Suspense>
      </ErrorBoundary>
    )
  }

  const menu = [
    { id: 'accueil', label: 'Accueil', icon: 'layout-dashboard' },
    { section: 'Missions' },
    ...Object.entries(MISSIONS).map(([id, m]) => ({ id, label: m.titre, court: m.court, icon: m.icon, lettre: m.lettre, logo: `/marque/mission-${id}-long-clair.png` })),
    ...(operation ? [{ id: 'operation', label: 'Anciens clients', court: 'Anc. clients', icon: 'star' }] : []),
    { section: 'Toute l’appli' },
    ...Object.entries(AUTRES).map(([id, a]) => ({ id, label: a.titre, icon: a.icon })),
  ]
  const mission = MISSIONS[page]
  const titre = page === 'accueil' ? 'Accueil' : page === 'plus' ? 'Plus'
    : mission ? <img src={`/marque/mission-${page}-long-sombre.png`} alt={mission.titre} className="h-8 w-auto" />
    : AUTRES[page]?.titre
  // Sur téléphone, huit onglets dans la barre du bas, c'était trop : l'accueil,
  // les trois missions, et « Plus » pour le reste.
  const menuMobile = [
    { id: 'accueil', label: 'Accueil', icon: 'layout-dashboard' },
    ...Object.entries(MISSIONS).map(([id, m]) => ({ id, label: m.court, icon: m.icon, lettre: m.lettre })),
    { id: 'plus', label: 'Plus', icon: 'plus' },
  ]
  const restes = [
    ...(operation ? [['operation', 'Opération anciens clients', 'Le suivi, la répartition et le report Modelo', 'star']] : []),
    ['utilisateurs', 'Utilisateurs et missions', 'Les comptes, et qui fait quoi', 'user'],
    ['activite', 'Activité', 'Qui a fait quoi, et quand', 'history'],
    ['donnees', 'Données et sauvegardes', 'Sauvegardes, corbeille', 'database'],
  ]

  return (
    <Layout page={page} onNavigate={aller} nav={menu} navMobile={menuMobile} titre={titre}>
      <ErrorBoundary>
        <Suspense fallback={<Attente />}>
          {page === 'accueil' && <AccueilMissions onOuvrir={aller} />}
          {page === 'plus' && (
            <div className="flex-1 overflow-y-auto p-4 pb-24 bg-quai-light">
              <div className="max-w-xl mx-auto space-y-2">
                {restes.map(([id, l, aide, ic]) => (
                  <button key={id} onClick={() => aller(id)} className="w-full bg-white border border-quai-border rounded-xl px-4 py-3.5 text-left hover:border-quai-gold flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-quai-light grid place-items-center shrink-0"><Icon name={ic} size="md" className="text-quai-navy" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-quai-navy">{l}</span><span className="block text-xs text-quai-muted">{aide}</span></span>
                    <Icon name="chevron-right" size="sm" className="text-quai-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {AUTRES[page] && <AdminPage key={page} onglet={AUTRES[page].onglet} />}
          {mission && (
            <>
              <div className="bg-white border-b border-quai-border flex gap-0.5 px-2 md:px-4 shrink-0 overflow-x-auto no-scrollbar">
                {ONGLETS.map(o => (
                  <button key={o.id} onClick={() => { setOngletBrut(o.id); setSous(null) }}
                    className={`px-3 py-2.5 text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 border-b-2 transition-colors ${
                      onglet === o.id ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
                    <Icon name={o.icon} size="sm" /> {o.label}
                  </button>
                ))}
              </div>
              <ContenuMission key={`${page}-${onglet}`} mission={page} onglet={onglet} setOnglet={setOnglet} sous={sous} setSous={setSous} plein={setPlein} />
            </>
          )}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}
