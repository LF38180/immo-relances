import { useState, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES } from '../utils/constants'
import Modal from './ui/Modal'
import Icon from './ui/Icon'

const FIELD_MAP = {
  nom: ['nom', 'name', 'last_name', 'lastname', 'surname'],
  prenom: ['prenom', 'prénom', 'first_name', 'firstname'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable'],
  telephone2: ['telephone2', 'tel2', 'mobile2'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  adresse: ['adresse', 'address', 'rue', 'street'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code'],
  ville: ['ville', 'city', 'localite', 'commune'],
  categorie: ['categorie', 'catégorie', 'category', 'type'],
  notes: ['notes', 'note', 'commentaire', 'remarque', 'observation'],
  potentiel: ['potentiel', 'score', 'note_contact'],
  source: ['source', 'origine', 'provenance'],
  conseiller: ['conseiller', 'agent', 'négociateur', 'negociateur', 'responsable', 'assigné', 'assigne'],
  date_estimation: ['date estimation', 'date création', 'date creation', 'date', 'créé le', 'cree le'],
  photo_url: ['photo', 'image', 'url photo', 'lien photo', 'photo_url'],
}

const FIELD_LABELS = {
  nom: 'Nom', prenom: 'Prénom', telephone: 'Téléphone', telephone2: 'Téléphone 2',
  email: 'Email', adresse: 'Adresse', code_postal: 'Code postal', ville: 'Ville',
  categorie: 'Catégorie', notes: 'Notes', potentiel: 'Potentiel',
  source: 'Source', conseiller: 'Conseiller en charge', date_estimation: "Date d'estimation",
  photo_url: 'Photo (URL)',
}

function guessMapping(headers) {
  const map = {}
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    Object.entries(FIELD_MAP).forEach(([field, aliases]) => {
      if (aliases.some(a => hl === a || hl.includes(a))) {
        if (!map[field]) map[field] = h
      }
    })
  })
  return map
}

export default function ImportModal({ onClose, onImported }) {
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultCategorie, setDefaultCategorie] = useState('prospect_froid')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      // Lecture CSV
      Papa.parse(file, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        complete: (res) => {
          setHeaders(res.meta.fields || [])
          setRows(res.data)
          setMapping(guessMapping(res.meta.fields || []))
          setStep(2)
        },
        error: () => toast.error('Erreur de lecture du fichier CSV')
      })
    } else if (['xlsx', 'xls', 'ods', 'numbers'].includes(ext)) {
      // Lecture Excel / tableur
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' })
          // Prendre le premier onglet
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          if (data.length === 0) { toast.error('Feuille vide'); return }
          const hdrs = Object.keys(data[0])
          setHeaders(hdrs)
          setRows(data)
          setMapping(guessMapping(hdrs))
          setStep(2)
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
      return c
    })
    try {
      const r = await api.post('/contacts/import', { contacts })
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
          <div className="mb-4 p-3 bg-quai-navy/5 rounded-lg text-sm text-quai-navy inline-flex items-center gap-2">
            <Icon name="table" size="sm" /> {rows.length.toLocaleString('fr')} lignes détectées. Vérifiez le mapping des colonnes.
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-quai-text mb-1">Catégorie par défaut</label>
            <select className="input w-auto" value={defaultCategorie} onChange={e => setDefaultCategorie(e.target.value)}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
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
          {(result.conseillers_non_reconnus > 0 || result.dates_ignorees > 0) && (
            <div className="text-xs text-quai-muted mt-2 space-y-1">
              {result.conseillers_non_reconnus > 0 && <div>{result.conseillers_non_reconnus} conseiller(s) non reconnu(s) — contacts laissés non attribués.</div>}
              {result.dates_ignorees > 0 && <div>{result.dates_ignorees} date(s) d'estimation illisible(s) — ignorée(s).</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
