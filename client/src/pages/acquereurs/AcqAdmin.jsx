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
// Télécharger le fichier de report. Si un fichier déjà téléchargé attend son
// retour, on demande avant d'en produire un second : deux fichiers envoyés à
// Exploration Modelo, ce sont des notes en double dans Modelo.
async function telechargerReport() {
  try {
    const e = (await api.get('/acquereurs/admin/report/etat')).data
    if (e.en_attente_de_retour && !window.confirm(`Un fichier a déjà été téléchargé le ${jj(e.telechargement.le)}${e.telechargement.par ? ` par ${e.telechargement.par}` : ''} (${e.telechargement.lignes} lignes), et son retour n’a pas encore été importé.\n\nLe nouveau fichier contiendra les mêmes appels, plus ceux passés depuis. N’envoyez à Exploration Modelo que le dernier.\n\nTélécharger quand même ?`)) return false
    const r = await api.get('/acquereurs/admin/report', { params: { format: 'csv' }, responseType: 'blob' })
    const nom = /filename="([^"]+)"/.exec(r.headers?.['content-disposition'] || '')?.[1] || `Report_Modelo_Acquereurs_${new Date().toLocaleDateString('fr-CA')}.csv`
    const url = URL.createObjectURL(r.data); const a = document.createElement('a')
    a.href = url; a.download = nom; a.click(); URL.revokeObjectURL(url)
    return true
  } catch (e) { err(e); return false }
}
const messageRetour = (d) => {
  toast.success(`${d.reportes} contact${d.reportes > 1 ? 's' : ''} reporté${d.reportes > 1 ? 's' : ''}, ${d.echecs} en échec${d.inconnus.length ? `, ${d.inconnus.length} inconnu(s)` : ''}`, { duration: 7000 })
  if (d.sans_date?.length) toast.error(`${d.sans_date.length} contact(s) non marqué(s) : colonne « jusqu_a » vide ou illisible dans le retour.`, { duration: 9000 })
  if (d.date_future?.length) toast.error(`${d.date_future.length} contact(s) non marqué(s) : la date « jusqu_a » du retour est dans le futur.`, { duration: 9000 })
}
const lireFichier = (f) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsText(f, 'utf-8') })

// Qui a la mission : se coche dans Immo Relances › Administration ›
// Utilisateurs, avec les autres réglages du compte. Ici, on ne fait que lire.
function Acces({ users, onUtilisateurs }) {
  const avec = users.filter(u => u.acces_acquereurs)
  return (
    <Bloc titre="Qui a la mission" icon="users" aide="Les personnes qui appellent pour la Mission Acquéreurs.">
      <div className="flex flex-wrap gap-1.5 mb-1">{avec.length ? avec.map(u => <span key={u.id} className="badge bg-quai-navy text-white">{u.prenom} {u.nom}</span>) : <span className="text-sm text-quai-muted">Personne pour l’instant.</span>}</div>
      {onUtilisateurs
        ? <button className="btn-secondary btn-sm mt-1.5 inline-flex items-center gap-1.5" onClick={onUtilisateurs}><Icon name="user" size="sm" /> Donner ou retirer la mission</button>
        : <p className="text-xs text-quai-muted">À cocher dans Utilisateurs, colonne « Missions ».</p>}
    </Bloc>
  )
}

function Import({ onFait, users }) {
  const enMission = users.filter(u => u.acces_acquereurs).map(u => `${u.prenom} ${u.nom}`)
  const [csv, setCsv] = useState(null), [doublons, setDoublons] = useState(null), [choix, setNom] = useState('')
  const nom = choix || enMission[0] || ''
  const [bilan, setBilan] = useState(null), [envoi, setEnvoi] = useState(false), [refus, setRefus] = useState(null)
  const lancer = async (ecrire) => {
    if (!csv) return toast.error('Choisissez le fichier d’import.')
    if (!nom) return toast.error('Donnez d’abord la mission à quelqu’un (Utilisateurs, colonne Missions).')
    setEnvoi(true); setRefus(null)
    try {
      const r = await api.post('/acquereurs/admin/import', { csv: csv.texte, doublons_csv: doublons?.texte || null, madame_fichier: nom, ecrire }, { timeout: 120000 })
      setBilan(r.data); if (ecrire) { toast.success('Import enregistré'); onFait?.() }
    } catch (e) { setBilan(null); setRefus(e.response?.data?.error || e.messageLisible || e.message) } finally { setEnvoi(false) }
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
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-secondary" disabled={envoi} onClick={() => lancer(false)}>{envoi ? 'Lecture du fichier…' : 'Vérifier sans enregistrer'}</button>
        <button className="btn-primary" disabled={envoi || !bilan || bilan.simulation === false} onClick={() => lancer(true)}>Enregistrer l’import</button>
      </div>
      {refus && (
        <div className="mt-3 text-sm rounded-xl border px-3 py-2.5 bg-red-50 border-red-200 text-red-800">
          <p className="font-medium">Fichier refusé, rien n’a été enregistré.</p><p className="mt-0.5">{refus}</p>
        </div>
      )}
      {bilan && (
        <div className={`mt-3 text-sm rounded-xl border px-3 py-2.5 ${bilan.simulation ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className={`font-medium ${bilan.simulation ? 'text-amber-900' : 'text-emerald-900'}`}>{bilan.simulation ? 'Vérification : rien n’est encore enregistré.' : 'Import enregistré.'}</p>
          <ul className="mt-1 space-y-0.5">
            {bilan.lignes_physiques != null && bilan.lignes_physiques !== bilan.lignes && <li className="text-red-700 font-medium">Attention : le fichier compte {bilan.lignes_physiques} lignes, {bilan.lignes} seulement ont été lues (retours à la ligne dans une cellule, ou fichier abîmé). À vérifier avant d’enregistrer.</li>}
            <li>{bilan.fiches} fiches, {bilan.contacts} personnes ({bilan.nouveaux_contacts} nouvelles, {bilan.contacts_mis_a_jour} mises à jour)</li>
            <li className="font-semibold">Dans la file : {bilan.dans_la_file} personnes, {bilan.fiches_dans_la_file} fiches d’achat</li>
            {Object.entries(bilan.exclus_libelles || {}).map(([k, v]) => <li key={k} className="text-quai-muted">Hors file : {k} : {v}</li>)}
            {bilan.erreurs?.length > 0 && <li className="text-red-700">{bilan.erreurs.length} ligne(s) ignorée(s) : {bilan.erreurs.slice(0, 3).join(' ')}</li>}
            {bilan.sortis_de_la_file?.length > 0 && <li className="text-amber-900 font-medium">{bilan.sortis_de_la_file.length} personne(s) déjà appelée(s) sortent de la file avec ce fichier : {bilan.sortis_de_la_file.slice(0, 8).map(c => `${c.prenom || ''} ${c.nom || ''} (${c.motif}${c.rappel_le ? ', rappel prévu' : ''})`).join(' ; ')}{bilan.sortis_de_la_file.length > 8 ? '…' : ''}</li>}
          </ul>
        </div>
      )}
    </Bloc>
  )
}

// Sortir des personnes de la mission à partir d'un fichier (rappelées hors
// mission, reprises par un conseiller...). On vérifie, puis on enregistre.
// Rien n'est effacé ; « Remettre dans la file » lève la sortie.
function Sortir({ onFait }) {
  const [csv, setCsv] = useState(null), [b, setB] = useState(null), [envoi, setEnvoi] = useState(false), [refus, setRefus] = useState(null)
  const lancer = async (ecrire) => {
    if (!csv) return toast.error('Choisissez le fichier.')
    setEnvoi(true); setRefus(null)
    try {
      const r = await api.post('/acquereurs/admin/sortir', { csv: csv.texte, fichier: csv.nom, ecrire })
      setB(r.data); if (ecrire) { toast.success('Sortie enregistrée'); onFait?.() }
    } catch (e) { setB(null); setRefus(e.response?.data?.error || e.messageLisible || e.message) } finally { setEnvoi(false) }
  }
  const s = (n) => n > 1 ? 's' : ''
  const noms = (l) => l.map(c => `${c.prenom || ''} ${c.nom || ''} (n° ${c.id_contact})`.trim()).join(' ; ')
  const aReporter = b ? b.sortis.filter(c => c.a_reporter > 0) : []
  return (
    <Bloc titre="Sortir des personnes de la mission" icon="phone-off" aide="Un fichier avec les colonnes id_contact, nom, prenom et motif. Ces personnes quittent la file, n’y reviennent pas au prochain import et ne produisent plus de ligne de report. Leurs fiches et leurs appels restent.">
      <div className="grid sm:grid-cols-3 gap-3 text-sm" data-sortir>
        <Fichier label="Fichier des sorties (CSV « ; »)" fichier={csv} onChoisir={(f) => { setCsv(f); setB(null); setRefus(null) }} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-secondary" disabled={envoi} onClick={() => lancer(false)}>{envoi ? 'Lecture du fichier…' : 'Vérifier sans enregistrer'}</button>
        <button className="btn-primary" disabled={envoi || !b || !b.simulation || !(b.sortis.length + b.inconnus.length)} onClick={() => lancer(true)}>Enregistrer la sortie</button>
      </div>
      {refus && <div className="mt-3 text-sm rounded-xl border px-3 py-2.5 bg-red-50 border-red-200 text-red-800"><p className="font-medium">Fichier refusé, rien n’a été enregistré.</p><p className="mt-0.5">{refus}</p></div>}
      {b && (
        <div className={`mt-3 text-sm rounded-xl border px-3 py-2.5 ${b.simulation ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`} data-bilan-sortie>
          <p className={`font-medium ${b.simulation ? 'text-amber-900' : 'text-emerald-900'}`}>{b.simulation ? 'Vérification : rien n’est encore enregistré.' : 'Sortie enregistrée.'}</p>
          <ul className="mt-1 space-y-0.5">
            <li>{b.lignes} ligne{s(b.lignes)} lue{s(b.lignes)}, {b.contacts} personne{s(b.contacts)}.</li>
            <li className="font-semibold">{b.sortis.length} personne{s(b.sortis.length)} {b.simulation ? 'à sortir' : `sortie${s(b.sortis.length)}`} de la mission. Dans la file : {b.avant.dans_la_file} → {b.apres.dans_la_file}.</li>
            {b.sortis.some(c => !c.etait_dans_la_file) && <li className="text-quai-muted">{b.sortis.filter(c => !c.etait_dans_la_file).length} étai{b.sortis.filter(c => !c.etait_dans_la_file).length > 1 ? 'ent' : 't'} déjà hors de la file pour une autre raison, qui reste affichée : {noms(b.sortis.filter(c => !c.etait_dans_la_file))}</li>}
            {aReporter.length > 0 && <li className="text-amber-900 font-medium">{aReporter.length} avai{aReporter.length > 1 ? 'ent' : 't'} des appels pas encore reportés dans Modelo. Ils ne seront plus proposés au report : {noms(aReporter)}</li>}
            {b.sortis.some(c => c.rappel_prevu) && <li className="text-amber-900">Rappel prévu pour : {noms(b.sortis.filter(c => c.rappel_prevu))}</li>}
            {b.inconnus.length > 0 && <li className="text-quai-muted">{b.inconnus.length} absente{s(b.inconnus.length)} de l’appli : notée{s(b.inconnus.length)} pour ne pas entrer dans la file à un prochain import. {noms(b.inconnus)}</li>}
            {b.deja.length > 0 && <li className="text-quai-muted">{b.deja.length} déjà sortie{s(b.deja.length)} : rien à faire.</li>}
            {b.rejetes.length > 0 && <li className="text-red-700 font-medium">{b.rejetes.length} refusée{s(b.rejetes.length)} : {b.rejetes.map(c => `n° ${c.id_contact} ${c.nom || ''}, ${c.motif_rejet}`).join(' ; ')}</li>}
          </ul>
        </div>
      )}
    </Bloc>
  )
}

// Les personnes que Chrystelle (Mission Estimés) a déjà eues au téléphone.
// Décision du 23/11 : elle a fait le point sur leur achat, elles sortent de la
// file. L'administration coche et valide ; rien ne sort d'office.
function DejaVues({ cle, onFait }) {
  const [d, setD] = useState(null), [coches, setCoches] = useState(new Set()), [envoi, setEnvoi] = useState(false), [ouvert, setOuvert] = useState(false)
  const charger = () => api.get('/acquereurs/admin/estimes').then(r => {
    setD(r.data)
    setCoches(new Set(r.data.lignes.filter(l => l.etat === 'A_SORTIR' && !l.a_verifier).map(l => l.id_contact)))
  }).catch(err)
  useEffect(() => { charger() }, [cle])
  if (!d) return null
  const c = d.compteurs
  if (!c.communes && !c.a_sortir && !c.deja_hors_file) return null
  const s = (n) => n > 1 ? 's' : ''
  const jour = (x) => x ? String(x).slice(0, 10).split('-').reverse().join('/') : ''
  const aSortir = d.lignes.filter(l => l.etat === 'A_SORTIR')
  const basculer = (id) => setCoches(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const sortir = async () => {
    if (!window.confirm(`Sortir ${coches.size} personne${s(coches.size)} de la file ?\n\nRien n’est effacé. Chaque sortie peut être levée depuis « Personnes hors de la file ».`)) return
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/estimes/sortir', { ids: [...coches] })
      toast.success(`${r.data.sortis.length} personne${s(r.data.sortis.length)} sortie${s(r.data.sortis.length)} de la file`)
      await charger(); onFait?.()
    } catch (e) { toast.error(e.response?.data?.error || e.messageLisible || 'Sortie impossible') } finally { setEnvoi(false) }
  }
  return (
    <Bloc titre="Déjà vues par Chrystelle (Mission Estimés)" icon="users" aide="Chrystelle a déjà eu ces personnes au téléphone et a fait le point sur leur achat. Elles sortent de la file ; elles restent à Chrystelle dans Modelo. Celles qu’elle n’a jamais jointes restent dans la file, et l’écran d’appel le signale.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm" data-deja-vues>
        {[[c.a_sortir, 'à sortir de la file'], [c.jamais_jointes, 'jamais jointes : restent'], [c.deja_appelees, 'déjà appelées ici : on n’y touche pas'], [c.deja_hors_file, 'déjà hors de la file']].map(([n, l]) => (
          <div key={l} className="rounded-xl border border-quai-border bg-white px-3 py-2">
            <div className="text-xl font-display font-bold text-quai-navy tabular-nums">{n}</div>
            <div className="text-[12px] text-quai-muted leading-snug">{l}</div>
          </div>
        ))}
      </div>
      {aSortir.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button className="btn-secondary" onClick={() => setOuvert(o => !o)}>{ouvert ? 'Masquer la liste' : `Voir les ${aSortir.length} personne${s(aSortir.length)}`}</button>
            <button className="btn-primary" disabled={envoi || !coches.size} onClick={sortir}>{coches.size === 1 ? 'Sortir la personne cochée' : `Sortir les ${coches.size} personnes cochées`}</button>
            {c.dont_a_verifier > 0 && <span className="text-[12px] text-amber-800">{c.dont_a_verifier} à vérifier, non cochée{s(c.dont_a_verifier)} d’office.</span>}
          </div>
          {ouvert && (
            <div className="mt-3 divide-y divide-quai-border/60 border border-quai-border rounded-xl bg-white max-h-[28rem] overflow-y-auto" data-liste-deja-vues>
              {aSortir.map(l => {
                const e = l.estimes, a = e?.dernier_appel
                return (
                  <label key={l.id_contact} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={coches.has(l.id_contact)} onChange={() => basculer(l.id_contact)} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-quai-navy">{l.civilite} {l.prenom} {l.nom}</span>
                      <span className="text-[12px] text-quai-muted"> · n° {l.id_contact}{l.madame_fichier ? ` · file de ${l.madame_fichier}` : ''}</span>
                      {a && <span className="block text-[13px] text-quai-text">Chrystelle, le {jour(a.le)} : <b>{a.libelle}</b>{e.tentatives > 0 ? ` (après ${e.tentatives} appel${s(e.tentatives)} sans réponse)` : ''}</span>}
                      {a?.note && <span className="block text-[12px] text-quai-muted line-clamp-2">« {a.note} »</span>}
                      {!a && l.note_modelo && <span className="block text-[13px] text-quai-text">Dernière note Modelo de Chrystelle, le {jour(l.note_modelo.le)}{l.note_modelo.extrait ? ` : « ${l.note_modelo.extrait} »` : ''}</span>}
                      {e?.tiers_possible && <span className="block text-[12px] text-amber-800">À vérifier : « n’habite plus à l’adresse », sans nouvelle adresse. Chrystelle a peut-être parlé à quelqu’un d’autre.</span>}
                      {e?.nom_different && <span className="block text-[12px] text-amber-800">À vérifier : même téléphone, mais la fiche de Chrystelle est au nom de {e.nom_estimes}.</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </>
      )}
      {!aSortir.length && <p className="text-sm text-quai-muted mt-3">Personne à sortir pour l’instant.</p>}
    </Bloc>
  )
}

// Les contacts d'essai (nom commençant par ZZTEST) : les seuls que l'on peut
// effacer, et seulement depuis l'administration. Le bloc ne s'affiche que s'il y en a.
function Essais({ cle, onFait }) {
  const [liste, setListe] = useState([]), [mot, setMot] = useState('')
  const charger = useCallback(() => api.get('/acquereurs/admin/essais').then(r => setListe(r.data.contacts)).catch(() => setListe([])), [])
  useEffect(() => { charger() }, [charger, cle])
  if (!liste.length) return null
  const retirer = () => api.post('/acquereurs/admin/essais/effacer', { confirmer: mot })
    .then(r => { toast.success(`${r.data.retires} contact${r.data.retires > 1 ? 's' : ''} d’essai effacé${r.data.retires > 1 ? 's' : ''}. Report Modelo : ${r.data.a_reporter ? `${r.data.a_reporter} contact${r.data.a_reporter > 1 ? 's' : ''} encore à reporter` : 'plus rien à reporter'}.`, { duration: 7000 }); setMot(''); charger(); onFait?.() }).catch(err)
  return (
    <Bloc titre={`Contacts d’essai (${liste.length})`} icon="file-check" aide="Les contacts dont le nom commence par ZZTEST. Ce sont les seuls que l’appli accepte d’effacer.">
      <ul className="text-sm divide-y divide-quai-border mb-2">
        {liste.map(c => <li key={c.id_contact} className="py-1.5">{c.prenom} {c.nom} <span className="text-[11px] text-quai-muted">n° {c.id_contact} · {c.fiches} recherche{c.fiches > 1 ? 's' : ''} · {c.appels} appel{c.appels > 1 ? 's' : ''}</span></li>)}
      </ul>
      <p className="text-xs text-quai-muted mb-2">Effacer retire ces contacts de l’appli, avec leurs recherches et leurs appels d’essai : ils sortent aussi du fichier de report Modelo, même si un retour était attendu. C’est définitif, et cela ne touche pas Modelo : ils y restent tant que vous ne les y supprimez pas.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[12rem]" value={mot} onChange={e => setMot(e.target.value)} placeholder="Tapez ZZTEST" aria-label="Tapez ZZTEST pour confirmer" autoCapitalize="characters" />
        <button className="btn-secondary btn-sm text-red-700 border-red-200 disabled:opacity-40" disabled={mot.trim().toUpperCase() !== 'ZZTEST'} onClick={retirer}>Effacer les contacts d’essai</button>
      </div>
    </Bloc>
  )
}

// Vider toutes les données de la mission, comme pour la Mission Estimés : le mot
// EFFACER, une sauvegarde écrite avant, et tout part dans une corbeille d'où
// l'on peut le remettre. Les scripts et les accès ne bougent pas.
function Vider({ cle, onFait }) {
  const [d, setD] = useState(null), [mot, setMot] = useState(''), [envoi, setEnvoi] = useState(false)
  const charger = useCallback(() => api.get('/acquereurs/admin/corbeille').then(r => setD(r.data)).catch(() => setD(null)), [])
  useEffect(() => { charger() }, [charger, cle])
  if (!d) return null
  const jour = (lot) => new Date(lot.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const vider = async () => {
    if (mot !== 'EFFACER' || envoi) return
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/vider', { confirmation: 'EFFACER' }, { timeout: 120000 })
      toast.success(`${r.data.contacts} contact${r.data.contacts > 1 ? 's' : ''} envoyé${r.data.contacts > 1 ? 's' : ''} à la corbeille. Sauvegarde ${r.data.sauvegarde} écrite avant.`, { duration: 8000 })
      setMot(''); charger(); onFait?.()
    } catch (e) { err(e) } finally { setEnvoi(false) }
  }
  const remettre = (lot) => api.post('/acquereurs/admin/corbeille/restaurer', { lot })
    .then(r => { toast.success(`${r.data.contacts} contact${r.data.contacts > 1 ? 's' : ''} remis en place, avec leurs appels`); charger(); onFait?.() }).catch(err)
  return (
    <Bloc titre="Données de la mission" icon="database" aide="Vider la mission avant un ré-import propre. Rien n’est détruit : tout part en corbeille.">
      {d.lots.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-quai-muted mb-1">Corbeille</div>
          <ul className="text-sm divide-y divide-quai-border">
            {d.lots.map(l => (
              <li key={l.lot} className="py-1.5 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[12rem]">Vidé le {jour(l.lot)}{l.par ? ` par ${l.par}` : ''} <span className="text-[11px] text-quai-muted">· {l.contacts} contact{l.contacts > 1 ? 's' : ''}, {l.fiches} recherche{l.fiches > 1 ? 's' : ''}, {l.appels} appel{l.appels > 1 ? 's' : ''}</span></span>
                <button className="btn-secondary btn-sm disabled:opacity-40" disabled={d.en_base.contacts > 0} title={d.en_base.contacts > 0 ? 'La mission contient des contacts : videz-la d’abord' : ''} onClick={() => remettre(l.lot)}>Remettre en place</button>
              </li>
            ))}
          </ul>
          {d.en_base.contacts > 0 && <p className="text-[11px] text-quai-muted mt-1">Pour remettre un lot, la mission doit d’abord être vide : on ne mélange pas un ancien fichier avec un nouvel import.</p>}
        </div>
      )}
      <div className="rounded-lg border-2 border-red-200 p-3">
        <div className="flex items-start gap-2 mb-2">
          <Icon name="alert-triangle" size="md" className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-quai-text">
            <b className="text-quai-navy">Vider toutes les données de la Mission Acquéreurs</b> : les {d.en_base.contacts} contact{d.en_base.contacts > 1 ? 's' : ''}, leurs recherches, les {d.en_base.appels} appel{d.en_base.appels > 1 ? 's' : ''} et l’historique des reports.
            Une sauvegarde est écrite juste avant, et tout reste récupérable depuis la corbeille ci-dessus. Les scripts, les accès et les autres missions ne sont <b>pas</b> concernés. Modelo n’est pas touché.
          </p>
        </div>
        <label className="block text-xs font-medium text-quai-muted mb-1">Tapez <span className="font-mono font-bold">EFFACER</span> pour confirmer</label>
        <div className="flex flex-wrap gap-2">
          <input className="input w-48" value={mot} onChange={e => setMot(e.target.value)} placeholder="EFFACER" aria-label="Tapez EFFACER pour confirmer" />
          <button onClick={vider} disabled={mot !== 'EFFACER' || envoi || !d.en_base.contacts} className="btn-danger inline-flex items-center gap-1.5 disabled:opacity-40">
            <Icon name="trash-2" size="sm" /> {envoi ? 'Vidage…' : 'Vider la mission'}
          </button>
        </div>
      </div>
    </Bloc>
  )
}

function Ecartes({ cle }) {
  const [d, setD] = useState(null), [tel, setTel] = useState({})
  const charger = useCallback(() => api.get('/acquereurs/admin/contacts').then(r => setD(r.data)).catch(err), [])
  useEffect(() => { charger() }, [charger, cle])
  if (!d) return <Bloc titre="Personnes hors de la file" icon="phone-off"><p className="text-sm text-quai-muted animate-pulse">Chargement…</p></Bloc>
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
                <span className="flex-1 min-w-[10rem]">{c.prenom} {c.nom} <span className="text-[11px] text-quai-muted">n° {c.id_contact}{c.suivi_par ? ` · suivi par ${c.suivi_par}` : ''}{c.tel_portable ? ` · ${c.tel_portable}` : ''}{c.sorti_motif ? ` · ${c.sorti_motif}` : ''}</span></span>
                {['SANS_TELEPHONE', null].includes(c.exclu) && <input className="input max-w-[10rem]" placeholder="Nouveau portable" aria-label="Nouveau portable" type="tel" inputMode="tel" value={tel[c.id_contact] || ''} onChange={e => setTel(t => ({ ...t, [c.id_contact]: e.target.value }))} />}
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
  if (!f) return <Bloc titre="Archivages à valider" icon="file-check"><p className="text-sm text-quai-muted animate-pulse">Chargement…</p></Bloc>
  const valider = () => api.post('/acquereurs/admin/valider', { fiches: f.map(x => ({ id_fiche: x.id_fiche, accepte: !!choix[x.id_fiche] })) })
    .then(() => { toast.success('Validation enregistrée'); charger(); onFait?.() }).catch(err)
  const motif = (x) => x.decision === 'FUSIONNER' ? `doublon de la recherche n° ${x.fusion_dans}` : x.decision === 'ARCHIVER' ? x.motif_archivage : ({ ABANDONNE: 'projet abandonné', DEJA_ACHETE: 'a déjà acheté', DECEDE: 'décédé', NE_PLUS_CONTACTER: 'ne veut plus être contacté' })[x.statut_contact]
  return (
    <Bloc titre={`Archivages à valider (${f.length})`} icon="file-check" aide="Aucune fiche n’est archivée dans Modelo sans cette validation.">
      {f.length === 0 ? <p className="text-sm text-quai-muted">Rien à valider.</p> : <>
        <p className="text-xs text-quai-muted mb-2">Décochez une fiche pour refuser son archivage : elle reste active dans Modelo.</p>
        <ul className="divide-y divide-quai-border text-sm">
          {f.map(x => (
            <li key={x.id_fiche}><label className="py-2 flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 shrink-0" checked={!!choix[x.id_fiche]} onChange={e => setChoix(c => ({ ...c, [x.id_fiche]: e.target.checked }))} />
              <span className="flex-1">{x.prenom} {x.nom} · recherche n° {x.id_fiche} ({x.type_bien}) <span className="text-quai-muted">: {motif(x)} · par {x.decision_par || '?'}</span></span>
            </label></li>
          ))}
        </ul>
        <button className="btn-primary mt-2" onClick={valider}>Valider ({Object.values(choix).filter(Boolean).length} archivées, {Object.values(choix).filter(v => !v).length} refusées)</button>
      </>}
    </Bloc>
  )
}

function Report({ cle }) {
  const [d, setD] = useState(null), [bloque, setBloque] = useState(null), [etat, setEtat] = useState(null)
  const charger = useCallback(() => {
    api.get('/acquereurs/admin/report').then(r => { setD(r.data); setBloque(null) }).catch(e => { if (e.response?.status === 409) { setBloque(e.response.data.error); setD(null) } else err(e) })
    api.get('/acquereurs/admin/report/etat').then(r => setEtat(r.data)).catch(() => {})
  }, [])
  useEffect(() => { charger() }, [charger, cle])
  const telecharger = async () => { if (await telechargerReport()) charger() }
  const [res, setRes] = useState(null)
  const importerRetour = async (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    try {
      const r = await api.post('/acquereurs/admin/report/retour', { csv: await lireFichier(f) })
      setRes(r.data); messageRetour(r.data); charger()
    } catch (e) { err(e) }
  }
  return (
    <Bloc titre="Report dans Modelo" icon="file-down" aide="Comme pour l’opération anciens clients : je télécharge le fichier, je le donne à Exploration Modelo, puis j’importe son retour.">
      {bloque ? <p className="text-sm text-amber-800">{bloque}</p> : !d ? <p className="text-sm text-quai-muted animate-pulse">Chargement…</p> : d.fiches === 0 ? <p className="text-sm text-quai-muted">Rien à reporter.</p> : <>
        <p className="text-sm">{d.contacts} personnes, {d.fiches} lignes (une par fiche acquéreur), jusqu’au {jj(d.jusqu_a)}.</p>
        {/* Ce que ce fichier change dans Modelo, à relire avant de l'envoyer. */}
        {(d.reattributions?.length > 0 || d.archivages > 0) && (
          <details className="mt-2 rounded-lg bg-quai-light border border-quai-border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-quai-navy">Ce fichier demande {d.reattributions.length} réattribution{d.reattributions.length > 1 ? 's' : ''} de négociateur et {d.archivages} archivage{d.archivages > 1 ? 's' : ''} validé{d.archivages > 1 ? 's' : ''}</summary>
            <ul className="mt-1.5 text-xs text-quai-muted space-y-0.5">
              {d.reattributions.map(r => <li key={r.id_contact}>{r.prenom} {r.nom} (n° {r.id_contact}) : suivi par {r.vers}, sur le contact et sur ses recherches gardées</li>)}
            </ul>
          </details>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={telecharger}><Icon name="download" size="sm" /> Télécharger le fichier pour Exploration Modelo</button>
        </div>
      </>}
      {etat?.telechargement && (
        <p className={`text-xs mt-2 ${etat.en_attente_de_retour ? 'text-amber-800' : 'text-quai-muted'}`}>
          Dernier fichier téléchargé le {jj(etat.telechargement.le)}{etat.telechargement.par ? ` par ${etat.telechargement.par}` : ''} ({etat.telechargement.lignes} lignes){etat.en_attente_de_retour ? ' : son retour n’a pas encore été importé.' : '.'}
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-quai-border">
        <label className="btn-secondary inline-flex items-center gap-1.5 cursor-pointer"><Icon name="upload" size="sm" /> Importer le retour d’Exploration Modelo
          <input type="file" accept=".csv,.txt" className="hidden" onChange={importerRetour} /></label>
        <p className="text-[11px] text-quai-muted mt-1">Le fichier de report, avec la colonne « statut » remplie : reporté ou échec (et « motif_echec »). Les contacts reportés sortent de la liste ; ceux en échec y restent.</p>
        {res && <div className="text-sm mt-2">{res.reportes} reporté(s), {res.echecs} en échec{res.inconnus.length ? `, ${res.inconnus.length} inconnu(s)` : ''}.
          {res.sans_date?.length > 0 && <p className="text-xs text-amber-800 mt-1">{res.sans_date.length} contact(s) non marqué(s) : la colonne « jusqu_a » du fichier de retour est vide ou illisible. Demandez à Exploration Modelo de la laisser telle qu’elle était dans le fichier de report.</p>}
          {res.date_future?.length > 0 && <p className="text-xs text-amber-800 mt-1">{res.date_future.length} contact(s) non marqué(s) : la date « jusqu_a » est dans le futur.</p>}</div>}
        {/* Les échecs restent affichés tant qu'ils ne sont pas repassés. */}
        {etat?.echecs?.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-sm font-medium text-red-800">{etat.echecs.length} échec{etat.echecs.length > 1 ? 's' : ''} au dernier retour : ces personnes restent à reporter</p>
            <ul className="text-xs text-red-800 mt-1 space-y-0.5">{etat.echecs.map(m => <li key={m.id_contact}>{m.prenom} {m.nom} (n° {m.id_contact}) : {m.motif || 'sans motif'}</li>)}</ul>
          </div>
        )}
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
  const telecharger = async () => { if (await telechargerReport()) charger() }
  const importer = async (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    setEnvoi(true)
    try {
      const r = await api.post('/acquereurs/admin/report/retour', { csv: await lireFichier(f) })
      messageRetour(r.data)
      if (r.data.echecs) onDetail?.()
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
        </div>
      </div>
      {bloque
        ? <button onClick={onDetail} className="btn-primary btn-sm">Valider les archivages</button>
        : <button onClick={telecharger} disabled={!n} className="btn-primary btn-sm inline-flex items-center gap-1.5 disabled:opacity-40"><Icon name="download" size="sm" /> Télécharger{n ? ` (${n})` : ''}</button>}
      <label className={`btn-secondary btn-sm inline-flex items-center gap-1.5 cursor-pointer ${envoi ? 'opacity-40' : ''}`}>
        <Icon name="upload" size="sm" /> Importer le retour
        <input type="file" accept=".csv,.txt" className="hidden" onChange={importer} disabled={envoi} />
      </label>
      {onDetail && !bloque && <button onClick={onDetail} className="text-xs text-quai-muted underline py-2">Détail</button>}
    </div>
  )
}

// Ce que l'appelante a obtenu pour d'autres : un rendez-vous courtage pour
// Marine, une estimation à caler. Tant que ce n'est pas « transmis », la ligne
// reste en haut. `compact` : la version du Suivi, qui ne montre que ce qui
// attend (et rien du tout s'il n'y a rien).
export function Transmettre({ compact = false }) {
  const [d, setD] = useState(null), [tout, setTout] = useState(false)
  const charger = useCallback(() => api.get('/acquereurs/admin/transmettre').then(r => setD(r.data)).catch(() => setD({ panne: true })), [])
  useEffect(() => { charger() }, [charger])
  if (!d) return compact ? null : <Bloc titre="À transmettre" icon="arrow-right"><p className="text-sm text-quai-muted animate-pulse">Chargement…</p></Bloc>
  if (d.panne) return compact ? null : <Bloc titre="À transmettre" icon="arrow-right"><p className="text-sm text-red-700">Chargement impossible. <button className="underline" onClick={() => { setD(null); charger() }}>Réessayer</button></p></Bloc>
  const fait = (l) => api.post('/acquereurs/admin/transmettre', { id_contact: l.id_contact, type: l.type }).then(() => { toast.success('Noté comme transmis'); charger() }).catch(err)
  const vue = (o) => api.post(`/acquereurs/admin/oppositions/${o.id_contact}/vue`).then(() => { toast.success('Noté comme traité'); charger() }).catch(err)
  const lignes = [...d.marine, ...d.estimations]
  const attente = lignes.filter(l => l.pret && !l.transmis_le)
  const visibles = tout ? lignes : attente
  const ligne = (l) => (
    <li key={l.type + l.id_contact} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-sm text-quai-navy font-medium">{l.prenom} {l.nom} <span className="font-normal text-quai-muted">· {l.tel || 'sans numéro'}</span></span>
        <span className="block text-[11px] text-quai-muted">
          {l.type === 'MARINE' ? `Rendez-vous courtage pour Marine · ${l.pret ? 'client d’accord' : 'proposé, accord non donné'}`
            : `Estimation ${l.pret ? 'acceptée' : 'proposée'}${l.date_rdv ? `, rendez-vous le ${jj(l.date_rdv)}` : l.pret ? ', date à caler' : ''}${l.adresse ? ` · ${l.adresse}` : ''}`}
          {' '}· appel du {jj(l.horodatage)} par {l.madame_fichier}
        </span>
      </span>
      {l.transmis_le ? <span className="text-[11px] text-emerald-700">transmis le {jj(l.transmis_le)}{l.transmis_par ? ` par ${l.transmis_par}` : ''}</span>
        : l.pret ? <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => fait(l)}><Icon name="check-circle-2" size="sm" /> Transmis</button>
        : <span className="text-[11px] text-quai-muted">rien à transmettre</span>}
    </li>
  )
  const oppositions = d.oppositions?.length > 0 && (
    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
      <p className="text-sm font-medium text-red-800">{d.oppositions.length} personne{d.oppositions.length > 1 ? 's ont' : ' a'} demandé à ne plus être contactée{d.oppositions.length > 1 ? 's' : ''}, et figure{d.oppositions.length > 1 ? 'nt' : ''} dans une autre mission</p>
      <ul className="mt-1 divide-y divide-red-200/60">
        {d.oppositions.map(o => (
          <li key={o.id_contact} className="py-1.5 flex flex-wrap items-center gap-2 text-sm text-red-900">
            <span className="flex-1 basis-56">{o.prenom} {o.nom} · {o.tel} <span className="text-xs">→ fiche encore ouverte dans : {o.ou.join(', ')}</span></span>
            <button className="btn-secondary btn-sm" onClick={() => vue(o)}>C’est traité</button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-red-800 mt-1">Leurs fiches n’ont pas été modifiées : à voir avec Chrystelle ou Marine.</p>
    </div>
  )
  if (compact) {
    if (!attente.length && !oppositions) return null
    return (
      <div className="space-y-2">
        {attente.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-sm font-semibold text-quai-navy">{attente.length} à transmettre</p>
            <ul className="divide-y divide-amber-200/70">{attente.map(ligne)}</ul>
          </div>
        )}
        {oppositions}
      </div>
    )
  }
  return (
    <Bloc titre={`À transmettre (${attente.length})`} icon="arrow-right" aide="Ce que l’appelante a obtenu pour d’autres : les rendez-vous de courtage pour Marine, et les estimations à caler. Cliquez « Transmis » une fois que c’est fait.">
      {visibles.length === 0 ? <p className="text-sm text-quai-muted">{tout ? 'Rien pour l’instant.' : 'Rien n’attend.'}</p> : <ul className="divide-y divide-quai-border">{visibles.map(ligne)}</ul>}
      {lignes.length > attente.length && <button className="text-xs text-quai-muted underline mt-2 py-1" onClick={() => setTout(t => !t)}>{tout ? 'Ne montrer que ce qui attend' : `Voir aussi ce qui est transmis ou seulement proposé (${lignes.length - attente.length})`}</button>}
      {oppositions && <div className="mt-3">{oppositions}</div>}
    </Bloc>
  )
}

const NOMS_PARTIES = { accueil: 'Page d’accueil (texte de présentation)', '0': 'Ouverture', '1': 'Coordonnées', '2.1': 'Projet et motivation', '2.2': 'Critères', '2.3': 'Financement', '3': 'Vendre pour acheter', mandat: 'Le mandat de recherche', '4': 'Suite donnée', repondeur: 'Message sur le répondeur', sms: 'Modèle de SMS' }
function Scripts() {
  const [p, setP] = useState(null), [origine, setOrigine] = useState({})
  useEffect(() => { api.get('/acquereurs/admin/scripts').then(r => { setP(r.data.parties); setOrigine(Object.fromEntries(r.data.parties.map(x => [x.partie, x.texte]))) }).catch(err) }, [])
  const modifies = (p || []).filter(x => x.texte !== origine[x.partie])
  // Quitter la page avec un texte non enregistré : le navigateur prévient.
  useEffect(() => {
    if (!modifies.length) return
    const e = (ev) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', e); return () => window.removeEventListener('beforeunload', e)
  }, [modifies.length])
  if (!p) return <Bloc titre="Scripts et textes" icon="file-text"><p className="text-sm text-quai-muted animate-pulse">Chargement…</p></Bloc>
  const sauver = (x) => api.put(`/acquereurs/admin/scripts/${x.partie}`, { texte: x.texte }).then(() => { setOrigine(o => ({ ...o, [x.partie]: x.texte })); toast.success('Texte enregistré') }).catch(err)
  const toutSauver = async () => { for (const x of modifies) await sauver(x) }
  const num = (k) => ({ mandat: '4', '4': '5' }[k] ?? (/^\d/.test(k) ? k : null))
  return (
    <Bloc titre={`Scripts et textes (${p.filter(x => origine[x.partie]).length} rédigés sur ${p.length})`} icon="file-text" aide="Chaque texte s’affiche à l’écran dans sa partie de l’appel. Variables remplacées : {civilite}, {prenom}, {nom}.">
      {modifies.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-amber-900 flex-1">{modifies.length} texte{modifies.length > 1 ? 's' : ''} modifié{modifies.length > 1 ? 's' : ''}, pas encore enregistré{modifies.length > 1 ? 's' : ''}.</span>
          <button className="btn-primary btn-sm" onClick={toutSauver}>Tout enregistrer</button>
        </div>
      )}
      <div className="space-y-3">
        {p.map((x, i) => (
          <div key={x.partie} className="rounded-xl border border-quai-border overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2 bg-quai-light border-b border-quai-border">
              <span className="w-6 h-6 rounded-full bg-quai-navy text-quai-gold grid place-items-center text-[11px] font-semibold shrink-0">{num(x.partie) ?? <Icon name="file-text" size="sm" />}</span>
              <span className="text-sm font-medium text-quai-navy flex-1">{NOMS_PARTIES[x.partie]}</span>
              {x.texte !== origine[x.partie] ? <span className="text-[11px] text-amber-800">modifié, non enregistré</span>
                : x.texte ? <span className="text-[11px] text-emerald-700">rédigé</span> : <span className="text-[11px] text-quai-muted">à rédiger</span>}
            </div>
            <textarea aria-label={NOMS_PARTIES[x.partie]} className="w-full px-3 py-2.5 text-sm text-quai-text focus:outline-none focus:ring-2 focus:ring-inset focus:ring-quai-navy/40 min-h-[5rem] block" placeholder="Le texte que l’agent lit à cette étape…"
              value={x.texte} onChange={e => setP(l => l.map((y, j) => j === i ? { ...y, texte: e.target.value } : y))} />
            <div className="flex justify-end px-3 py-2 border-t border-quai-border">
              <button className="btn-secondary btn-sm" disabled={x.texte === origine[x.partie]} onClick={() => sauver(x)}>Enregistrer</button>
            </div>
          </div>
        ))}
      </div>
    </Bloc>
  )
}

// `section` : 'import' | 'report' | 'parametres' pour n'afficher qu'une
// partie (espace de l'admin, rangé par onglet). Sans elle : tout.
export default function AcqAdmin({ section = null, onUtilisateurs }) {
  const [cle, setCle] = useState(0)
  const [users, setUsers] = useState([])
  useEffect(() => { api.get('/acquereurs/admin/acces').then(r => setUsers(r.data.users)).catch(err) }, [])
  const rafraichir = () => setCle(k => k + 1)
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto espace-mission">
      {(!section || section === 'parametres') && <Acces users={users} onUtilisateurs={onUtilisateurs} />}
      {(!section || section === 'import') && <Import onFait={rafraichir} users={users} />}
      {(!section || section === 'report') && <Valider cle={cle} onFait={rafraichir} />}
      {(!section || section === 'report') && <Report cle={cle} />}
      {(!section || section === 'report') && <Transmettre />}
      {(!section || section === 'import') && <DejaVues cle={cle} onFait={rafraichir} />}
      {(!section || section === 'import') && <Sortir onFait={rafraichir} />}
      {(!section || section === 'import') && <Ecartes cle={cle} />}
      {(!section || section === 'import' || section === 'report') && <Essais cle={cle} onFait={rafraichir} />}
      {(!section || section === 'parametres') && <Scripts />}
      {(!section || section === 'parametres') && <Vider cle={cle} onFait={rafraichir} />}
    </div>
  )
}
