import { useState, lazy, Suspense } from 'react'
import Layout from '../../components/Layout'
import ErrorBoundary from '../../components/ErrorBoundary'
import Icon from '../../components/ui/Icon'
import Marque from '../../components/ui/Marque'
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
const AcqSuivi = lazy(() => import('../acquereurs/AcqSuivi'))
const AcqListing = lazy(() => import('../acquereurs/AcqListing'))
const AcqAdmin = lazy(() => import('../acquereurs/AcqAdmin'))
const AcqHub = lazy(() => import('../acquereurs/AcqHub'))
const AcqAppel = lazy(() => import('../acquereurs/AcqAppel'))
const OperationHub = lazy(() => import('../operation/OperationHub'))

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
        <Pastilles valeur={v} onChange={setSous} choix={[['tableau', 'Tableau de bord'], ['personnes', 'Par personne'], ['ecran', 'Écran de l’agent']]} />
        {v === 'tableau' && <DashboardPage onNavigate={(p) => p === 'contacts' ? setOnglet('contacts') : p === 'session' ? setSous('ecran') : p === 'supervision' ? setSous('personnes') : null} />}
        {v === 'personnes' && <SupervisionPage />}
        {v === 'ecran' && <SessionHub />}
      </>)
    }
    if (onglet === 'contacts') return <ContactsPage />
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
    if (onglet === 'suivi') return <AdminPage onglet="courtage" />
    if (onglet === 'contacts') return <Defile><div className="max-w-4xl mx-auto p-4 md:p-6"><VueCourtage /></div></Defile>
    if (onglet === 'import') return <AdminPage onglet="imports" />
    if (onglet === 'report') return <AVenir mission="Mission Courtage" />
    return <AdminPage onglet="params" partie="courtage" />
  }
  // Mission Acquéreurs
  if (onglet === 'suivi') return (
    <Defile>
      <div className="max-w-3xl mx-auto px-3 pt-3 flex flex-wrap gap-2">
        <button onClick={() => plein({ type: 'acq', onglet: 'file' })} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="eye" size="sm" /> Écran de l’agent</button>
        <button onClick={() => plein({ type: 'acq', onglet: 'demo' })} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="play" size="sm" /> Démonstration</button>
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
    ...Object.entries(MISSIONS).map(([id, m]) => ({ id, label: m.titre, court: m.court, icon: m.icon, lettre: m.lettre })),
    ...(operation ? [{ id: 'operation', label: 'Anciens clients', court: 'Anc. clients', icon: 'star' }] : []),
    { section: 'Toute l’appli' },
    ...Object.entries(AUTRES).map(([id, a]) => ({ id, label: a.titre, icon: a.icon })),
  ]
  const mission = MISSIONS[page]
  const titre = page === 'accueil' ? 'Accueil' : page === 'plus' ? 'Plus'
    : mission ? <span className="inline-flex items-center gap-2.5"><Marque lettre={mission.lettre} taille={28} />{mission.titre}</span>
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
