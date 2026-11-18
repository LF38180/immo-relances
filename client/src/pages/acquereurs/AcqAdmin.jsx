import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

// Administration du Fichier Acquéreurs : accès, import, fiches écartées,
// validation des archivages, report Modelo, transmissions, scripts.
const err = (e) => toast.error(e.messageLisible || e.message)
const jj = (s) => s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

// Un bloc d'administration : une icône, un titre, une phrase qui dit à quoi il sert.
function Bloc({ titre, icon, aide, children }) {
  return (
    <section className="bg-white border border-quai-border rounded-2xl p-4 md:p-5 mb-4">
      <div className="flex items-start gap-3 mb-3">
        {icon && <span className="w-9 h-9 rounded-lg bg-quai-light grid place-items-center shrink-0"><Icon name={icon} size="sm" className="text-quai-navy" /></span>}
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-quai-navy text-lg leading-tight">{titre}</h2>
          {aide && <p className="text-xs text-quai-muted mt-0.5 leading-snug">{aide}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// Choisir un fichier : un vrai bouton, et le nom du fichier une fois choisi.
function Fichier({ label, fichier, onChoisir, facultatif }) {
  return (
    <label className="block cursor-pointer">
      <span className="text-[11px] text-quai-muted">{label}</span>
      <span className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${fichier ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-dashed border-quai-border bg-quai-light text-quai-muted hover:border-quai-gold'}`}>
        <Icon name={fichier ? 'file-check' : 'file-up'} size="sm" className="shrink-0" />
        <span className="truncate">{fichier ? fichier.nom : facultatif ? 'Choisir un fichier (facultatif)' : 'Choisir un fichier'}</span>
      </span>
      <input type="file" accept=".csv" className="hidden" onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (f) onChoisir({ nom: f.name, texte: await lireFichier(f) }) }} />
    </label>
  )
}
const lireFichier = (f) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsText(f, 'utf-8') })

// Qui a la mission : se coche dans Immo Relances › Administration ›
// Utilisateurs, avec les autres réglages du compte. Ici, on ne fait que lire.
function Acces({ users }) {
  const avec = users.filter(u => u.acces_acquereurs)
  return (
    <Bloc titre="Qui a la mission" icon="users" aide="Les personnes qui appellent pour la Mission Acquéreurs.">
      <div className="flex flex-wrap gap-1.5 mb-1">{avec.length ? avec.map(u => <span key={u.id} className="badge bg-quai-navy text-white">{u.prenom} {u.nom}</span>) : <span className="text-sm text-quai-muted">Personne pour l’instant.</span>}</div>
      <p className="text-xs text-quai-muted">À cocher dans Utilisateurs, colonne « Missions ».</p>
    </Bloc>
  )
}

function Import({ onFait, users }) {
  const enMission = users.filter(u => u.acces_acquereurs).map(u => `${u.prenom} ${u.nom}`)
  const [csv, setCsv] = useState(null), [doublons, setDoublons] = useState(null), [choix, setNom] = useState('')
  const nom = choix || enMission[0] || ''
  const [bilan, setBilan] = useState(null), [envoi, setEnvoi] = useState(false)
  const lancer = async (ecrire) => {
    if (!csv) return toast.error('Choisissez le fichier d’import.')
    if (!nom) return toast.error('Donnez d’abord la mission à quelqu’un (Utilisateurs, colonne Missions).')
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/import', { csv: csv.texte, doublons_csv: doublons?.texte || null, madame_fichier: nom, ecrire }, { timeout: 120000 })
      setBilan(r.data); if (ecrire) { toast.success('Import enregistré'); onFait?.() }
    } catch (e) { err(e) } finally { setEnvoi(false) }
  }
  return (
    <Bloc titre="Importer l’extraction Modelo" icon="file-up" aide="Le fichier préparé par Exploration Modelo : une ligne par fiche acquéreur. On vérifie d’abord, on enregistre ensuite.">
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <Fichier label="Fichier d’import (CSV « ; »)" fichier={csv} onChoisir={(f) => { setCsv(f); setBilan(null) }} />
        <Fichier label="Audit des doublons" facultatif fichier={doublons} onChoisir={(f) => { setDoublons(f); setBilan(null) }} />
        <label className="block"><span className="text-[11px] text-quai-muted">Traité par</span>
          <select className="input mt-1" value={nom} onChange={e => setNom(e.target.value)}>
            {!enMission.length && <option value="">Personne n’a la mission</option>}
            {enMission.map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="btn-secondary" disabled={envoi} onClick={() => lancer(false)}>Vérifier sans enregistrer</button>
        <button className="btn-primary" disabled={envoi || !bilan || bilan.simulation === false} onClick={() => lancer(true)}>Enregistrer l’import</button>
      </div>
      {bilan && (
        <div className={`mt-3 text-sm rounded-xl border px-3 py-2.5 ${bilan.simulation ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className={`font-medium ${bilan.simulation ? 'text-amber-900' : 'text-emerald-900'}`}>{bilan.simulation ? 'Vérification : rien n’est encore enregistré.' : 'Import enregistré.'}</p>
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
    <Bloc titre={`Personnes hors de la file (${ecartes.length} sur ${d.contacts.length})`} icon="phone-off" aide="Elles ne sont pas proposées à l’appel. Une fiche complétée peut revenir dans la file.">
      {ecartes.length === 0 && <p className="text-sm text-quai-muted">Personne n’est écarté.</p>}
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
    <Bloc titre={`Archivages à valider (${f.length})`} icon="file-check" aide="Aucune fiche n’est archivée dans Modelo sans cette validation.">
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
  const [res, setRes] = useState(null)
  const importerRetour = async (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    try {
      const r = await api.post('/acquereurs/admin/report/retour', { csv: await lireFichier(f) })
      setRes(r.data); toast.success(`${r.data.reportes} contact${r.data.reportes > 1 ? 's' : ''} reporté${r.data.reportes > 1 ? 's' : ''}, ${r.data.echecs} en échec`, { duration: 6000 }); charger()
    } catch (e) { err(e) }
  }
  return (
    <Bloc titre="Report dans Modelo" icon="file-down" aide="Comme pour l’opération anciens clients : je télécharge le fichier, je le donne à Exploration Modelo, puis j’importe son retour.">
      {bloque ? <p className="text-sm text-amber-800">{bloque}</p> : !d ? null : d.fiches === 0 ? <p className="text-sm text-quai-muted">Rien à reporter.</p> : <>
        <p className="text-sm">{d.contacts} personnes, {d.fiches} lignes (une par fiche acquéreur), jusqu’au {jj(d.jusqu_a)}.</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={telecharger}><Icon name="download" size="sm" /> Télécharger le fichier pour Exploration Modelo</button>
        </div>
      </>}
      <div className="mt-3 pt-3 border-t border-quai-border">
        <label className="btn-secondary inline-flex items-center gap-1.5 cursor-pointer"><Icon name="upload" size="sm" /> Importer le retour d’Exploration Modelo
          <input type="file" accept=".csv,.txt" className="hidden" onChange={importerRetour} /></label>
        <p className="text-[11px] text-quai-muted mt-1">Le fichier de report, avec la colonne « statut » remplie : reporté ou échec (et « motif_echec »). Les contacts reportés sortent de la liste ; ceux en échec y restent.</p>
        {res && <div className="text-sm mt-2">{res.reportes} reporté(s), {res.echecs} en échec{res.inconnus.length ? `, ${res.inconnus.length} inconnu(s)` : ''}.
          {res.sans_date?.length > 0 && <p className="text-xs text-amber-800 mt-1">{res.sans_date.length} contact(s) non marqué(s) : la colonne « jusqu_a » du fichier de retour est vide ou illisible. Demandez à Exploration Modelo de la laisser telle qu’elle était dans le fichier de report.</p>}
          {res.motifs.length > 0 && <ul className="text-xs text-red-700 mt-1">{res.motifs.map(m => <li key={m.id_contact}>n° {m.id_contact} : {m.motif || 'sans motif'}</li>)}</ul>}</div>}
      </div>
    </Bloc>
  )
}

// Le report Modelo en une ligne, pour l'écran de Suivi : combien de contacts
// attendent, le fichier à télécharger, le retour à importer — comme dans
// l'opération anciens clients. Le détail reste dans l'onglet Report Modelo.
export function ReportBandeau({ onDetail }) {
  const [d, setD] = useState(null), [bloque, setBloque] = useState(null), [envoi, setEnvoi] = useState(false)
  const charger = useCallback(() => api.get('/acquereurs/admin/report').then(r => { setD(r.data); setBloque(null) })
    .catch(e => { if (e.response?.status === 409) { setBloque(e.response.data); setD(null) } else err(e) }), [])
  useEffect(() => { charger() }, [charger])
  const telecharger = async () => {
    try {
      const r = await api.get('/acquereurs/admin/report', { params: { format: 'csv' }, responseType: 'blob' })
      const url = URL.createObjectURL(r.data); const a = document.createElement('a')
      a.href = url; a.download = `Report_Modelo_Acquereurs_${d.jusqu_a.slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
    } catch (e) { err(e) }
  }
  const importer = async (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/report/retour', { csv: await lireFichier(f) })
      toast.success(`${r.data.reportes} contact${r.data.reportes > 1 ? 's' : ''} reporté${r.data.reportes > 1 ? 's' : ''}, ${r.data.echecs} en échec${r.data.inconnus.length ? `, ${r.data.inconnus.length} inconnu(s)` : ''}`, { duration: 7000 })
      if (r.data.sans_date?.length) toast.error(`${r.data.sans_date.length} contact(s) non marqué(s) : colonne « jusqu_a » vide ou illisible dans le retour.`, { duration: 9000 })
      charger()
    } catch (e) { err(e) } finally { setEnvoi(false) }
  }
  const n = d?.contacts || 0
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-2 ${n || bloque ? 'bg-amber-50 border-amber-200' : 'bg-white border-quai-border'}`}>
      {/* Sur téléphone, le texte prend toute la ligne et les boutons passent dessous. */}
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <div className="text-sm font-semibold text-quai-navy">Report dans Modelo</div>
        <div className="text-[11px] text-quai-muted leading-snug">
          {bloque ? `${bloque.attente} archivage${bloque.attente > 1 ? 's' : ''} à valider avant de pouvoir reporter.`
            : !d ? 'Chargement…'
            : n ? <><b className="text-quai-navy">{n}</b> contact{n > 1 ? 's' : ''} avec du nouveau à reporter ({d.fiches} ligne{d.fiches > 1 ? 's' : ''}).</>
            : 'Tout est reporté.'}
          {' '}Téléchargez, donnez le fichier à Exploration Modelo, puis importez son retour.
        </div>
      </div>
      {bloque
        ? <button onClick={onDetail} className="text-xs px-3 py-2 rounded-lg bg-quai-navy text-white">Valider les archivages</button>
        : <button onClick={telecharger} disabled={!n} className="text-xs px-3 py-2 rounded-lg bg-quai-navy text-white disabled:opacity-40">À reporter{n ? ` (${n})` : ''}</button>}
      <label className={`text-xs px-3 py-2 rounded-lg border border-quai-border bg-white text-quai-navy cursor-pointer ${envoi ? 'opacity-40' : ''}`}>
        Importer le retour
        <input type="file" accept=".csv,.txt" className="hidden" onChange={importer} disabled={envoi} />
      </label>
      {onDetail && !bloque && <button onClick={onDetail} className="text-xs text-quai-muted underline">Détail</button>}
    </div>
  )
}

function Transmettre() {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/acquereurs/admin/transmettre').then(r => setD(r.data)).catch(err) }, [])
  if (!d) return null
  return (
    <Bloc titre="À transmettre" icon="arrow-right" aide="Ce que Lilas a obtenu pour d’autres : les rendez-vous de courtage pour Marine, et les estimations à caler.">
      <h3 className="text-sm font-semibold mt-1">Rendez-vous courtage pour Marine ({d.marine.length})</h3>
      <ul className="text-sm divide-y divide-quai-border mb-3">{d.marine.map(l => <li key={l.horodatage + l.id_contact} className="py-1">{l.prenom} {l.nom} · {l.tel_portable} · proposé le {jj(l.horodatage)} · {l.accord ? 'client d’accord' : 'accord non donné'}</li>)}</ul>
      <h3 className="text-sm font-semibold">Estimations ({d.estimations.length})</h3>
      <ul className="text-sm divide-y divide-quai-border">{d.estimations.map(l => <li key={l.horodatage + l.id_contact} className="py-1">{l.prenom} {l.nom} · {l.tel_portable} · {l.acceptee ? `acceptée${l.date_rdv ? ', rdv le ' + new Date(l.date_rdv).toLocaleString('fr-FR') : ''}` : 'proposée'}{l.adresse ? ` · ${l.adresse}` : ''} · à faire par {l.source === 'DELEGUE' ? l.conseiller : l.madame_fichier}</li>)}</ul>
    </Bloc>
  )
}

const NOMS_PARTIES = { accueil: 'Page d’accueil (texte de présentation)', '0': 'Ouverture', '1': 'Coordonnées', '2.1': 'Projet et motivation', '2.2': 'Critères', '2.3': 'Financement', '3': 'Vendre pour acheter', mandat: 'Le mandat de recherche', '4': 'Suite donnée', repondeur: 'Message sur le répondeur', sms: 'Modèle de SMS' }
function Scripts() {
  const [p, setP] = useState(null)
  useEffect(() => { api.get('/acquereurs/admin/scripts').then(r => setP(r.data.parties)).catch(err) }, [])
  if (!p) return null
  const sauver = (x) => api.put(`/acquereurs/admin/scripts/${x.partie}`, { texte: x.texte }).then(() => toast.success('Script enregistré')).catch(err)
  const num = (k) => ({ mandat: '4', '4': '5' }[k] ?? (/^\d/.test(k) ? k : null))
  return (
    <Bloc titre="Scripts et textes" icon="file-text" aide="Chaque texte s’affiche à l’écran dans sa partie de l’appel. Variables remplacées : {civilite}, {prenom}, {nom}.">
      <div className="space-y-3">
        {p.map((x, i) => (
          <div key={x.partie} className="rounded-xl border border-quai-border overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2 bg-quai-light border-b border-quai-border">
              <span className="w-6 h-6 rounded-full bg-quai-navy text-quai-gold grid place-items-center text-[11px] font-semibold shrink-0">{num(x.partie) ?? <Icon name="file-text" size="sm" />}</span>
              <span className="text-sm font-medium text-quai-navy flex-1">{NOMS_PARTIES[x.partie]}</span>
              {x.texte ? <span className="text-[11px] text-emerald-700">rédigé</span> : <span className="text-[11px] text-quai-muted">à rédiger</span>}
            </div>
            <textarea className="w-full px-3 py-2.5 text-sm text-quai-text focus:outline-none min-h-[5rem] block" placeholder="Le texte que l’agent lit à cette étape…"
              value={x.texte} onChange={e => setP(l => l.map((y, j) => j === i ? { ...y, texte: e.target.value } : y))} />
            <div className="flex justify-end px-3 py-2 border-t border-quai-border">
              <button className="btn-secondary btn-sm" onClick={() => sauver(x)}>Enregistrer</button>
            </div>
          </div>
        ))}
      </div>
    </Bloc>
  )
}

// `section` : 'import' | 'report' | 'parametres' pour n'afficher qu'une
// partie (espace de l'admin, rangé par onglet). Sans elle : tout.
export default function AcqAdmin({ section = null }) {
  const [cle, setCle] = useState(0)
  const [users, setUsers] = useState([])
  useEffect(() => { api.get('/acquereurs/admin/acces').then(r => setUsers(r.data.users)).catch(err) }, [])
  const rafraichir = () => setCle(k => k + 1)
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {(!section || section === 'parametres') && <Acces users={users} />}
      {(!section || section === 'import') && <Import onFait={rafraichir} users={users} />}
      {(!section || section === 'report') && <Valider cle={cle} onFait={rafraichir} />}
      {(!section || section === 'report') && <Report cle={cle} />}
      {(!section || section === 'report') && <Transmettre />}
      {(!section || section === 'import') && <Ecartes cle={cle} />}
      {(!section || section === 'parametres') && <Scripts />}
    </div>
  )
}
