import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'

// Administration du Fichier Acquéreurs : accès, import, fiches écartées,
// validation des archivages, report Modelo, transmissions, scripts.
const err = (e) => toast.error(e.messageLisible || e.message)
const jj = (s) => s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

function Bloc({ titre, children }) {
  return <section className="card mb-3"><h2 className="font-semibold text-quai-navy mb-2">{titre}</h2>{children}</section>
}
const lireFichier = (f) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsText(f, 'utf-8') })

function Acces() {
  const [users, setUsers] = useState([])
  const charger = () => api.get('/acquereurs/admin/acces').then(r => setUsers(r.data.users)).catch(err)
  useEffect(() => { charger() }, [])
  const basculer = (u) => api.put(`/acquereurs/admin/acces/${u.id}`, { acces: !u.acces_acquereurs }).then(charger).catch(err)
  const avec = users.filter(u => u.acces_acquereurs)
  return (
    <Bloc titre="Qui travaille dans le Fichier Acquéreurs">
      <p className="text-xs text-quai-muted mb-2">Cocher donne l’espace en plus de ce que la personne a déjà. Les administrateurs y ont accès d’office.</p>
      <div className="flex flex-wrap gap-1.5 mb-2">{avec.map(u => <span key={u.id} className="badge bg-quai-navy text-white">{u.prenom} {u.nom}</span>)}</div>
      <details><summary className="text-sm cursor-pointer text-quai-navy">Modifier</summary>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-2">
          {users.filter(u => u.role !== 'admin').map(u => (
            <label key={u.id} className="text-sm inline-flex items-center gap-1.5"><input type="checkbox" checked={!!u.acces_acquereurs} onChange={() => basculer(u)} />{u.prenom} {u.nom}</label>
          ))}
        </div>
      </details>
    </Bloc>
  )
}

function Import({ onFait }) {
  const [csv, setCsv] = useState(null), [doublons, setDoublons] = useState(null), [nom, setNom] = useState('Lilas FERKOUS')
  const [bilan, setBilan] = useState(null), [envoi, setEnvoi] = useState(false)
  const lancer = async (ecrire) => {
    if (!csv) return toast.error('Choisissez le fichier d’import.')
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/import', { csv: csv.texte, doublons_csv: doublons?.texte || null, madame_fichier: nom, ecrire }, { timeout: 120000 })
      setBilan(r.data); if (ecrire) { toast.success('Import enregistré'); onFait?.() }
    } catch (e) { err(e) } finally { setEnvoi(false) }
  }
  return (
    <Bloc titre="Importer l’extraction Modelo">
      <div className="grid sm:grid-cols-3 gap-2 text-sm">
        <label className="block"><span className="text-[11px] text-quai-muted">Fichier d’import (CSV « ; »)</span>
          <input type="file" accept=".csv" className="block text-xs mt-1" onChange={async e => { const f = e.target.files[0]; if (f) setCsv({ nom: f.name, texte: await lireFichier(f) }); setBilan(null) }} /></label>
        <label className="block"><span className="text-[11px] text-quai-muted">Audit des doublons (facultatif)</span>
          <input type="file" accept=".csv" className="block text-xs mt-1" onChange={async e => { const f = e.target.files[0]; if (f) setDoublons({ nom: f.name, texte: await lireFichier(f) }); setBilan(null) }} /></label>
        <label className="block"><span className="text-[11px] text-quai-muted">Traité par (Prénom NOM du compte)</span>
          <input className="input mt-1" value={nom} onChange={e => setNom(e.target.value)} /></label>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="btn-secondary" disabled={envoi} onClick={() => lancer(false)}>Vérifier sans enregistrer</button>
        <button className="btn-primary" disabled={envoi || !bilan || bilan.simulation === false} onClick={() => lancer(true)}>Enregistrer l’import</button>
      </div>
      {bilan && (
        <div className="mt-3 text-sm">
          <p className={bilan.simulation ? 'text-amber-800' : 'text-emerald-800'}>{bilan.simulation ? 'Vérification : rien n’est encore enregistré.' : 'Import enregistré.'}</p>
          <ul className="mt-1 space-y-0.5">
            <li>{bilan.fiches} fiches, {bilan.contacts} personnes ({bilan.nouveaux_contacts} nouvelles, {bilan.contacts_mis_a_jour} mises à jour)</li>
            <li className="font-semibold">Dans la file : {bilan.dans_la_file} personnes, {bilan.fiches_dans_la_file} fiches d’achat</li>
            {Object.entries(bilan.exclus_libelles || {}).map(([k, v]) => <li key={k} className="text-quai-muted">Hors file : {k} : {v}</li>)}
            {bilan.erreurs?.length > 0 && <li className="text-red-700">{bilan.erreurs.length} ligne(s) ignorée(s) : {bilan.erreurs.slice(0, 3).join(' ')}</li>}
          </ul>
        </div>
      )}
    </Bloc>
  )
}

function Ecartes({ cle }) {
  const [d, setD] = useState(null), [tel, setTel] = useState({})
  const charger = useCallback(() => api.get('/acquereurs/admin/contacts').then(r => setD(r.data)).catch(err), [])
  useEffect(() => { charger() }, [charger, cle])
  if (!d) return null
  const ecartes = d.contacts.filter(c => c.exclu || c.statut === 'FAUX_NUMERO')
  const parMotif = ecartes.reduce((m, c) => { const k = c.exclu ? (d.libelles[c.exclu] || c.exclu) : 'Faux numéro'; (m[k] = m[k] || []).push(c); return m }, {})
  const reintegrer = (c) => api.post(`/acquereurs/admin/contacts/${c.id_contact}/reintegrer`, { tel_portable: tel[c.id_contact] || null }).then(() => { toast.success('Remis dans la file'); charger() }).catch(err)
  return (
    <Bloc titre={`Personnes hors de la file (${ecartes.length} sur ${d.contacts.length})`}>
      {Object.entries(parMotif).map(([motif, liste]) => (
        <details key={motif} className="mb-1.5"><summary className="text-sm cursor-pointer">{motif} : {liste.length}</summary>
          <ul className="mt-1 divide-y divide-quai-border text-sm">
            {liste.map(c => (
              <li key={c.id_contact} className="py-1.5 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[10rem]">{c.prenom} {c.nom} <span className="text-[11px] text-quai-muted">n° {c.id_contact}{c.suivi_par ? ` · suivi par ${c.suivi_par}` : ''}{c.tel_portable ? ` · ${c.tel_portable}` : ''}</span></span>
                {['SANS_TELEPHONE', null].includes(c.exclu) && <input className="input max-w-[10rem]" placeholder="Nouveau portable" value={tel[c.id_contact] || ''} onChange={e => setTel(t => ({ ...t, [c.id_contact]: e.target.value }))} />}
                {!['STOP_TEL', 'OPPOSITION'].includes(c.exclu) && <button className="btn-secondary btn-sm" onClick={() => reintegrer(c)}>Remettre dans la file</button>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </Bloc>
  )
}

function Valider({ cle, onFait }) {
  const [f, setF] = useState(null), [choix, setChoix] = useState({})
  const charger = useCallback(() => api.get('/acquereurs/admin/a-valider').then(r => { setF(r.data.fiches); setChoix(Object.fromEntries(r.data.fiches.map(x => [x.id_fiche, true]))) }).catch(err), [])
  useEffect(() => { charger() }, [charger, cle])
  if (!f) return null
  const valider = () => api.post('/acquereurs/admin/valider', { fiches: f.map(x => ({ id_fiche: x.id_fiche, accepte: !!choix[x.id_fiche] })) })
    .then(() => { toast.success('Validation enregistrée'); charger(); onFait?.() }).catch(err)
  const motif = (x) => x.decision === 'FUSIONNER' ? `doublon de la recherche n° ${x.fusion_dans}` : x.decision === 'ARCHIVER' ? x.motif_archivage : ({ ABANDONNE: 'projet abandonné', DEJA_ACHETE: 'a déjà acheté', DECEDE: 'décédé', NE_PLUS_CONTACTER: 'ne veut plus être contacté' })[x.statut_contact]
  return (
    <Bloc titre={`Archivages à valider (${f.length})`}>
      {f.length === 0 ? <p className="text-sm text-quai-muted">Rien à valider.</p> : <>
        <p className="text-xs text-quai-muted mb-2">Décochez une fiche pour refuser son archivage : elle reste active dans Modelo.</p>
        <ul className="divide-y divide-quai-border text-sm">
          {f.map(x => (
            <li key={x.id_fiche} className="py-1.5 flex items-center gap-2">
              <input type="checkbox" checked={!!choix[x.id_fiche]} onChange={e => setChoix(c => ({ ...c, [x.id_fiche]: e.target.checked }))} />
              <span className="flex-1">{x.prenom} {x.nom} · recherche n° {x.id_fiche} ({x.type_bien}) <span className="text-quai-muted">: {motif(x)} · par {x.decision_par || '?'}</span></span>
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-2" onClick={valider}>Valider ({Object.values(choix).filter(Boolean).length} archivées, {Object.values(choix).filter(v => !v).length} refusées)</button>
      </>}
    </Bloc>
  )
}

function Report({ cle }) {
  const [d, setD] = useState(null), [bloque, setBloque] = useState(null)
  const charger = useCallback(() => api.get('/acquereurs/admin/report').then(r => { setD(r.data); setBloque(null) }).catch(e => { if (e.response?.status === 409) { setBloque(e.response.data.error); setD(null) } else err(e) }), [])
  useEffect(() => { charger() }, [charger, cle])
  const telecharger = async () => {
    try {
      const r = await api.get('/acquereurs/admin/report', { params: { format: 'csv' }, responseType: 'blob' })
      const url = URL.createObjectURL(r.data); const a = document.createElement('a')
      a.href = url; a.download = `Report_Modelo_Acquereurs_${d.jusqu_a.slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
    } catch (e) { err(e) }
  }
  const retour = () => {
    if (!window.confirm('Exploration Modelo a-t-il bien appliqué ce fichier dans Modelo ? Les contacts seront marqués comme reportés.')) return
    api.post('/acquereurs/admin/report/retour', { jusqu_a: d.jusqu_a }).then(r => { toast.success(`${r.data.contacts} contacts marqués reportés`); charger() }).catch(err)
  }
  return (
    <Bloc titre="Report dans Modelo">
      {bloque ? <p className="text-sm text-amber-800">{bloque}</p> : !d ? null : d.fiches === 0 ? <p className="text-sm text-quai-muted">Rien à reporter.</p> : <>
        <p className="text-sm">{d.contacts} personnes, {d.fiches} lignes (une par fiche acquéreur), jusqu’au {jj(d.jusqu_a)}.</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <button className="btn-primary" onClick={telecharger}>Télécharger le fichier pour Exploration Modelo</button>
          <button className="btn-secondary" onClick={retour}>Exploration Modelo l’a appliqué</button>
        </div>
      </>}
    </Bloc>
  )
}

function Transmettre() {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/admin/transmettre').then(r => setD(r.data)).catch(err) }, [])
  if (!d) return null
  return (
    <Bloc titre="À transmettre">
      <h3 className="text-sm font-semibold mt-1">Rendez-vous courtage pour Marine ({d.marine.length})</h3>
      <ul className="text-sm divide-y divide-quai-border mb-3">{d.marine.map(l => <li key={l.horodatage + l.id_contact} className="py-1">{l.prenom} {l.nom} · {l.tel_portable} · proposé le {jj(l.horodatage)} · {l.accord ? 'client d’accord' : 'accord non donné'}</li>)}</ul>
      <h3 className="text-sm font-semibold">Estimations ({d.estimations.length})</h3>
      <ul className="text-sm divide-y divide-quai-border">{d.estimations.map(l => <li key={l.horodatage + l.id_contact} className="py-1">{l.prenom} {l.nom} · {l.tel_portable} · {l.acceptee ? `acceptée${l.date_rdv ? ', rdv le ' + new Date(l.date_rdv).toLocaleString('fr-FR') : ''}` : 'proposée'}{l.adresse ? ` · ${l.adresse}` : ''} · à faire par {l.source === 'DELEGUE' ? l.conseiller : l.madame_fichier}</li>)}</ul>
    </Bloc>
  )
}

const NOMS_PARTIES = { '0': 'Ouverture', '1': 'Coordonnées', '2.1': 'Projet et motivation', '2.2': 'Critères', '2.3': 'Financement', '3': 'Vendre pour acheter', '4': 'Issue de l’appel' }
function Scripts() {
  const [p, setP] = useState(null)
  useEffect(() => { api.get('/acquereurs/admin/scripts').then(r => setP(r.data.parties)).catch(err) }, [])
  if (!p) return null
  const sauver = (x) => api.put(`/acquereurs/admin/scripts/${x.partie}`, { texte: x.texte }).then(() => toast.success('Script enregistré')).catch(err)
  return (
    <Bloc titre="Scripts d’appel">
      <p className="text-xs text-quai-muted mb-2">Variables remplacées à l’écran : {'{civilite}'}, {'{prenom}'}, {'{nom}'}.</p>
      {p.map((x, i) => (
        <div key={x.partie} className="mb-2">
          <div className="text-sm font-medium">{x.partie}. {NOMS_PARTIES[x.partie]}</div>
          <textarea className="input min-h-[4rem]" value={x.texte} onChange={e => setP(l => l.map((y, j) => j === i ? { ...y, texte: e.target.value } : y))} />
          <button className="btn-secondary btn-sm mt-1" onClick={() => sauver(x)}>Enregistrer</button>
        </div>
      ))}
    </Bloc>
  )
}

export default function AcqAdmin() {
  const [cle, setCle] = useState(0)
  const rafraichir = () => setCle(k => k + 1)
  return (
    <div className="p-3 max-w-4xl mx-auto">
      <Acces />
      <Import onFait={rafraichir} />
      <Valider cle={cle} onFait={rafraichir} />
      <Report cle={cle} />
      <Transmettre />
      <Ecartes cle={cle} />
      <Scripts />
    </div>
  )
}
