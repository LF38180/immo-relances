import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import Icon from '../components/ui/Icon'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ImportCahierModal from '../components/ImportCahierModal'

// Espace courtage (Marine) — totalement cloisonné : pas de Layout ni de nav agent.

export const STATUTS_COURTAGE = {
  a_qualifier:       { label: 'À qualifier',        color: 'bg-quai-light text-quai-muted border border-quai-border' },
  en_relance:        { label: 'En relance',         color: 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40' },
  simulation_faite:  { label: 'Simulation faite',   color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  dossier_en_cours:  { label: 'Dossier en cours',   color: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  gagne:             { label: 'Gagné',              color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  perdu:             { label: 'Perdu',              color: 'bg-red-50 text-red-700 border border-red-200' },
  injoignable:       { label: 'Injoignable',        color: 'bg-amber-50 text-amber-700 border border-amber-200' },
  ne_plus_contacter: { label: 'Ne plus contacter',  color: 'bg-quai-navy text-white' },
  faux_numero:       { label: 'Faux numéro',        color: 'bg-orange-50 text-orange-700 border border-orange-200' },
}

// Qualification d'origine du lead (colonne M du cahier des messages) affichee en carte.
export const CATEGORIES_COURTAGE = {
  manuel:      { label: 'CI Facile',                     color: 'bg-quai-navy text-white' },
  oui_agent:   { label: 'Intéressé courtage : OUI (agent)', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  oui_gabby:   { label: 'Intéressé courtage : OUI (Gabby)', color: 'bg-teal-50 text-teal-700 border border-teal-200' },
  a_qualifier: { label: 'À qualifier',                   color: 'bg-quai-light text-quai-muted border border-quai-border' },
}

const TYPES_ACTION = {
  creation: 'Création',
  relance: 'Relance',
  pas_de_reponse: 'Pas de réponse',
  trop_tot: 'Trop tôt',
  mail_propose: 'Mail proposé',
  statut: 'Changement de statut',
}

// Boutons de changement rapide de statut sur les cartes.
const STATUTS_RAPIDES = [
  ['faux_numero', 'Faux numéro'],
  ['simulation_faite', 'Simulation faite'],
  ['dossier_en_cours', 'Dossier en cours'],
  ['gagne', 'Gagné'],
  ['perdu', 'Perdu'],
  ['ne_plus_contacter', 'Ne plus contacter'],
]

// Date locale (pas UTC) au format YYYY-MM-DD, à J+n.
const plusJours = (n) => {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Affiche un numero francais par paires (06 12 34 56 78). Les numeros etrangers sont
// laisses tels quels. On part TOUJOURS du numero normalise (telephone_norm), pas du texte
// brut du cahier qui peut contenir "33...", des points ou des espaces incoherents.
const formatTel = (norm) => {
  if (!norm) return ''
  const d = String(norm)
  return /^0\d{9}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : d
}
// Nom de famille toujours en majuscules (le cahier melange "durand", "Durand", "DURAND").
const nomMaj = (n) => (n || '').toLocaleUpperCase('fr-FR')

const formatDateFr = (s) => s ? new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR') : ''
const formatDateHeureFr = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : ''

export default function CourtagePage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('relances')
  const [relances, setRelances] = useState([])
  const [tri, setTri] = useState('recent')   // 'recent' (defaut) | 'ancien' : sens sur la date du cahier
  const [qualification, setQualification] = useState('')  // '' | 'qualifie' | 'a_qualifier'
  const [boites, setBoites] = useState({ relancesPrevues: 0, mois: [] })
  const [boite, setBoite] = useState(null)   // null = ecran des boites ; sinon 'relances' | 'AAAA-MM'
  const [aMailer, setAMailer] = useState([])   // injoignables / sans numero, joignables par mail
  const [modele, setModele] = useState(null)          // { objet, corps, telephone }
  const [editModele, setEditModele] = useState(false)
  const [modeleForm, setModeleForm] = useState({ objet: '', corps: '', telephone: '' })
  const [modeleBusy, setModeleBusy] = useState(false)
  // Apercu : remplace les variables par les exemples renvoyes par le serveur.
  const apercuVariables = (texte) => (modele?.variables || [])
    .reduce((t, v) => t.split(v.cle).join(v.exemple), String(texte || ''))

  const corpsRef = useRef(null)
  const objetRef = useRef(null)
  const [dernierChamp, setDernierChamp] = useState('corps')  // ou l'insertion doit aller

  // Insere une variable a la position du curseur (corps ou objet selon le dernier champ actif).
  const insererVariable = (cle) => {
    const ref = dernierChamp === 'objet' ? objetRef : corpsRef
    const champ = dernierChamp === 'objet' ? 'objet' : 'corps'
    const el = ref.current
    if (!el) { setModeleForm(f => ({ ...f, [champ]: (f[champ] || '') + cle })); return }
    const debut = el.selectionStart ?? el.value.length
    const fin = el.selectionEnd ?? el.value.length
    const avant = el.value.slice(0, debut)
    const apres = el.value.slice(fin)
    const valeur = avant + cle + apres
    setModeleForm(f => ({ ...f, [champ]: valeur }))
    // Replace le curseur juste apres la variable inseree.
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(debut + cle.length, debut + cle.length) })
  }
  // Rappel entrant : recherche par telephone/nom pendant la session d'appel (comme Chrystelle).
  const [rappel, setRappel] = useState('')
  const [resultatsRappel, setResultatsRappel] = useState([])
  const [fiches, setFiches] = useState([])
  const [filtreStatut, setFiltreStatut] = useState('')
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNouvelle, setShowNouvelle] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [detailId, setDetailId] = useState(null)

  // Recherche debouncee du rappel entrant (min. 3 caracteres).
  useEffect(() => {
    const q = rappel.trim()
    if (q.length < 3) { setResultatsRappel([]); return }
    const t = setTimeout(() => {
      api.get(`/courtage/fiches?q=${encodeURIComponent(q)}`)
        .then(r => setResultatsRappel(r.data.slice(0, 8)))
        .catch(() => setResultatsRappel([]))
    }, 300)
    return () => clearTimeout(t)
  }, [rappel])

  const loadAMailer = useCallback(() => api.get('/courtage/fiches/a-mailer').then(r => setAMailer(r.data)).catch(() => {}), [])

  const loadModele = useCallback(() => api.get('/courtage/modele-mail')
    .then(r => { setModele(r.data); setModeleForm(r.data) }).catch(() => {}), [])

  const enregistrerModele = async () => {
    if (!modeleForm.objet.trim() || !modeleForm.corps.trim()) {
      toast.error('L\'objet et le corps sont obligatoires'); return
    }
    setModeleBusy(true)
    try {
      const { data } = await api.put('/courtage/modele-mail', modeleForm)
      setModele(data); setModeleForm(data); setEditModele(false)
      toast.success('Modèle de mail enregistré')
    } catch { toast.error('Erreur lors de l\'enregistrement') }
    finally { setModeleBusy(false) }
  }

  const loadBoites = useCallback(() => api.get('/courtage/fiches/boites')
    .then(r => setBoites(r.data)).catch(() => {}), [])

  const loadRelances = useCallback(() => api.get(`/courtage/fiches/relances-jour?tri=${tri}&qualification=${qualification}&boite=${boite || ''}`).then(r => setRelances(r.data)), [tri, qualification, boite])
  const loadFiches = useCallback(() => {
    const params = {}
    if (filtreStatut) params.statut = filtreStatut
    if (recherche.trim()) params.q = recherche.trim()
    return api.get('/courtage/fiches', { params }).then(r => setFiches(r.data))
  }, [filtreStatut, recherche])

  const refresh = useCallback(() => {
    Promise.all([loadRelances(), loadFiches(), loadAMailer(), loadBoites()]).catch(() => {})
  }, [loadRelances, loadFiches, loadAMailer, loadBoites])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadRelances(), loadFiches(), loadAMailer(), loadModele(), loadBoites()]).catch(() => {}).finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { loadFiches().catch(() => {}) }, 300)
    return () => clearTimeout(t)
  }, [loadFiches])

  // Recharge la file d'appel des que la boite, le tri ou le filtre changent.
  // Sans cet effet, l'ecran de boite s'ouvre mais la liste reste celle du chargement
  // initial : toutes les boites affichent les memes contacts.
  useEffect(() => { loadRelances().catch(() => {}) }, [loadRelances])

  const TABS = [
    ['relances', `Relances du jour (${relances.length})`, 'phone-call'],
    ['mails', `À contacter par mail (${aMailer.length})`, 'mail'],
    ['fiches', 'Fiches', 'users'],
    ['dashboard', 'Tableau de bord', 'layout-dashboard'],
  ]

  return (
    <div className="min-h-screen bg-quai-light flex flex-col">
      <header className="bg-quai-navy text-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-display font-semibold leading-tight">Courtage — Financement</div>
            <div className="text-xs text-quai-gold">{user?.prenom} {user?.nom}</div>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors">
            <Icon name="log-out" size="sm" /> Déconnexion
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-quai-border">
            <div className="flex flex-wrap">
              {TABS.map(([t, lbl, ic]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${tab === t ? 'border-quai-gold text-quai-navy' : 'border-transparent text-quai-muted hover:text-quai-navy'}`}>
                  <Icon name={ic} size="sm" /> {lbl}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
                <Icon name="file-up" size="sm" /> Importer le cahier
              </button>
              <button onClick={() => setShowNouvelle(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5">
                <Icon name="plus" size="sm" /> Nouvelle fiche
              </button>
            </div>
          </div>

          <div className="relative mb-4">
            <div className="flex items-center gap-2">
              <Icon name="search" size="sm" className="text-quai-muted" />
              <input
                className="input flex-1"
                placeholder="Rappel entrant ? Rechercher par numéro ou nom…"
                value={rappel}
                onChange={e => setRappel(e.target.value)}
              />
            </div>
            {resultatsRappel.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-quai-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {resultatsRappel.map(f => (
                  <button key={f.id} onClick={() => { setDetailId(f.id); setRappel(''); setResultatsRappel([]) }}
                    className="w-full text-left px-3 py-2 hover:bg-quai-light border-b border-quai-border last:border-0">
                    <div className="text-sm font-medium text-quai-navy">{nomMaj(f.nom)}{f.prenom ? ' ' + f.prenom : ''}</div>
                    <div className="text-xs text-quai-muted">
                      {formatTel(f.telephone_norm) || '—'}
                      {f.date_contact ? ' · cahier du ' + formatDateFr(f.date_contact) : ''}
                      {' · ' + ((STATUTS_COURTAGE[f.statut] || {}).label || f.statut)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {rappel.trim().length >= 3 && resultatsRappel.length === 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-quai-border rounded-lg shadow-lg px-3 py-2 text-sm text-quai-muted">
                Aucune fiche trouvée pour « {rappel.trim()} »
              </div>
            )}
          </div>

          {loading && <div className="text-center text-quai-muted animate-pulse py-12 text-sm">Chargement…</div>}

          {/* Ecran des boites : une par mois du cahier + celle des relances de Marine. */}
          {!loading && tab === 'relances' && !boite && (
            <div className="space-y-4">
              <div className="text-sm text-quai-muted">
                Choisissez la série de contacts à traiter.
              </div>

              <button onClick={() => setBoite('relances')}
                className="w-full text-left card border-2 border-quai-gold bg-quai-gold/10 hover:bg-quai-gold/20 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Icon name="calendar-clock" size="lg" className="text-quai-navy" />
                    <div>
                      <div className="font-display font-bold text-quai-navy">Mes relances prévues</div>
                      <div className="text-xs text-quai-muted">Contacts que vous avez déjà appelés ou planifiés</div>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-quai-navy">{boites.relancesPrevues}</div>
                </div>
              </button>

              <div className="text-xs font-semibold text-quai-muted uppercase tracking-wide pt-2">
                Cahier des messages — leads jamais appelés
              </div>
              {boites.mois.length === 0 && (
                <div className="text-sm text-quai-muted">Aucun lead en attente.</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {boites.mois.map(m => (
                  <button key={m.cle} onClick={() => setBoite(m.cle)}
                    className="text-left card hover:border-quai-gold hover:shadow-md transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-quai-navy capitalize">{m.libelle}</div>
                      <div className="text-2xl font-bold text-quai-navy">{m.total}</div>
                    </div>
                    <div className="text-xs text-quai-muted mt-0.5">contact{m.total > 1 ? 's' : ''} à appeler</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && tab === 'relances' && boite && (
            <div className="space-y-4">
              <button onClick={() => { setBoite(null); loadBoites() }}
                className="text-sm text-quai-muted hover:text-quai-navy inline-flex items-center gap-1.5">
                <Icon name="arrow-left" size="sm" /> Retour aux séries
              </button>
              <div className="font-display font-bold text-quai-navy text-lg">
                {boite === 'relances' ? 'Mes relances prévues'
                  : (boites.mois.find(m => m.cle === boite)?.libelle || boite)}
              </div>
              {(relances.length > 0 || qualification) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-quai-muted">{relances.length} fiche(s) à relancer</div>
                  <label className="inline-flex items-center gap-2 text-sm text-quai-muted">
                    Afficher
                    <select className="input w-auto text-sm" value={qualification} onChange={e => setQualification(e.target.value)} aria-label="Filtrer par qualification">
                      <option value="">Tous les leads</option>
                      <option value="qualifie">Qualifiés (OUI + CI Facile)</option>
                      <option value="a_qualifier">À qualifier</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-quai-muted">
                    Trier par date du cahier
                    <select className="input w-auto text-sm" value={tri} onChange={e => setTri(e.target.value)} aria-label="Trier les relances">
                      <option value="recent">Plus récent d'abord</option>
                      <option value="ancien">Plus ancien d'abord</option>
                    </select>
                  </label>
                </div>
              )}
              {relances.length === 0 && (
                <div className="text-center py-16">
                  <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-3" />
                  <div className="text-quai-navy font-medium">Aucune relance à faire aujourd'hui</div>
                  <div className="text-sm text-quai-muted mt-1">Tout est à jour.</div>
                </div>
              )}
              {relances.map(f => (
                <FicheCard key={f.id} fiche={f} onRefresh={refresh} onOpenDetail={setDetailId} montrerRelance={boite === 'relances'} />
              ))}
            </div>
          )}

          {!loading && tab === 'mails' && (
            <div className="space-y-4">
              <div className="card bg-quai-light/60">
                <div className="text-sm text-quai-navy">
                  Contacts joignables uniquement par mail : injoignables après 2 tentatives, sans numéro, ou numéro invalide.
                </div>
                <div className="text-xs text-quai-muted mt-1">
                  Un clic ouvre Outlook avec le message prérempli. Après envoi, la fiche sort de cette liste et une relance est programmée à J+7.
                </div>
                <button onClick={() => { setModeleForm(modele || { objet: '', corps: '', telephone: '' }); setEditModele(v => !v) }}
                  className="btn-secondary btn-sm inline-flex items-center gap-1.5 mt-3">
                  <Icon name="pencil" size="sm" /> {editModele ? 'Fermer' : 'Modifier le modèle de mail'}
                </button>

                {editModele && (
                  <div className="mt-3 border-t border-quai-border pt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-quai-muted mb-1">Objet</label>
                      <input ref={objetRef} className="input" value={modeleForm.objet}
                        onFocus={() => setDernierChamp('objet')}
                        onChange={e => setModeleForm(f => ({ ...f, objet: e.target.value }))} />
                    </div>

                    <div>
                      <div className="text-xs font-medium text-quai-muted mb-1">
                        Ajouter une variable <span className="font-normal">(insérée dans {dernierChamp === 'objet' ? "l'objet" : 'le message'}, à l&apos;endroit du curseur)</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(modele?.variables || []).map(v => (
                          <button key={v.cle} type="button" onClick={() => insererVariable(v.cle)}
                            title={`${v.cle} — exemple : ${v.exemple}`}
                            className="px-2 py-1 rounded border border-quai-border bg-white text-xs text-quai-navy hover:bg-quai-gold/20 hover:border-quai-gold transition-colors inline-flex items-center gap-1">
                            <Icon name="plus" size="sm" /> {v.libelle}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-quai-muted mb-1">Corps du message</label>
                      <textarea ref={corpsRef} className="input resize-y text-sm" rows={12} value={modeleForm.corps}
                        onFocus={() => setDernierChamp('corps')}
                        onChange={e => setModeleForm(f => ({ ...f, corps: e.target.value }))} />
                      <div className="text-xs text-quai-muted mt-1">
                        Message en texte simple (le format des liens mail ne permet pas le gras ni le souligné).
                        Votre <strong>signature Outlook</strong> — logo, couleurs, coordonnées — s'ajoute automatiquement à l'envoi :
                        configurez-la une fois dans Outlook, Fichier &gt; Options &gt; Courrier &gt; Signatures.
                      </div>
                    </div>

                    {modeleForm.corps && (
                      <div>
                        <div className="text-xs font-medium text-quai-muted mb-1">Aperçu avec un exemple de contact</div>
                        <div className="bg-white border border-quai-border rounded-lg p-3 text-sm text-quai-text whitespace-pre-wrap">
                          <div className="font-medium text-quai-navy mb-2 pb-2 border-b border-quai-border">
                            {apercuVariables(modeleForm.objet)}
                          </div>
                          {apercuVariables(modeleForm.corps)}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-quai-muted mb-1">Votre téléphone</label>
                      <input className="input max-w-xs" value={modeleForm.telephone}
                        onChange={e => setModeleForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 12 34 56 78" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={enregistrerModele} disabled={modeleBusy} className="btn-primary btn-sm">
                        {modeleBusy ? 'Enregistrement…' : 'Enregistrer le modèle'}
                      </button>
                      <button onClick={() => { setModeleForm(modele); setEditModele(false) }} className="btn-secondary btn-sm">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
              {aMailer.length === 0 && (
                <div className="text-center py-16">
                  <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-3" />
                  <div className="text-quai-navy font-medium">Aucun mail à envoyer</div>
                  <div className="text-sm text-quai-muted mt-1">Tout est à jour.</div>
                </div>
              )}
              {aMailer.map(f => (
                <FicheCard key={f.id} fiche={f} onRefresh={refresh} onOpenDetail={setDetailId} />
              ))}
            </div>
          )}

          {!loading && tab === 'fiches' && (
            <div>
              <div className="flex flex-wrap gap-3 mb-4">
                <select className="input w-auto text-sm" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} aria-label="Filtrer par statut">
                  <option value="">Tous les statuts</option>
                  {Object.entries(STATUTS_COURTAGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Icon name="search" size="sm" className="text-quai-muted" />
                  <input className="input flex-1" placeholder="Rechercher (nom, téléphone)…" value={recherche} onChange={e => setRecherche(e.target.value)} />
                </div>
              </div>
              <div className="space-y-4">
                {fiches.length === 0 && <div className="text-center text-quai-muted py-12 text-sm">Aucune fiche.</div>}
                {fiches.map(f => (
                  <FicheCard key={f.id} fiche={f} onRefresh={refresh} onOpenDetail={setDetailId} montrerRelance />
                ))}
              </div>
            </div>
          )}

          {!loading && tab === 'dashboard' && <DashboardCourtage />}
        </div>
      </div>

      {showNouvelle && <NouvelleFicheModal onClose={() => setShowNouvelle(false)} onCreated={() => { setShowNouvelle(false); refresh() }} />}
      {showImport && <ImportCahierModal onClose={() => setShowImport(false)} onImported={refresh} />}
      {detailId && <DetailFicheModal ficheId={detailId} onClose={() => setDetailId(null)} onSaved={refresh} />}
    </div>
  )
}

// ---------------------------------------------------------------- Carte fiche

function FicheCard({ fiche, onRefresh, onOpenDetail, montrerRelance = false }) {
  const [mode, setMode] = useState(null) // null | 'relance' | 'tropTotDate'
  const [commentaire, setCommentaire] = useState('')
  const [prochaine, setProchaine] = useState(plusJours(7))
  const [nouveauStatut, setNouveauStatut] = useState('')
  const [dateTropTot, setDateTropTot] = useState('')
  const [injoignable, setInjoignable] = useState(null) // { tentatives } après pas-de-reponse
  const [mailOuvert, setMailOuvert] = useState(false)  // Outlook ouvert, en attente de confirmation
  const [confirmNPC, setConfirmNPC] = useState(false)
  const [busy, setBusy] = useState(false)

  const statutInfo = STATUTS_COURTAGE[fiche.statut] || { label: fiche.statut, color: 'bg-quai-light text-quai-muted' }
  const categorieInfo = CATEGORIES_COURTAGE[fiche.categorie] || null
  const dernierCommentaire = fiche.dernier_commentaire || fiche.commentaire
  // Panneau mail : injoignable (2 tentatives), faux numero, ou aucun telephone —
  // dans tous ces cas l'appel est impossible et le mail est le seul canal restant.
  // Un numero exploitable = celui que le serveur a normalise (telephone_norm). Le champ
  // brut peut contenir "/" ou un fragment ("336") : appelable en apparence, pas en realite.
  const telAppelable = !!fiche.telephone_norm
  const estInjoignable = fiche.statut === 'injoignable' || !!injoignable
    || fiche.statut === 'faux_numero' || !telAppelable
  const raisonMail = injoignable || (fiche.statut === 'injoignable' && telAppelable)
    ? `Injoignable (${injoignable?.tentatives ?? fiche.tentatives_sans_reponse} tentatives)`
    : fiche.statut === 'faux_numero' ? 'Numéro invalide'
    : fiche.telephone && String(fiche.telephone).trim() ? 'Numéro inexploitable'
    : 'Pas de numéro de téléphone'
  const enRetard = fiche.prochaine_relance && fiche.prochaine_relance < plusJours(0)

  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    try { await fn() }
    catch (err) { toast.error(err.response?.data?.error || 'Erreur lors de l\'action') }
    finally { setBusy(false) }
  }

  const relanceFaite = () => run(async () => {
    if (!commentaire.trim()) { toast.error('Le commentaire est obligatoire'); return }
    const payload = { commentaire: commentaire.trim(), prochaine_relance: prochaine }
    if (nouveauStatut) payload.statut = nouveauStatut
    await api.post(`/courtage/fiches/${fiche.id}/relance`, payload)
    toast.success('Relance enregistrée')
    setMode(null); setCommentaire(''); setNouveauStatut(''); setProchaine(plusJours(7))
    onRefresh()
  })

  const tropTot = (date) => run(async () => {
    await api.post(`/courtage/fiches/${fiche.id}/trop-tot`, date ? { date } : {})
    toast.success(date ? `Relance décalée au ${formatDateFr(date)}` : 'Relance décalée de 7 jours')
    setMode(null); setDateTropTot('')
    onRefresh()
  })

  // Correction d'une qualification erronee de l'import (OUI Gabby vs OUI agent...).
  const changerCategorie = (cat) => run(async () => {
    await api.put(`/courtage/fiches/${fiche.id}/categorie`, { categorie: cat })
    toast.success('Qualification corrigée')
    setMode(null)
    onRefresh()
  })

  const pasDeReponse = (note) => run(async () => {
    const { data } = await api.post(`/courtage/fiches/${fiche.id}/pas-de-reponse`, { commentaire: note || '' })
    setMode(null); setCommentaire('')
    if (data.statut === 'injoignable') {
      setInjoignable({ tentatives: data.tentatives })
      toast(`Injoignable après ${data.tentatives} tentatives`)
    } else {
      toast.success(`Pas de réponse enregistré (tentative ${data.tentatives})`)
      onRefresh()
    }
  })

  const changerStatut = (statut) => run(async () => {
    await api.put(`/courtage/fiches/${fiche.id}/statut`, { statut })
    toast.success(`Statut : ${STATUTS_COURTAGE[statut]?.label || statut}`)
    setConfirmNPC(false)
    onRefresh()
  })

  // Etape 1 : ouvrir Outlook. On n'enregistre RIEN ici — un clic par erreur, ou un mail
  // finalement pas envoye, ne doit pas faire disparaitre la fiche de la liste.
  const preparerMail = () => run(async () => {
    const { data } = await api.get(`/courtage/mail-modele/${fiche.id}`)
    window.location.href = data.mailto
    setMailOuvert(true)
  })

  // Etape 2 : Marine confirme l'envoi -> la fiche sort de la liste, relance a J+7.
  const confirmerEnvoi = () => run(async () => {
    await api.post(`/courtage/fiches/${fiche.id}/mail-propose`)
    toast.success('Mail enregistré — relance dans 7 jours')
    setMailOuvert(false)
    setInjoignable(null)
    onRefresh()
  })

  return (
    <div className="card p-0 overflow-hidden">
      <button onClick={() => onOpenDetail(fiche.id)} className="w-full text-left px-4 pt-4 hover:bg-quai-light/60 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-lg font-display font-bold text-quai-navy">
              {nomMaj(fiche.nom)}{fiche.prenom ? ' ' + fiche.prenom : ''}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`badge ${statutInfo.color}`}>{statutInfo.label}</span>
              {categorieInfo && (
                <span role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setMode(mode === 'categorie' ? null : 'categorie') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setMode('categorie') } }}
                  title="Cliquer pour corriger la qualification"
                  className={`badge ${categorieInfo.color} cursor-pointer hover:opacity-80`}>
                  {categorieInfo.label}
                </span>
              )}
              {fiche.date_contact && (
                <span className="text-xs text-quai-muted inline-flex items-center gap-1">
                  <Icon name="calendar" size="sm" /> Cahier du {formatDateFr(fiche.date_contact)}
                </span>
              )}
              {/* Date de relance affichee UNIQUEMENT dans la boite "Mes relances prevues" :
                  ailleurs ce sont des leads bruts, c'est Marine qui fixera la date. */}
              {montrerRelance && fiche.prochaine_relance && (
                <span className={`text-xs ${enRetard ? 'text-red-600 font-medium' : 'text-quai-muted'}`}>
                  Relance prévue le {formatDateFr(fiche.prochaine_relance)}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-quai-muted inline-flex items-center gap-1"><Icon name="history" size="sm" /> Historique</span>
        </div>
      </button>

      <div className="px-4 pb-4">
        {telAppelable ? (
          <div className="bg-quai-navy rounded-xl p-4 my-3">
            <div className="text-xs text-quai-gold font-medium uppercase tracking-wider mb-1">Téléphone</div>
            <a href={`tel:${fiche.telephone_norm}`} className="text-2xl md:text-3xl font-bold text-white hover:text-quai-gold transition-colors inline-flex items-center gap-2">
              <Icon name="phone" size="lg" /> {formatTel(fiche.telephone_norm)}
            </a>
          </div>
        ) : (
          <div className="text-sm text-quai-muted my-3 italic">
            {fiche.telephone && String(fiche.telephone).trim()
              ? `Numéro inexploitable dans le cahier : « ${String(fiche.telephone).trim()} »`
              : 'Pas de téléphone renseigné'}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-quai-muted mb-2">
          {fiche.montant_projet && <span className="font-medium text-quai-navy">Projet : {fiche.montant_projet}</span>}
          {fiche.reference_bien && <span className="inline-flex items-center gap-1"><Icon name="tag" size="sm" /> {fiche.reference_bien}</span>}
          {fiche.mail && <span className="inline-flex items-center gap-1"><Icon name="mail" size="sm" /> {fiche.mail}</span>}
        </div>

        {/* Trace du dernier appel : ce que Marine a fait la derniere fois, avec la date.
            Visible meme sans commentaire (ex. un simple "pas de reponse"). */}
        {fiche.derniere_action && (
          <div className="flex items-center gap-2 text-xs text-quai-navy bg-quai-light rounded-lg px-3 py-2 mb-2">
            <Icon name="history" size="sm" className="text-quai-muted flex-shrink-0" />
            <span>
              <span className="font-medium">{TYPES_ACTION[fiche.derniere_action] || fiche.derniere_action}</span>
              {fiche.derniere_action_le && ' — ' + formatDateHeureFr(fiche.derniere_action_le)}
              {fiche.tentatives_sans_reponse > 0 && ` · ${fiche.tentatives_sans_reponse} tentative${fiche.tentatives_sans_reponse > 1 ? 's' : ''} sans réponse`}
            </span>
          </div>
        )}

        {dernierCommentaire && (
          <div className="bg-quai-gold/10 border border-quai-gold/30 rounded-lg p-2.5 text-sm text-quai-text mb-3 flex gap-2">
            <Icon name="pin" size="sm" className="text-quai-gold flex-shrink-0 mt-0.5" />
            <span className="min-w-0">{dernierCommentaire}</span>
          </div>
        )}

        {estInjoignable && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <div className="flex text-sm font-medium text-amber-800 mb-2 items-center gap-1.5">
              <Icon name="phone-off" size="sm" /> {raisonMail}
            </div>
            {!fiche.mail ? (
              <div className="text-xs text-amber-700 italic">Pas d'email renseigné</div>
            ) : mailOuvert ? (
              <div className="bg-white border border-quai-border rounded-lg p-3">
                <div className="text-sm text-quai-navy mb-1">Avez-vous envoyé le mail à {fiche.mail} ?</div>
                <div className="text-xs text-quai-muted mb-2">
                  Confirmez seulement après l&apos;envoi : la fiche quittera cette liste et sera relancée dans 7 jours.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={confirmerEnvoi} disabled={busy} className="btn-primary btn-sm inline-flex items-center gap-1.5">
                    <Icon name="check-circle-2" size="sm" /> Oui, mail envoyé
                  </button>
                  <button onClick={preparerMail} disabled={busy} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
                    <Icon name="refresh-cw" size="sm" /> Rouvrir le mail
                  </button>
                  <button onClick={() => setMailOuvert(false)} disabled={busy} className="btn-secondary btn-sm">
                    Pas encore
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={preparerMail} disabled={busy} className="btn-primary btn-sm inline-flex items-center gap-1.5">
                <Icon name="mail" size="sm" /> Préparer le mail
              </button>
            )}
          </div>
        )}

        {mode === 'relance' && (
          <div className="border border-quai-border rounded-lg p-3 mb-3 bg-quai-light/60 space-y-3">
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Commentaire <span className="text-red-500">*</span></label>
              <textarea className="input resize-none" rows={2} value={commentaire} autoFocus
                placeholder="Ce qui s'est dit pendant l'appel…" onChange={e => setCommentaire(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-quai-muted mb-1">Prochaine relance</label>
                <input type="date" className="input w-auto" value={prochaine} onChange={e => setProchaine(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-quai-muted mb-1">Changer le statut (optionnel)</label>
                <select className="input w-auto" value={nouveauStatut} onChange={e => setNouveauStatut(e.target.value)}>
                  <option value="">Statut inchangé</option>
                  {Object.entries(STATUTS_COURTAGE).filter(([k]) => k !== 'ne_plus_contacter').map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={relanceFaite} disabled={busy} className="btn-primary btn-sm">Enregistrer la relance</button>
              <button onClick={() => setMode(null)} className="btn-secondary btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {mode === 'categorie' && (
          <div className="border border-quai-border rounded-lg p-3 mb-3 bg-quai-light/60">
            <div className="text-xs font-medium text-quai-muted mb-2">
              Corriger la qualification <span className="font-normal">(l&apos;ordre dans la file suivra)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORIES_COURTAGE).map(([cle, info]) => (
                <button key={cle} onClick={() => changerCategorie(cle)} disabled={busy || cle === fiche.categorie}
                  className={`badge ${info.color} ${cle === fiche.categorie ? 'opacity-40 cursor-default' : 'cursor-pointer hover:opacity-80'}`}>
                  {info.label}{cle === fiche.categorie ? ' (actuelle)' : ''}
                </button>
              ))}
              <button onClick={() => setMode(null)} className="btn-secondary btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {mode === 'pasDeReponse' && (
          <div className="border border-quai-border rounded-lg p-3 mb-3 bg-quai-light/60 space-y-2">
            <label className="block text-xs font-medium text-quai-muted">
              Commentaire <span className="font-normal">(facultatif — répondeur, rappelle ce soir…)</span>
            </label>
            <input className="input" value={commentaire} autoFocus
              onChange={e => setCommentaire(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') pasDeReponse(commentaire) }} />
            <div className="flex gap-2">
              <button onClick={() => pasDeReponse(commentaire)} disabled={busy} className="btn-primary btn-sm">
                Enregistrer l&apos;appel sans réponse
              </button>
              <button onClick={() => { setMode(null); setCommentaire('') }} className="btn-secondary btn-sm">Annuler</button>
            </div>
          </div>
        )}

        {mode === 'tropTotDate' && (
          <div className="border border-quai-border rounded-lg p-3 mb-3 bg-quai-light/60 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Relancer le</label>
              <input type="date" className="input w-auto" value={dateTropTot} onChange={e => setDateTropTot(e.target.value)} />
            </div>
            <button onClick={() => dateTropTot ? tropTot(dateTropTot) : toast.error('Choisissez une date')} disabled={busy} className="btn-primary btn-sm">Valider</button>
            <button onClick={() => { setMode(null); setDateTropTot('') }} className="btn-secondary btn-sm">Annuler</button>
          </div>
        )}

        {mode === null && (
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setMode('relance')} disabled={busy} className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <Icon name="phone-call" size="sm" /> Relance faite
            </button>
            <span className="inline-flex items-center gap-1">
              <button onClick={() => tropTot()} disabled={busy} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
                <Icon name="calendar-clock" size="sm" /> Trop tôt (+7 j)
              </button>
              <button onClick={() => setMode('tropTotDate')} className="text-xs text-quai-muted hover:text-quai-navy underline">choisir une date</button>
            </span>
            <button onClick={() => setMode('pasDeReponse')} disabled={busy} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
              <Icon name="phone-off" size="sm" /> Pas de réponse
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-quai-border">
          {STATUTS_RAPIDES.map(([k, lbl]) => (
            <button key={k}
              onClick={() => k === 'ne_plus_contacter' ? setConfirmNPC(true) : changerStatut(k)}
              disabled={busy || fiche.statut === k}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 ${
                k === 'ne_plus_contacter'
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : fiche.statut === k
                    ? 'border-quai-gold bg-quai-gold/10 text-quai-navy'
                    : 'border-quai-border text-quai-muted hover:border-quai-navy/40 hover:text-quai-navy'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {confirmNPC && (
        <ConfirmDialog
          title="Ne plus contacter"
          message="Ce contact sera mis en liste noire définitivement. Confirmer ?"
          confirmLabel="Ne plus contacter"
          onConfirm={() => changerStatut('ne_plus_contacter')}
          onCancel={() => setConfirmNPC(false)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------- Détail / historique

function DetailFicheModal({ ficheId, onClose, onSaved }) {
  const [fiche, setFiche] = useState(null)
  // Saisie d'appel depuis la fiche : sert notamment au rappel entrant (Marine cherche
  // le numero, ouvre la fiche et note l'echange sans repasser par la file).
  const [commentaire, setCommentaire] = useState('')
  const [prochaine, setProchaine] = useState(plusJours(7))
  const [nouveauStatut, setNouveauStatut] = useState('')
  const [busy, setBusy] = useState(false)

  const charger = () => api.get(`/courtage/fiches/${ficheId}`).then(r => setFiche(r.data))

  useEffect(() => {
    charger().catch(() => {
      toast.error('Fiche introuvable')
      onClose()
    })
  }, [ficheId]) // eslint-disable-line react-hooks/exhaustive-deps

  const enregistrerAppel = async () => {
    if (!commentaire.trim()) { toast.error('Le commentaire est requis'); return }
    setBusy(true)
    try {
      await api.post(`/courtage/fiches/${ficheId}/relance`, {
        commentaire: commentaire.trim(),
        prochaine_relance: prochaine,
        ...(nouveauStatut ? { statut: nouveauStatut } : {}),
      })
      toast.success('Appel enregistré')
      setCommentaire(''); setNouveauStatut('')
      await charger()
      if (onSaved) onSaved()
    } catch { toast.error('Erreur lors de l\'enregistrement') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={fiche ? `${nomMaj(fiche.nom)}${fiche.prenom ? ' ' + fiche.prenom : ''}` : 'Fiche'} onClose={onClose}>
      {!fiche && <div className="text-center text-quai-muted animate-pulse py-8 text-sm">Chargement…</div>}
      {fiche && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${(STATUTS_COURTAGE[fiche.statut] || {}).color || ''}`}>{(STATUTS_COURTAGE[fiche.statut] || {}).label || fiche.statut}</span>
            {fiche.prochaine_relance && <span className="text-xs text-quai-muted">Prochaine relance : {formatDateFr(fiche.prochaine_relance)}</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {fiche.telephone && <div><span className="text-quai-muted">Téléphone : </span><a className="font-medium text-quai-navy" href={`tel:${fiche.telephone}`}>{fiche.telephone}</a></div>}
            {fiche.mail && <div><span className="text-quai-muted">Email : </span><span className="font-medium text-quai-navy">{fiche.mail}</span></div>}
            {fiche.montant_projet && <div><span className="text-quai-muted">Montant du projet : </span><span className="font-medium text-quai-navy">{fiche.montant_projet}</span></div>}
            {fiche.reference_bien && <div><span className="text-quai-muted">Référence bien : </span><span className="font-medium text-quai-navy">{fiche.reference_bien}</span></div>}
            {fiche.date_contact && <div><span className="text-quai-muted">Date de la simulation : </span><span className="font-medium text-quai-navy">{formatDateFr(fiche.date_contact)}</span></div>}
            {fiche.source && <div><span className="text-quai-muted">Source : </span><span className="font-medium text-quai-navy">{fiche.source}</span></div>}
          </div>

          <div className="border border-quai-gold/40 bg-quai-gold/10 rounded-lg p-3 space-y-2">
            <div className="text-sm font-semibold text-quai-navy">Noter cet appel</div>
            <textarea className="input resize-none" rows={2} placeholder="Ce qui s'est dit…"
              value={commentaire} onChange={e => setCommentaire(e.target.value)} />
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-quai-muted mb-1">Prochaine relance</label>
                <input type="date" className="input w-auto text-sm" value={prochaine} onChange={e => setProchaine(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-quai-muted mb-1">Statut (facultatif)</label>
                <select className="input w-auto text-sm" value={nouveauStatut} onChange={e => setNouveauStatut(e.target.value)}>
                  <option value="">Inchangé</option>
                  {Object.entries(STATUTS_COURTAGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <button onClick={enregistrerAppel} disabled={busy} className="btn-primary btn-sm">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {fiche.demandes?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-quai-navy uppercase tracking-wider mb-2">Demandes</h3>
              <div className="space-y-1">
                {fiche.demandes.map(d => (
                  <div key={d.id} className="text-sm text-quai-text flex items-center gap-2">
                    <Icon name="tag" size="sm" className="text-quai-muted" />
                    {d.reference_bien || 'Bien non précisé'}
                    {d.date_demande && <span className="text-xs text-quai-muted">— {formatDateFr(d.date_demande)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-quai-navy uppercase tracking-wider mb-2">Historique</h3>
            <div className="space-y-2">
              {fiche.actions?.length === 0 && <div className="text-sm text-quai-muted">Aucune action.</div>}
              {fiche.actions?.map(a => (
                <div key={a.id} className="border border-quai-border rounded-lg p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-quai-navy">{TYPES_ACTION[a.type] || a.type}</span>
                    <span className="text-xs text-quai-muted">{formatDateHeureFr(a.created_at)}</span>
                    {a.type === 'statut' && a.statut_apres && (
                      <span className="text-xs text-quai-muted">
                        {(STATUTS_COURTAGE[a.statut_avant] || {}).label || a.statut_avant || '—'} → {(STATUTS_COURTAGE[a.statut_apres] || {}).label || a.statut_apres}
                      </span>
                    )}
                    {a.prochaine_relance && <span className="text-xs text-quai-muted">Relance prévue : {formatDateFr(a.prochaine_relance)}</span>}
                  </div>
                  {a.commentaire && <div className="text-quai-text mt-1">{a.commentaire}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------- Nouvelle fiche

function NouvelleFicheModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', mail: '', date_contact: '',
    montant_projet: '', reference_bien: '', commentaire: '', prochaine_relance: plusJours(7),
  })
  const [submitting, setSubmitting] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return }
    if (submitting) return
    setSubmitting(true)
    try {
      const payload = {}
      Object.entries(form).forEach(([k, v]) => { if (String(v).trim()) payload[k] = String(v).trim() })
      await api.post('/courtage/fiches', payload)
      toast.success('Fiche créée')
      onCreated()
    } catch (err) {
      if (err.response?.status === 409) toast.error('Ce contact est en liste noire (ne plus contacter)')
      else toast.error(err.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setSubmitting(false)
    }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit() } }

  return (
    <Modal title="Nouvelle fiche" onClose={onClose} size="md"
      footer={(
        <>
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={submit} disabled={submitting} className="btn-primary">{submitting ? 'Création…' : 'Créer la fiche'}</button>
        </>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={onKeyDown}>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Nom <span className="text-red-500">*</span></label>
          <input className="input" value={form.nom} onChange={set('nom')} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Prénom</label>
          <input className="input" value={form.prenom} onChange={set('prenom')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Téléphone</label>
          <input className="input" type="tel" value={form.telephone} onChange={set('telephone')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Email</label>
          <input className="input" type="email" value={form.mail} onChange={set('mail')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Date de la simulation</label>
          <input className="input" type="date" value={form.date_contact} onChange={set('date_contact')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Montant du projet</label>
          <input className="input" value={form.montant_projet} onChange={set('montant_projet')} placeholder="ex. 250 000 EUR" />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Référence bien</label>
          <input className="input" value={form.reference_bien} onChange={set('reference_bien')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Prochaine relance (défaut J+7)</label>
          <input className="input" type="date" value={form.prochaine_relance} onChange={set('prochaine_relance')} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-quai-muted mb-1">Commentaire</label>
          <textarea className="input resize-none" rows={2} value={form.commentaire} onChange={set('commentaire')} />
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------- Tableau de bord

function DashboardCourtage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/courtage/dashboard')
      .then(r => setData(r.data))
      .catch(() => toast.error('Erreur de chargement du tableau de bord'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center text-quai-muted animate-pulse py-12 text-sm">Chargement…</div>
  if (!data) return null

  return <DashboardCourtageContenu data={data} />
}

// Contenu réutilisé tel quel par la Supervision (lecture seule côté admin/manager).
export function DashboardCourtageContenu({ data }) {
  const totalStatuts = data.parStatut.reduce((s, x) => s + x.cnt, 0)

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <TuileCourtage label="Relances cette semaine" value={data.relancesSemaine} icon="phone-call" variant="navy" />
        <TuileCourtage label="À relancer aujourd'hui" value={data.aRelancerAujourdhui} icon="bell" variant="gold" />
        <TuileCourtage label="Simulations" value={data.simulations} icon="file-check" variant="light" />
        <TuileCourtage label="Dossiers en cours" value={data.dossiers} icon="trophy" variant="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Répartition par statut</h2>
          {data.parStatut.length === 0 && <div className="text-sm text-quai-muted py-6 text-center">Aucune fiche pour le moment.</div>}
          <div className="space-y-2">
            {data.parStatut.map(s => {
              const info = STATUTS_COURTAGE[s.statut] || { label: s.statut, color: 'bg-quai-light text-quai-muted' }
              return (
                <div key={s.statut} className="flex items-center gap-3">
                  <span className={`badge ${info.color} w-36 justify-center`}>{info.label}</span>
                  <div className="flex-1 bg-quai-border rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-quai-navy rounded-full"
                      style={{ width: `${totalStatuts ? Math.min(100, (s.cnt / totalStatuts) * 100) : 0}%` }} />
                  </div>
                  <div className="w-10 text-sm text-right font-medium text-quai-navy">{s.cnt}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-quai-navy mb-4 text-sm uppercase tracking-wider">Taux de transformation</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-quai-light rounded-xl border border-quai-border">
              <div className="text-3xl font-bold text-quai-navy">{data.tauxOuiSimulation}%</div>
              <div className="text-xs text-quai-muted mt-1">Contacts → simulation</div>
            </div>
            <div className="text-center p-4 bg-quai-light rounded-xl border border-quai-border">
              <div className="text-3xl font-bold text-quai-navy">{data.tauxSimulationDossier}%</div>
              <div className="text-xs text-quai-muted mt-1">Simulation → dossier</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TuileCourtage({ label, value, icon, variant }) {
  const styles = {
    navy:    'bg-quai-navy text-white',
    gold:    'bg-quai-gold text-quai-navy',
    light:   'bg-white border border-quai-border text-quai-navy',
    success: 'bg-emerald-600 text-white',
  }
  return (
    <div className={`rounded-xl p-5 flex items-center gap-4 ${styles[variant]}`}>
      <Icon name={icon} size="xl" className="opacity-80" />
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs opacity-70 mt-0.5">{label}</div>
      </div>
    </div>
  )
}
