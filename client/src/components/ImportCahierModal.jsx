import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import Modal from './ui/Modal'
import Icon from './ui/Icon'

// Import du cahier des messages (.xlsx multi-onglets) — Marine et admin.
// Le fichier est lu et filtré côté client ; seules les lignes utiles sont
// envoyées au serveur, par lots (le fichier réel fait ~6 000 lignes utiles).

const TAILLE_LOT = 500          // lignes par appel POST /courtage/import
const PREMIERE_LIGNE = 2        // index 0-based : ligne 1 = en-têtes, ligne 2 = sous-en-têtes
const COL_DATE = 0
const COL_NOM = 5

const nonVide = (v) => v !== null && v !== undefined && String(v).trim() !== ''

// Lit toutes les feuilles et ne garde que les lignes ayant une DATE ou un NOM.
async function lireCahier(file) {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Lecture impossible : ' + file.name))
    reader.readAsArrayBuffer(file)
  })

  let wb
  try {
    const XLSX = await import('xlsx')
    wb = { XLSX, book: XLSX.read(buffer, { type: 'array' }) }
  } catch {
    throw new Error('Fichier illisible — vérifiez qu\'il s\'agit bien d\'un classeur Excel (.xlsx)')
  }

  const { XLSX, book } = wb
  const lignes = []
  let brutes = 0
  const onglets = []

  for (const nomOnglet of book.SheetNames) {
    const ws = book.Sheets[nomOnglet]
    if (!ws) continue
    const grille = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
    brutes += Math.max(0, grille.length - PREMIERE_LIGNE)
    let utilesOnglet = 0
    for (let i = PREMIERE_LIGNE; i < grille.length; i++) {
      const valeurs = grille[i]
      if (!Array.isArray(valeurs)) continue
      if (!nonVide(valeurs[COL_DATE]) && !nonVide(valeurs[COL_NOM])) continue
      lignes.push({ onglet: nomOnglet, ligne: i + 1, valeurs })
      utilesOnglet++
    }
    onglets.push({ nom: nomOnglet, lignes: utilesOnglet })
  }

  if (onglets.length === 0) throw new Error('Aucun onglet dans ce fichier')
  return { lignes, brutes, onglets }
}

// Additionne les bilans renvoyés par chaque lot.
function cumuler(a, b) {
  const somme = { ...a }
  for (const k of ['lignes_lues', 'creees', 'doublons', 'exclues', 'blacklistees', 'ignorees', 'deja_importees']) {
    somme[k] = (a[k] || 0) + (b[k] || 0)
  }
  somme.parCategorie = { ...(a.parCategorie || {}) }
  for (const [k, v] of Object.entries(b.parCategorie || {})) {
    somme.parCategorie[k] = (somme.parCategorie[k] || 0) + v
  }
  return somme
}

const BILAN_VIDE = {
  lignes_lues: 0, creees: 0, doublons: 0, exclues: 0,
  blacklistees: 0, ignorees: 0, deja_importees: 0,
  parCategorie: { oui_agent: 0, oui_gabby: 0, a_qualifier: 0 },
}

export default function ImportCahierModal({ onClose, onImported }) {
  const [fichier, setFichier] = useState(null)      // { nom, lignes, brutes, onglets }
  const [simulation, setSimulation] = useState(true)
  const [encours, setEncours] = useState(false)
  const [progression, setProgression] = useState(null) // { lot, total }
  const [rapport, setRapport] = useState(null)      // { simulation, ...bilan }
  const [erreur, setErreur] = useState(null)
  const [survol, setSurvol] = useState(false)
  const fileRef = useRef()

  const choisirFichier = async (file) => {
    if (!file) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) {
      setErreur('Format non supporté : déposez un fichier .xlsx ou .xls')
      return
    }
    setErreur(null); setRapport(null); setFichier(null)
    try {
      const { lignes, brutes, onglets } = await lireCahier(file)
      if (lignes.length === 0) {
        setErreur('Aucune ligne exploitable (aucune date ni nom trouvés à partir de la ligne 3)')
        return
      }
      setFichier({ nom: file.name, lignes, brutes, onglets })
    } catch (e) {
      setErreur(e.message || 'Fichier illisible')
    }
  }

  const lancer = async (enSimulation) => {
    if (!fichier || encours) return
    setEncours(true); setErreur(null); setRapport(null)
    const lots = []
    for (let i = 0; i < fichier.lignes.length; i += TAILLE_LOT) {
      lots.push(fichier.lignes.slice(i, i + TAILLE_LOT))
    }
    let cumul = { ...BILAN_VIDE }
    // Identifiant de session : permet au serveur de conserver l'etat de dedoublonnage
    // entre les lots d'une meme simulation (un contact present dans deux mois ne doit
    // pas etre compte "cree" deux fois dans le rapport).
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    try {
      for (let i = 0; i < lots.length; i++) {
        setProgression({ lot: i + 1, total: lots.length })
        const { data } = await api.post('/courtage/import', {
          fichier: fichier.nom,
          simulation: enSimulation,
          session_id: sessionId,
          lignes: lots[i],
        })
        cumul = cumuler(cumul, data)
      }
      setRapport({ simulation: enSimulation, ...cumul })
      if (enSimulation) {
        toast.success('Simulation terminée — rien n\'a été enregistré')
      } else {
        toast.success(`Import terminé — ${cumul.creees} fiche(s) créée(s)`)
        onImported?.()
      }
    } catch (e) {
      setErreur(e.response?.data?.error || 'Le serveur a refusé l\'import. Réessayez.')
    } finally {
      setEncours(false)
      setProgression(null)
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-secondary">Fermer</button>
      <div className="flex gap-2">
        {rapport?.simulation && (
          <button onClick={() => lancer(false)} disabled={encours} className="btn-primary inline-flex items-center gap-1.5">
            <Icon name="upload" size="sm" /> Lancer l'import réel
          </button>
        )}
        {fichier && !rapport && (
          <button onClick={() => lancer(simulation)} disabled={encours} className="btn-primary inline-flex items-center gap-1.5">
            <Icon name="upload" size="sm" />
            {encours ? 'Traitement…' : simulation ? 'Lancer la simulation' : 'Lancer l\'import'}
          </button>
        )}
      </div>
    </>
  )

  return (
    <Modal title="Importer le cahier des messages" onClose={onClose} footer={footer}>
      {erreur && (
        <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <Icon name="alert-triangle" size="sm" className="flex-shrink-0 mt-0.5" />
          <span>{erreur}</span>
        </div>
      )}

      {!fichier && !rapport && (
        <div
          onDragOver={e => { e.preventDefault(); setSurvol(true) }}
          onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); setSurvol(false); choisirFichier(e.dataTransfer.files?.[0]) }}
          className={`text-center py-10 px-4 rounded-xl border-2 border-dashed transition-colors ${survol ? 'border-quai-gold bg-quai-gold/10' : 'border-quai-border bg-quai-light/60'}`}
        >
          <Icon name="file-up" size="xl" className="text-quai-navy mx-auto mb-4" />
          <h3 className="text-lg font-display font-medium text-quai-navy mb-1">Déposez le cahier des messages</h3>
          <p className="text-sm text-quai-muted mb-4">
            Export du Google Sheet au format Excel. Tous les onglets sont lus, à partir de la ligne 3.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {['.xlsx', '.xls'].map(f => (
              <span key={f} className="badge bg-quai-navy/10 text-quai-navy border border-quai-navy/20 text-xs font-mono">{f}</span>
            ))}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => choisirFichier(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} className="btn-primary">Choisir un fichier</button>
        </div>
      )}

      {fichier && !rapport && (
        <div className="space-y-4">
          <div className="rounded-lg bg-quai-navy/5 p-3 text-sm text-quai-navy flex items-start gap-2">
            <Icon name="file-check" size="sm" className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{fichier.nom}</div>
              <div className="text-quai-muted text-xs mt-0.5">
                {fichier.onglets.length} onglet(s) — {fichier.lignes.length.toLocaleString('fr')} ligne(s) exploitable(s)
                {' '}sur {fichier.brutes.toLocaleString('fr')} lue(s).
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-quai-muted mb-2">Détail par onglet</div>
            <div className="flex flex-wrap gap-1.5">
              {fichier.onglets.map(o => (
                <span key={o.nom} className="badge bg-quai-light text-quai-muted border border-quai-border text-xs">
                  {o.nom} : {o.lignes.toLocaleString('fr')}
                </span>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-quai-gold/40 bg-quai-gold/10 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={simulation} onChange={e => setSimulation(e.target.checked)} />
            <span className="text-sm text-quai-text">
              <span className="font-medium text-quai-navy">Simuler sans enregistrer</span>
              <span className="block text-xs text-quai-muted mt-0.5">
                Recommandé : affiche le rapport complet sans créer aucune fiche.
              </span>
            </span>
          </label>

          <p className="text-xs text-quai-muted">
            L'envoi se fait par lots de {TAILLE_LOT} lignes
            {' '}({Math.ceil(fichier.lignes.length / TAILLE_LOT)} lot(s)).
          </p>

          {encours && progression && (
            <div>
              <div className="flex justify-between text-xs text-quai-muted mb-1">
                <span>Lot {progression.lot}/{progression.total}</span>
                <span>{Math.round((progression.lot / progression.total) * 100)} %</span>
              </div>
              <div className="h-2 bg-quai-border rounded-full overflow-hidden">
                <div className="h-full bg-quai-navy rounded-full transition-all"
                  style={{ width: `${(progression.lot / progression.total) * 100}%` }} />
              </div>
            </div>
          )}

          <button onClick={() => { setFichier(null); setErreur(null) }} disabled={encours}
            className="text-xs text-quai-muted hover:text-quai-navy underline">
            Choisir un autre fichier
          </button>
        </div>
      )}

      {rapport && <RapportImport rapport={rapport} />}
    </Modal>
  )
}

function RapportImport({ rapport }) {
  const cat = rapport.parCategorie || {}
  const lignes = [
    ['Lignes lues', rapport.lignes_lues],
    ['Fiches créées', rapport.creees],
    ['Doublons fusionnés', rapport.doublons],
    ['Exclues (agents location)', rapport.exclues],
    ['Mises en liste noire', rapport.blacklistees],
    ['Ignorées (sans qualification)', rapport.ignorees],
    ['Déjà importées', rapport.deja_importees],
  ]

  return (
    <div className="space-y-4">
      {rapport.simulation ? (
        <div className="flex gap-2 rounded-lg border border-quai-gold/40 bg-quai-gold/10 p-3 text-sm text-quai-navy">
          <Icon name="alert-triangle" size="sm" className="flex-shrink-0 mt-0.5 text-quai-gold" />
          <span><span className="font-medium">Simulation — rien n'a été enregistré.</span> Vérifiez les chiffres ci-dessous, puis lancez l'import réel.</span>
        </div>
      ) : (
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Icon name="check-circle-2" size="sm" className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">Import terminé — les fiches ont été enregistrées.</span>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-quai-border">
            {lignes.map(([label, valeur]) => (
              <tr key={label}>
                <td className="px-4 py-2 text-quai-muted">{label}</td>
                <td className="px-4 py-2 text-right font-medium text-quai-navy">{(valeur || 0).toLocaleString('fr')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs font-medium text-quai-muted mb-2">Détail des fiches créées</div>
        <div className="grid grid-cols-3 gap-3">
          {[['OUI agent', cat.oui_agent], ['OUI Gabby', cat.oui_gabby], ['À qualifier', cat.a_qualifier]].map(([l, v]) => (
            <div key={l} className="card text-center">
              <div className="text-2xl font-bold text-quai-navy">{(v || 0).toLocaleString('fr')}</div>
              <div className="text-xs text-quai-muted mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
