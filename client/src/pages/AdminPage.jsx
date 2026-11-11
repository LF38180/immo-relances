import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import ImportCahierModal from '../components/ImportCahierModal'
import { useAuth } from '../hooks/useAuth'
import FichiersAdmin, { Corbeille } from './FichiersAdmin'

// Date UTC ISO -> "il y a 2 h — 30/06/2026 19:02" (heure française, été/hiver auto).
function formatConnexion(iso) {
  if (!iso) return { relatif: 'Jamais', absolu: '' }
  const d = new Date(iso)
  const absolu = d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  let relatif
  if (sec < 60) relatif = 'à l\'instant'
  else if (sec < 3600) relatif = `il y a ${Math.floor(sec / 60)} min`
  else if (sec < 86400) relatif = `il y a ${Math.floor(sec / 3600)} h`
  else relatif = `il y a ${Math.floor(sec / 86400)} j`
  return { relatif, absolu }
}

export default function AdminPage() {
  const { user } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [params, setParams] = useState({})
  const [newUser, setNewUser] = useState({ nom: '', prenom: '', email: '', password: '', role: 'agent' })
  const [showNewUser, setShowNewUser] = useState(false)
  const [confirmEffacer, setConfirmEffacer] = useState('')
  const [effacement, setEffacement] = useState(false)
  const [corbeilleVue, setCorbeilleVue] = useState(0)
  // Les réglages tels que chargés : à l'enregistrement, seuls ceux qui ont changé partent.
  const [paramsCharges, setParamsCharges] = useState({})

  const effacerTousContacts = async () => {
    if (confirmEffacer !== 'EFFACER' || effacement) return
    setEffacement(true)
    try {
      // La confirmation est maintenant exigée par le serveur, qui écrit une sauvegarde
      // avant et envoie les fiches à la corbeille au lieu de les détruire.
      const r = await api.delete('/contacts/all', { data: { confirmation: 'EFFACER' }, timeout: 120000 })
      toast.success(`${r.data.supprimes} contact(s) envoyé(s) à la corbeille. Sauvegarde ${r.data.sauvegarde} écrite avant.`, { duration: 8000 })
      setCorbeilleVue(v => v + 1)
      setConfirmEffacer('')
    } catch (err) { toast.error(err.messageLisible || 'Erreur (réservé admin)') }
    finally { setEffacement(false) }
  }

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data))
    api.get('/admin/parametres').then(r => { setParams(r.data); setParamsCharges(r.data) })
  }, [])

  // L'écran renvoyait TOUS les réglages tels qu'il les avait chargés : resté ouvert
  // une heure, il réécrivait par exemple le modèle de mail de Marine avec son
  // ancienne version. Il n'envoie plus que ce qui a réellement été modifié ici.
  const saveParams = async () => {
    const modifies = Object.fromEntries(Object.entries(params).filter(([k, v]) => String(v) !== String(paramsCharges[k] ?? '')))
    if (!Object.keys(modifies).length) { toast('Aucun réglage modifié'); return }
    try {
      await api.put('/admin/parametres', modifies)
      setParamsCharges(p => ({ ...p, ...modifies }))
      toast.success('Paramètres sauvegardés')
    } catch (err) { toast.error(err.messageLisible || 'Enregistrement impossible') }
  }

  const createUser = async () => {
    try {
      await api.post('/admin/users', newUser)
      toast.success('Utilisateur créé')
      api.get('/admin/users').then(r => setUsers(r.data))
      setShowNewUser(false)
      setNewUser({ nom: '', prenom: '', email: '', password: '', role: 'agent' })
    } catch { toast.error('Erreur (email déjà utilisé ?)') }
  }

  // Un agent qui oublie le mot de passe qu'il vient de choisir : l'admin lui en
  // donne un provisoire, que l'application lui fera changer à la prochaine
  // connexion. Il n'y avait aucun moyen de le faire depuis l'écran — seule la
  // création d'un compte acceptait un mot de passe.
  const reinitialiserMdp = async (u) => {
    const saisi = window.prompt(
      `Nouveau mot de passe provisoire pour ${u.prenom} ${u.nom} (8 caractères minimum).\n` +
      `Il devra en choisir un autre à sa prochaine connexion.`, 'LeQuai2026')
    if (saisi === null) return
    const mdp = saisi.trim()
    if (mdp.length < 8) return toast.error('8 caractères minimum')
    try {
      await api.put(`/admin/users/${u.id}`, { password: mdp, must_change_password: 1 })
      toast.success(`Mot de passe provisoire posé pour ${u.prenom}. Il le changera à sa prochaine connexion.`, { duration: 6000 })
      // Recharger la liste, sans que son échec passe pour un échec du mot de
      // passe : le mot de passe est déjà posé quand on arrive ici.
      api.get('/admin/users').then(r => setUsers(r.data)).catch(() => {})
    } catch (e) { toast.error(e.messageLisible || 'Échec') }
  }

  const toggleUser = async (u) => {
    await api.put(`/admin/users/${u.id}`, { actif: u.actif ? 0 : 1 })
    toast.success(u.actif ? 'Utilisateur désactivé' : 'Utilisateur activé')
    api.get('/admin/users').then(r => setUsers(r.data))
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 md:pb-6 bg-quai-light">
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Administration" />

        <div className="flex overflow-x-auto border-b border-quai-border mb-6">
          {[['users','Utilisateurs','users'],['params','Paramètres','settings'],['courtage','Suivi Marine','phone-call'],...(estAdmin ? [['fichiers','Fichiers','table'],['imports','Imports courtage','file-up'],['donnees','Données','database'],['activite','Activité','history']] : [])].map(([t, lbl, ic]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
              <Icon name={ic} size="sm" /> {lbl}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="font-semibold text-quai-navy">Gestion des utilisateurs</h2>
              <button onClick={() => setShowNewUser(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Nouvel utilisateur</button>
            </div>

            {showNewUser && (
              <div className="card mb-4 border-2 border-quai-gold/40">
                <h3 className="font-medium text-quai-navy mb-3">Créer un utilisateur</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {[['Prénom','prenom'],['Nom','nom'],['Email','email'],['Mot de passe','password']].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-quai-muted mb-1">{l}</label>
                      <input type={k === 'password' ? 'password' : 'text'} className="input"
                        value={newUser[k]} onChange={e => setNewUser(u => ({ ...u, [k]: e.target.value }))} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-quai-muted mb-1">Rôle</label>
                    <select className="input" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                      <option value="agent">Agent</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      <option value="courtage">Courtage</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createUser} className="btn-primary btn-sm">Créer</button>
                  <button onClick={() => setShowNewUser(false)} className="btn-secondary btn-sm">Annuler</button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-quai-light">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Rôle</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Dernière connexion</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-quai-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-quai-border">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium text-quai-navy">{u.prenom} {u.nom}</td>
                      <td className="px-4 py-3 text-quai-muted">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.role === 'admin' ? 'bg-quai-navy text-white' : u.role === 'manager' ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => { const { relatif, absolu } = formatConnexion(u.last_login); return (
                          <span className={u.last_login ? 'text-quai-navy' : 'text-quai-muted italic'}>
                            {relatif}{absolu && <span className="text-quai-muted text-xs"> — {absolu}</span>}
                          </span>
                        ) })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${u.actif ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-quai-light text-quai-muted border border-quai-border'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button onClick={() => reinitialiserMdp(u)} className="text-xs text-quai-navy hover:text-quai-gold font-medium">
                            Nouveau mot de passe
                          </button>
                          <button onClick={() => toggleUser(u)} className="text-xs text-quai-muted hover:text-quai-navy font-medium">
                            {u.actif ? 'Désactiver' : 'Activer'}
                          </button>
                        </div>
                        {!!u.must_change_password && (
                          <div className="text-[10px] text-amber-700 mt-0.5">changement demandé à la prochaine connexion</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'params' && (
          <div>
            <h2 className="font-semibold text-quai-navy mb-4">Paramètres de relance</h2>
            <div className="card space-y-4">
              <ParamField label="Delai re-proposition sans reponse (jours)" cle="delai_sans_reponse_jours" params={params} setParams={setParams} type="number" />
              <ParamField label="Relance apres 'plus de projet' (jours)" cle="relance_sans_projet_jours" params={params} setParams={setParams} type="number" />
              <hr className="border-quai-border" />
              <h3 className="font-medium text-quai-navy">Score de base par catégorie</h3>
              {[
                ['ancien_client', 'Ancien client'],
                ['prospect_chaud', 'Prospect chaud'],
                ['prospect_froid', 'Prospect froid'],
                ['acquereur', 'Acquéreur'],
                ['vendeur', 'Vendeur'],
                ['autre', 'Autre'],
              ].map(([k, l]) => (
                <ParamField key={k} label={l} cle={`score_${k}`} params={params} setParams={setParams} type="number" min={0} max={100} />
              ))}
              <hr className="border-quai-border" />
              <ParamField label="Délai avant recontact (jours)" cle="delai_recontact_jours" params={params} setParams={setParams} type="number" />
              <button onClick={saveParams} className="btn-primary">Sauvegarder les paramètres</button>
            </div>

            {estAdmin && (
              <>
                <h2 className="font-semibold text-quai-navy mt-8 mb-4">Paramètres courtage</h2>
                <div className="card space-y-4">
                  <ParamField label="Délai de relance (jours)" cle="courtage_delai_relance_jours" params={params} setParams={setParams} type="number" min={1} />
                  <ParamField label="Tentatives avant Injoignable" cle="courtage_tentatives_max" params={params} setParams={setParams} type="number" min={1} />
                  <ParamField label="Téléphone Marine" cle="courtage_tel_marine" params={params} setParams={setParams} placeholder="06 00 00 00 00" />
                  <ParamField label="Objet du mail" cle="courtage_mail_objet" params={params} setParams={setParams} large />
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                    <label className="sm:w-48 text-sm font-medium text-quai-muted sm:pt-2">Corps du mail</label>
                    <textarea
                      className="input flex-1 resize-y" rows={8}
                      value={params.courtage_mail_corps || ''}
                      onChange={e => setParams(p => ({ ...p, courtage_mail_corps: e.target.value }))}
                    />
                  </div>
                  <p className="text-xs text-quai-muted">
                    Variables disponibles dans l'objet et le corps : [Prénom], [BIEN], [TEL_MARINE].
                  </p>
                  <ParamField label="Agents exclus import" cle="courtage_exclusion_agents" params={params} setParams={setParams} large placeholder="NOM Prénom, NOM Prénom" />
                  <hr className="border-quai-border" />
                  <h3 className="font-medium text-quai-navy">Import du cahier des messages</h3>
                  <ParamField label="Latence OUI agent (jours)" cle="courtage_latence_oui_agent" params={params} setParams={setParams} type="number" min={0} />
                  <ParamField label="Latence OUI Gabby (jours)" cle="courtage_latence_oui_gabby" params={params} setParams={setParams} type="number" min={0} />
                  <ParamField label="Latence À qualifier (jours)" cle="courtage_latence_a_qualifier" params={params} setParams={setParams} type="number" min={0} />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <label className="sm:w-48 text-sm font-medium text-quai-muted">Heuristique OUI Gabby</label>
                    <select className="input flex-1"
                      value={params.courtage_heuristique_gabby || 'PS_OUI'}
                      onChange={e => setParams(p => ({ ...p, courtage_heuristique_gabby: e.target.value }))}>
                      <option value="PS_OUI">P ou S valent OUI (recommandé)</option>
                      <option value="PS_REMPLI">P ou S renseignées</option>
                      <option value="off">Pas de distinction</option>
                    </select>
                  </div>
                  <p className="text-xs text-quai-muted">
                    Un lead n'est proposé qu'après la latence de sa catégorie, comptée depuis la date du message.
                  </p>
                  <button onClick={saveParams} className="btn-primary">Sauvegarder les paramètres courtage</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'courtage' && <SuiviCourtage />}

        {tab === 'imports' && estAdmin && <ImportsCourtage />}

        {tab === 'activite' && estAdmin && <Activite />}

        {tab === 'fichiers' && estAdmin && <FichiersAdmin />}

        {tab === 'donnees' && estAdmin && (
          <div>
            <h2 className="font-semibold text-quai-navy mb-4">Données</h2>
            {/* La sauvegarde d'abord, l'effacement ensuite : on ne met pas un
                bouton irréversible seul sur un écran. */}
            <Sauvegardes />
            <Corbeille key={corbeilleVue} />
            <div className="card border-2 border-red-200">
              <div className="flex items-start gap-3 mb-3">
                <Icon name="alert-triangle" size="md" className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-quai-navy">Effacer tous les contacts du module relances</h3>
                  <p className="text-sm text-quai-muted">Envoie à la corbeille la totalité des contacts d’Immo Relances, tous fichiers confondus. Utile avant un ré-import propre.
                    Une sauvegarde est écrite juste avant, et les fiches restent récupérables depuis la corbeille ci-dessus, avec leurs appels.
                    Les fiches de l’opération anciens clients ne sont <b>pas</b> concernées.</p>
                </div>
              </div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Tapez <span className="font-mono font-bold">EFFACER</span> pour confirmer</label>
              <div className="flex gap-2">
                <input className="input w-48" value={confirmEffacer} onChange={e => setConfirmEffacer(e.target.value)} placeholder="EFFACER" />
                <button onClick={effacerTousContacts} disabled={confirmEffacer !== 'EFFACER' || effacement} className="btn-danger inline-flex items-center gap-1.5">
                  <Icon name="trash-2" size="sm" /> {effacement ? 'Effacement…' : 'Effacer tous les contacts'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Imports du cahier des messages : lancement + journal des 20 derniers imports.
// Qui a fait quoi, quand. Journal serveur réuni aux appels, mises à jour,
// attributions et oppositions. Le journal lui-même ne commence qu'à sa mise
// en ligne ; les appels et attributions remontent au début de l'opération.
const TYPES_ACTIVITE = {
  CONNEXION: 'Connexion', MOT_DE_PASSE: 'Mot de passe changé', COMPTE_CREE: 'Compte créé',
  COMPTE_MODIFIE: 'Compte modifié', APPEL: 'Appel', MAJ_FICHE: 'Fiche mise à jour',
  ATTRIBUTION: 'Attribution', OPPOSITION: 'Opposition', NPAI: 'Courrier revenu',
  EXCLUSION: 'Fiche exclue', VERIFICATION: 'Identité tranchée', AGENCE: 'Agence changée',
  APPEL_EFFACE: 'Appel effacé', IMPORT: 'Import', IMPORT_EXCLUS: 'Import des exclus',
}
const ISSUES_LIBELLES = {
  JOINT: 'joint', REPONDEUR: 'répondeur', PAS_DE_REPONSE: 'pas de réponse', FAUX_NUMERO: 'faux numéro',
  A_RAPPELER: 'à rappeler', REFUS_FERME: 'refus ferme', ERREUR_IDENTITE: 'pas la bonne personne', DECEDE: 'décédé',
}
function detailActivite(l) {
  let d = {}
  try { d = l.details ? JSON.parse(l.details) : {} } catch { return l.details || '' }
  switch (l.type) {
    case 'APPEL': return [ISSUES_LIBELLES[d.issue] || d.issue, d.rappel_le && `rappel ${d.rappel_le.replace('T', ' ')}`, d.hors_cadre && 'hors cadre'].filter(Boolean).join(' · ')
    case 'MAJ_FICHE': {
      if (d.efface) return `appel ${d.efface.id} effacé (${ISSUES_LIBELLES[d.efface.issue] || d.efface.issue})`
      const cles = Object.keys(d).filter(k => !['id_modelo', 'appel_id'].includes(k))
      return cles.map(k => { const v = d[k]; const apres = v && typeof v === 'object' && 'apres' in v ? v.apres : v; return `${k} → ${apres == null || apres === '' ? '∅' : apres}` }).join(' · ')
    }
    case 'ATTRIBUTION': return `${d.de || 'pot commun'} → ${d.vers || 'pot commun'}${d.source === 'CORRECTION' ? ' (correction)' : d.reprise ? ' (reprise)' : ''}`
    case 'OPPOSITION': return `${d.canal === 'MAIL' ? 'mail' : 'téléphone'} · ${String(d.origine || '').toLowerCase().replace(/_/g, ' ')}`
    case 'NPAI': return d.npai ? 'courrier revenu signalé' : 'signalement retiré'
    case 'EXCLUSION': return `${d.prenom || ''} ${d.nom || ''} — ${d.motif || ''}`.trim()
    case 'VERIFICATION': return d.verdict === 'CONFIRME' ? 'confirmée' : d.verdict === 'GARDEE' ? 'gardée (autre personne au registre)' : 'écartée'
    case 'AGENCE': return `${d.avant || '∅'} → ${d.apres || '∅'}`
    case 'APPEL_EFFACE': return `appel du ${d.le} par ${d.conseiller} (${ISSUES_LIBELLES[d.issue] || d.issue})`
    case 'CONNEXION': return d.role || ''
    case 'MOT_DE_PASSE': return d.provisoire_leve ? 'mot de passe provisoire remplacé' : ''
    case 'COMPTE_CREE': return `${d.compte} · ${d.email} · ${d.role}${d.agence ? ' · ' + d.agence : ''}`
    case 'COMPTE_MODIFIE': return `${d.compte} : ` + Object.entries(d).filter(([k]) => k !== 'compte').map(([k, v]) => `${k} = ${v}`).join(', ')
    default: return Object.entries(d).map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
  }
}
function dateActivite(le) {
  if (!le) return ''
  return new Date(le.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Activite() {
  const aujourdhui = new Date().toLocaleDateString('fr-CA')
  const ilYa7 = new Date(Date.now() - 6 * 86400000).toLocaleDateString('fr-CA')
  const [depuis, setDepuis] = useState(ilYa7)
  const [jusqua, setJusqua] = useState(aujourdhui)
  const [personne, setPersonne] = useState('')
  const [type, setType] = useState('')
  const [data, setData] = useState(null)
  const [chargement, setChargement] = useState(false)

  const charger = () => {
    setChargement(true)
    api.get('/admin/activite', { params: { depuis, jusqua, personne, type } })
      .then(r => setData(r.data))
      .catch(() => toast.error('Impossible de charger l’activité'))
      .finally(() => setChargement(false))
  }
  useEffect(charger, [depuis, jusqua, personne, type])

  const exporter = () => {
    if (!data) return
    const ech = (v) => { const x = v == null ? '' : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x }
    const lignes = data.lignes.map(l => [dateActivite(l.le), l.le, l.auteur, TYPES_ACTIVITE[l.type] || l.type, l.id_modelo, [l.prenom, l.nom].filter(Boolean).join(' '), detailActivite(l)])
    const csv = [['date', 'utc', 'qui', 'action', 'id_modelo', 'fiche', 'detail'].join(';'), ...lignes.map(l => l.map(ech).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `activite-${depuis}-${jusqua}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><label className="block text-xs font-medium text-quai-muted mb-1">Du</label>
          <input type="date" className="input" value={depuis} onChange={e => setDepuis(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-quai-muted mb-1">Au</label>
          <input type="date" className="input" value={jusqua} onChange={e => setJusqua(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-quai-muted mb-1">Qui</label>
          <select className="input" value={personne} onChange={e => setPersonne(e.target.value)}>
            <option value="">Tout le monde</option>
            {(data?.personnes || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select></div>
        <div><label className="block text-xs font-medium text-quai-muted mb-1">Action</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="">Toutes</option>
            {(data?.types || []).map(t => <option key={t.type} value={t.type}>{TYPES_ACTIVITE[t.type] || t.type} ({t.n})</option>)}
          </select></div>
        <button onClick={exporter} disabled={!data?.lignes?.length} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
          <Icon name="download" size="sm" /> Exporter en CSV
        </button>
        <span className="text-xs text-quai-muted">{chargement ? 'Chargement…' : data ? `${data.total} ligne${data.total > 1 ? 's' : ''}${data.total >= 2000 ? ' (limité à 2 000, resserrez la période)' : ''}` : ''}</span>
      </div>
      <p className="text-xs text-quai-muted mb-3">Appels, mises à jour de fiche, attributions et oppositions depuis le début de l’opération. Connexions, comptes, courriers revenus, exclusions, vérifications et imports depuis le 4 novembre 2026.</p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="bg-quai-light text-left text-xs text-quai-muted">
            <th className="px-3 py-2">Quand</th><th className="px-3 py-2">Qui</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Fiche</th><th className="px-3 py-2">Détail</th>
          </tr></thead>
          <tbody>
            {(data?.lignes || []).map((l, i) => (
              <tr key={i} className="border-t border-quai-border/60 align-top">
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-quai-muted">{dateActivite(l.le)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-quai-navy">{l.auteur || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{TYPES_ACTIVITE[l.type] || l.type}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{l.nom ? `${l.prenom || ''} ${l.nom}`.trim() : l.id_modelo || ''}</td>
                <td className="px-3 py-1.5 text-quai-text">{detailActivite(l)}</td>
              </tr>
            ))}
            {data && !data.lignes.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-quai-muted">Rien sur cette période.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ImportsCourtage() {
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const charger = () => api.get('/courtage/imports')
    .then(r => setImports(r.data))
    .catch(() => toast.error('Erreur de chargement du journal'))
    .finally(() => setLoading(false))

  useEffect(() => { charger() }, [])

  const COLONNES = [
    ['lignes_lues', 'Lues'], ['creees', 'Créées'], ['doublons', 'Doublons'],
    ['exclues', 'Exclues'], ['blacklistees', 'Liste noire'], ['ignorees', 'Ignorées'],
  ]

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="font-semibold text-quai-navy">Imports courtage</h2>
        <div className="flex gap-2">
          <button onClick={charger} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Icon name="refresh-cw" size="sm" /> Actualiser
          </button>
          <button onClick={() => setShowImport(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5">
            <Icon name="file-up" size="sm" /> Importer le cahier
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-quai-light">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Date</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Auteur</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Fichier</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Mode</th>
                {COLONNES.map(([k, l]) => (
                  <th key={k} className="text-right px-3 py-3 font-medium text-quai-muted">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-quai-border">
              {loading && <tr><td colSpan={10} className="px-4 py-6 text-center text-quai-muted animate-pulse">Chargement…</td></tr>}
              {!loading && imports.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-quai-muted">Aucun import pour le moment.</td></tr>
              )}
              {imports.map(i => (
                <tr key={i.id}>
                  <td className="px-4 py-3 text-quai-navy whitespace-nowrap">{formatConnexion(i.created_at).absolu}</td>
                  <td className="px-4 py-3 text-quai-muted whitespace-nowrap">{[i.user_prenom, i.user_nom].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-3 text-quai-muted max-w-48 truncate">{i.fichier || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${i.simulation ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {i.simulation ? 'Simulation' : 'Réel'}
                    </span>
                  </td>
                  {COLONNES.map(([k]) => (
                    <td key={k} className="px-3 py-3 text-right text-quai-navy">{(i[k] || 0).toLocaleString('fr')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-quai-muted mt-2">Les 20 derniers imports. Les simulations sont journalisées mais n'ont rien enregistré.</p>

      {showImport && <ImportCahierModal onClose={() => setShowImport(false)} onImported={charger} />}
    </div>
  )
}

// Suivi de l'activite courtage de Marine : ses journees d'appels, le detail de chacune,
// et l'etat de son portefeuille. Lecture seule (le backend refuse toute ecriture au manager).
function SuiviCourtage() {
  const [dash, setDash] = useState(null)
  const [activite, setActivite] = useState({ jours: [], date: null, detail: [] })
  const [jour, setJour] = useState(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/courtage/dashboard').then(r => setDash(r.data)),
      api.get('/courtage/activite').then(r => { setActivite(r.data); setJour(r.data.date) }),
    ]).catch(() => toast.error('Chargement du suivi courtage impossible'))
      .finally(() => setChargement(false))
  }, [])

  // Changement de journee : on ne recharge que le detail.
  const choisirJour = (d) => {
    setJour(d)
    api.get('/courtage/activite', { params: { date: d } })
      .then(r => setActivite(a => ({ ...a, date: d, detail: r.data.detail })))
      .catch(() => toast.error('Chargement de la journée impossible'))
  }

  if (chargement) return <div className="text-quai-muted text-sm">Chargement…</div>

  const LIB_TYPE = {
    relance: 'Relance faite', pas_de_reponse: 'Pas de réponse', mail_propose: 'Mail envoyé',
    trop_tot: 'Trop tôt', statut: 'Changement de statut', categorie: 'Requalification',
  }
  const parStatut = {}
  ;(dash?.parStatut || []).forEach(r => { parStatut[r.statut] = r.cnt })
  const LIB_STATUT = {
    en_relance: 'En relance', injoignable: 'Injoignable', simulation_faite: 'Simulation faite',
    dossier_en_cours: 'Dossier en cours', gagne: 'Gagné', perdu: 'Perdu',
    faux_numero: 'Faux numéro', ne_plus_contacter: 'Ne plus contacter',
  }

  return (
    <div>
      <h2 className="font-semibold text-quai-navy mb-4">Suivi de l'activité — Marine Rosain</h2>

      {/* Chiffres clefs du portefeuille courtage. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ['À relancer aujourd\'hui', dash?.aRelancerAujourdhui],
          ['Relances (7 jours)', dash?.relancesSemaine],
          ['Simulations', dash?.simulations],
          ['Dossiers en cours', dash?.dossiers],
        ].map(([lbl, val]) => (
          <div key={lbl} className="bg-white border border-quai-border rounded-lg p-4">
            <div className="text-2xl font-bold text-quai-navy">{val ?? 0}</div>
            <div className="text-xs text-quai-muted mt-0.5">{lbl}</div>
          </div>
        ))}
      </div>

      {/* Repartition du portefeuille par statut. */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(LIB_STATUT).map(([cle, lbl]) => (
          <span key={cle} className="text-xs bg-quai-light border border-quai-border rounded-full px-3 py-1 text-quai-navy">
            {lbl} <b>{parStatut[cle] || 0}</b>
          </span>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Journees d'activite. */}
        <div className="md:col-span-1">
          <h3 className="text-sm font-medium text-quai-muted mb-2">Sessions d'appels</h3>
          {activite.jours.length === 0 && (
            <p className="text-sm text-quai-muted">Aucune activité enregistrée pour l'instant.</p>
          )}
          <div className="space-y-1">
            {activite.jours.map(j => (
              <button key={j.jour} onClick={() => choisirJour(j.jour)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${jour === j.jour ? 'border-quai-gold bg-quai-light' : 'border-quai-border bg-white hover:border-quai-gold'}`}>
                <div className="text-sm font-medium text-quai-navy">
                  {new Date(j.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div className="text-xs text-quai-muted">
                  {j.actions} action(s) · {j.relances} relance(s) · {j.sans_reponse} sans réponse
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail de la journee selectionnee. */}
        <div className="md:col-span-2">
          <h3 className="text-sm font-medium text-quai-muted mb-2">
            Détail {jour ? `du ${new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR')}` : ''}
          </h3>
          {activite.detail.length === 0 && (
            <p className="text-sm text-quai-muted">Rien à afficher pour cette journée.</p>
          )}
          <div className="space-y-2">
            {activite.detail.map(a => (
              <div key={a.id} className="bg-white border border-quai-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-quai-navy truncate">
                      {(a.nom || '').toUpperCase()} {a.prenom || ''}
                      {a.telephone_norm && <span className="text-quai-muted font-normal"> · {a.telephone_norm}</span>}
                    </div>
                    <div className="text-xs text-quai-muted mt-0.5">
                      {LIB_TYPE[a.type] || a.type}
                      {' · '}
                      {new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {a.commentaire && (
                      <div className="text-sm text-quai-navy mt-1.5 whitespace-pre-wrap">{a.commentaire}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs bg-quai-light border border-quai-border rounded-full px-2 py-0.5 text-quai-muted">
                    {LIB_STATUT[a.statut] || a.statut}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-quai-muted mt-4">
        Lecture seule : vous consultez l'activité de Marine, vous ne pouvez pas modifier ses fiches.
      </p>
    </div>
  )
}

function ParamField({ label, cle, params, setParams, type = 'text', min, max, placeholder, large }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <label className="sm:w-48 text-sm font-medium text-quai-muted">{label}</label>
      <input
        type={type} min={min} max={max} placeholder={placeholder}
        className={large ? 'input flex-1' : 'input w-full sm:w-48'}
        value={params[cle] || ''}
        onChange={e => setParams(p => ({ ...p, [cle]: e.target.value }))}
      />
    </div>
  )
}

// Les copies de la base.
//
// Le serveur en écrit une toutes les six heures, sur le même volume que la
// base : contre la corruption et l'erreur humaine. Le bouton livre une copie
// fraîche à ranger ailleurs — le seul filet si le volume lui-même est perdu.
// C'est ici qu'on la cherche : l'onglet « Données » n'avait que l'effacement.
function Sauvegardes() {
  const [etat, setEtat] = useState(null)
  const [telechargement, setTelechargement] = useState(false)

  const charger = () => api.get('/admin/sauvegardes')
    .then(r => setEtat(r.data))
    .catch(() => setEtat({ fichiers: [], erreur: true }))
  useEffect(() => { charger() }, [])

  // Le lien direct ne porterait pas le jeton : on télécharge par l'API, puis
  // on tend le fichier au navigateur.
  const telecharger = async () => {
    setTelechargement(true)
    try {
      const r = await api.get('/admin/sauvegarde', { responseType: 'blob', timeout: 120000 })
      const nom = (r.headers['content-disposition'] || '').match(/filename="?([^"]+)"?/)?.[1]
        || `immo-${new Date().toISOString().slice(0, 10)}.db`
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = nom; a.click()
      URL.revokeObjectURL(url)
      toast.success(`Sauvegarde téléchargée : ${nom}`)
      charger()
    } catch (e) {
      toast.error(e.messageLisible || 'La sauvegarde a échoué')
    } finally { setTelechargement(false) }
  }

  const fichiers = etat?.fichiers || []
  const derniere = fichiers[0]
  const ancienne = derniere && (Date.now() - new Date(derniere.le).getTime()) > 7 * 3600 * 1000
  const quand = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const taille = (o) => o > 1e6 ? `${(o / 1e6).toFixed(1)} Mo` : `${Math.round(o / 1e3)} Ko`

  return (
    <div className="card mb-4">
      <div className="flex items-start gap-3">
        <Icon name="database" size="md" className="text-quai-gold flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-quai-navy">Sauvegardes de la base</h3>
          <p className="text-sm text-quai-muted">
            Le serveur en fait une toutes les six heures, sur son propre disque. Téléchargez-en une
            chaque soir et gardez-la ailleurs : c'est la seule protection si ce disque est perdu.
          </p>
        </div>
      </div>

      {etat === null && <p className="text-sm text-quai-muted mt-3">Chargement…</p>}
      {etat?.erreur && <p className="text-sm text-red-700 mt-3">Impossible de lire les sauvegardes.</p>}
      {etat && !etat.erreur && (
        <div className="mt-3">
          {!derniere ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Aucune sauvegarde automatique pour l’instant. La première arrive une minute après le démarrage du serveur.
            </p>
          ) : (
            <p className={`text-sm rounded-lg px-3 py-2 ${ancienne
              ? 'text-red-700 bg-red-50 border border-red-200'
              : 'text-emerald-800 bg-emerald-50 border border-emerald-200'}`}>
              Dernière copie automatique : <b>{quand(derniere.le)}</b> ({taille(derniere.octets)})
              {ancienne && ' — plus de sept heures : la sauvegarde automatique ne tourne plus, prévenir Loïck.'}
            </p>
          )}
          {fichiers.length > 1 && (
            <details className="mt-2 text-xs text-quai-muted">
              <summary className="cursor-pointer">{fichiers.length} copies sur le serveur</summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                {fichiers.map(f => <li key={f.nom}>{quand(f.le)} · {taille(f.octets)}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <button onClick={telecharger} disabled={telechargement}
        className="btn-primary mt-4 inline-flex items-center gap-2 min-h-[2.75rem]">
        <Icon name="file-down" size="sm" />
        {telechargement ? 'Préparation…' : 'Télécharger une sauvegarde maintenant'}
      </button>
    </div>
  )
}
