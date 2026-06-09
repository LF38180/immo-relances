import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES } from '../utils/constants'
import Modal from './ui/Modal'
import Icon from './ui/Icon'
import { detecterFormat, bienVersContact, categorieModelo, nettoyerNomContact, extraireCivilite } from '../utils/modelo-import'
import { useAuth } from '../hooks/useAuth'

const FIELD_MAP = {
  nom: ['nom', 'name', 'last_name', 'lastname', 'surname'],
  prenom: ['prenom', 'prénom', 'first_name', 'firstname'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable', 'tél. port.', 'tel. port.', 'tél port'],
  telephone2: ['telephone2', 'tel2', 'mobile2', 'tél. fixe', 'tel. fixe', 'tél fixe', 'fixe'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  adresse: ['adresse', 'address', 'rue', 'street'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code', 'code postal'],
  ville: ['ville', 'city', 'localite', 'commune'],
  categorie: ['categorie', 'catégorie', 'category', 'type'],
  notes: ['notes', 'note', 'commentaire', 'remarque', 'observation', 'observations'],
  potentiel: ['potentiel', 'score', 'note_contact'],
  source: ['source', 'origine', 'provenance'],
  conseiller: ['conseiller', 'agent', 'négociateur', 'negociateur', 'responsable', 'assigné', 'assigne', 'suivi par'],
  date_estimation: ['date estimation', 'date création', 'date creation', 'date', 'créé le', 'cree le', 'création', 'creation'],
  photo_url: ['photo', 'image', 'url photo', 'lien photo', 'photo_url', 'photo principale'],
  civilite: ['civilite', 'civilité', 'titre', 'qualite', 'qualité'],
}

const FIELD_LABELS = {
  nom: 'Nom', prenom: 'Prénom', telephone: 'Téléphone', telephone2: 'Téléphone 2',
  email: 'Email', adresse: 'Adresse', code_postal: 'Code postal', ville: 'Ville',
  categorie: 'Catégorie', notes: 'Notes', potentiel: 'Potentiel',
  source: 'Source', conseiller: 'Conseiller en charge', date_estimation: "Date d'estimation",
  photo_url: 'Photo (URL)', civilite: 'Civilité',
}

function guessMapping(headers) {
  const map = {}
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    Object.entries(FIELD_MAP).forEach(([field, aliases]) => {
      if (!map[field] && aliases.some(a => hl === a)) map[field] = h
    })
  })
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    Object.entries(FIELD_MAP).forEach(([field, aliases]) => {
      if (!map[field] && aliases.some(a => hl.includes(a))) map[field] = h
    })
  })
  return map
}

export default function ImportModal({ onClose, onImported }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultCategorie, setDefaultCategorie] = useState('prospect_froid')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [formatDetecte, setFormatDetecte] = useState('contact')
  const [users, setUsers] = useState([])
  const [assigneA, setAssigneA] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      api.get('/admin/users').then(r => { setUsers(r.data); setAssigneA(String(user.id)) }).catch(() => {})
    }
  }, [])

  const appliquerDonnees = (hdrs, data) => {
    const format = detecterFormat(hdrs)
    if (format === 'bien') {
      const contacts = data.map(bienVersContact)
      setRows(contacts)
      setHeaders(Object.keys(contacts[0] || {}))
      const idMap = {}
      Object.keys(contacts[0] || {}).forEach(k => { idMap[k] = k })
      setMapping(idMap)
      setFormatDetecte('bien')
    } else {
      setHeaders(hdrs)
      setRows(data)
      setMapping(guessMapping(hdrs))
      setFormatDetecte('contact')
    }
    setStep(2)
  }

  const handleFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      // Lecture CSV
      Papa.parse(file, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        delimitersToGuess: [';', ',', '\t', '|'],
        complete: (res) => {
          appliquerDonnees(res.meta.fields || [], res.data)
        },
        error: () => toast.error('Erreur de lecture du fichier CSV')
      })
    } else if (['xlsx', 'xls', 'ods', 'numbers'].includes(ext)) {
      // Lecture Excel / tableur
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          // Charge xlsx à la demande (lib lourde, ~400K) — pas dans le bundle initial.
          const XLSX = await import('xlsx')
          const workbook = XLSX.read(e.target.result, { type: 'array' })
          // Prendre le premier onglet
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          if (data.length === 0) { toast.error('Feuille vide'); return }
          const hdrs = Object.keys(data[0])
          appliquerDonnees(hdrs, data)
        } catch {
          toast.error('Erreur de lecture du fichier tableur')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error('Format non supporté. Utilisez CSV, Excel (.xlsx/.xls) ou ODS.')
    }
  }

  const doImport = async () => {
    setImporting(true)
    const contacts = rows.map(row => {
      const c = { categorie: defaultCategorie }
      Object.entries(mapping).forEach(([field, col]) => {
        if (col) c[field] = row[col]
      })
      if (c.categorie && formatDetecte === 'contact' && c.categorie !== defaultCategorie) {
        c.categorie = categorieModelo(c.categorie)
      }
      // Nettoie les titres parasites en tête de nom ("et Mme. GRIS" -> "GRIS"), couples Modelo
      if (formatDetecte === 'contact' && c.nom) {
        if (!c.civilite) {
          const civ = extraireCivilite(c.nom)
          if (civ) c.civilite = civ
        }
        c.nom = nettoyerNomContact(c.nom)
      }
      return c
    })
    try {
      const payload = { contacts }
      if ((user?.role === 'manager' || user?.role === 'admin') && assigneA) payload.assigned_to = assigneA
      const r = await api.post('/contacts/import', payload)
      setResult(r.data)
      setStep(3)
      toast.success(`${r.data.importes} contacts importés`)
    } catch {
      toast.error('Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-secondary">Fermer</button>
      {step === 2 && (
        <button onClick={doImport} disabled={importing} className="btn-primary">
          {importing ? 'Import en cours…' : `Importer ${rows.length.toLocaleString('fr')} contacts`}
        </button>
      )}
      {step === 3 && <button onClick={onImported} className="btn-primary">Terminer</button>}
    </>
  )

  return (
    <Modal title="Import de contacts" onClose={onClose} footer={footer}>
      {step === 1 && (
        <div className="text-center py-8">
          <Icon name="file-up" size="xl" className="text-quai-navy mx-auto mb-4" />
          <h3 className="text-lg font-display font-medium text-quai-navy mb-2">Sélectionnez votre fichier</h3>
          <p className="text-sm text-quai-muted mb-2">Formats acceptés :</p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {['.xlsx', '.xls', '.csv', '.ods', '.tsv'].map(f => (
              <span key={f} className="badge bg-quai-navy/10 text-quai-navy border border-quai-navy/20 text-xs font-mono">{f}</span>
            ))}
          </div>
          <p className="text-xs text-quai-muted mb-4">La première ligne doit contenir les en-têtes de colonnes.</p>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" className="hidden"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          <button onClick={() => fileRef.current.click()} className="btn-primary">Choisir un fichier</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-3 text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-quai-navy/5 text-quai-navy">
            <Icon name="file-check" size="sm" /> Format détecté : {formatDetecte === 'bien' ? 'Export biens Modelo (propriétaires)' : 'Export contacts'}
          </div>
          <div className="mb-4 p-3 bg-quai-navy/5 rounded-lg text-sm text-quai-navy inline-flex items-center gap-2">
            <Icon name="table" size="sm" /> {rows.length.toLocaleString('fr')} lignes détectées. Vérifiez le mapping des colonnes.
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-quai-text mb-1">Catégorie par défaut</label>
            <select className="input w-auto" value={defaultCategorie} onChange={e => setDefaultCategorie(e.target.value)}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-quai-text mb-1">Attribuer les contacts à</label>
              <select className="input w-auto" value={assigneA} onChange={e => setAssigneA(e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}{u.id === user.id ? ' (moi)' : ''}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(FIELD_MAP).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-quai-muted mb-1">{FIELD_LABELS[field] || field}</label>
                <select className="input" value={mapping[field] || ''} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || null }))}>
                  <option value="">— Ignorer —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {rows.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-quai-muted mb-2">Aperçu (3 premières lignes)</div>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-quai-light">
                      {Object.entries(mapping).filter(([,v]) => v).map(([f]) => (
                        <th key={f} className="border border-quai-border px-2 py-1 text-left">{FIELD_LABELS[f] || f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(mapping).filter(([,v]) => v).map(([f, col]) => (
                          <td key={f} className="border border-quai-border px-2 py-1 max-w-32 truncate">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && result && (
        <div className="text-center py-8">
          <Icon name="check-circle-2" size="xl" className="text-emerald-600 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold text-quai-navy mb-2">Import terminé</h3>
          <div className="grid grid-cols-2 gap-4 my-4 max-w-xs mx-auto">
            <div className="card text-center">
              <div className="text-2xl font-bold text-emerald-600">{result.importes}</div>
              <div className="text-xs text-quai-muted">Importés</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-red-600">{result.erreurs}</div>
              <div className="text-xs text-quai-muted">Erreurs</div>
            </div>
          </div>
          {result.fusionnes > 0 && (
            <div className="text-sm text-quai-navy mb-2">{result.fusionnes} contact(s) déjà existant(s) — complété(s) / bien(s) cumulé(s).</div>
          )}
          {result.dates_ignorees > 0 && (
            <div className="text-xs text-quai-muted mt-2 space-y-1">
              <div>{result.dates_ignorees} date(s) d'estimation illisible(s) — ignorée(s).</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
