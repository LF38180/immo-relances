import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'

// Mission Estimés › Report Modelo (22/11/2026).
//
// Première étape : relier chaque fiche de la mission à Modelo. Les fiches
// historiques n'ont jamais eu d'identifiant : Exploration Modelo les a
// rapprochées (contact, et un ou plusieurs biens par personne) et rend un
// fichier que l'on importe ici. On vérifie d'abord, on enregistre ensuite.
// Le fichier de report lui-même viendra après, sur ces identifiants.
const lireFichier = (f) => new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsText(f, 'utf-8') })
const s = (n) => n > 1 ? 's' : ''
const jour = (x) => x ? new Date(String(x).replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function Chiffre({ n, label, ton = '' }) {
  return (
    <div className="rounded-xl border border-quai-border bg-white px-3 py-2.5">
      <div className={`text-2xl font-display font-bold tabular-nums ${ton || 'text-quai-navy'}`}>{n}</div>
      <div className="text-[12px] text-quai-muted leading-snug">{label}</div>
    </div>
  )
}

export default function EstimesReport() {
  const [etat, setEtat] = useState(null)
  const [fichier, setFichier] = useState(null), [b, setB] = useState(null), [envoi, setEnvoi] = useState(false), [refus, setRefus] = useState(null)
  const charger = useCallback(() => api.get('/admin/estimes/rapprochement').then(r => setEtat(r.data)).catch(() => setEtat(null)), [])
  useEffect(() => { charger() }, [charger])

  const lancer = async (ecrire) => {
    if (!fichier) return toast.error('Choisissez le fichier de rapprochement.')
    setEnvoi(true); setRefus(null)
    try {
      const r = await api.post('/admin/estimes/rapprochement', { csv: fichier.texte, fichier: fichier.nom, ecrire }, { timeout: 120000 })
      setB(r.data); if (ecrire) { toast.success('Rapprochement enregistré'); charger() }
    } catch (e) { setB(null); setRefus(e.response?.data?.error || e.messageLisible || e.message) } finally { setEnvoi(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 md:pb-6 bg-quai-light" data-estimes-report>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">

        <section className="bg-white border border-quai-border rounded-2xl p-4 md:p-5">
          <h2 className="font-display font-semibold text-quai-navy text-lg leading-tight">Où en est le lien avec Modelo</h2>
          <p className="text-xs text-quai-muted mt-0.5 mb-3 leading-snug">
            Chaque fiche de la mission doit connaître son contact et ses biens dans Modelo avant de pouvoir y reporter les appels.
          </p>
          {!etat ? <p className="text-sm text-quai-muted animate-pulse">Chargement…</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Chiffre n={etat.fiches_mission} label="fiches dans la mission" />
                <Chiffre n={etat.fiches_avec_bien} label="reliées à Modelo" ton={etat.fiches_avec_bien ? 'text-emerald-700' : ''} />
                <Chiffre n={etat.fiches_sans_lien + etat.introuvables} label="sans lien pour l’instant" ton={etat.fiches_sans_lien + etat.introuvables ? 'text-amber-700' : ''} />
                <Chiffre n={etat.biens} label="biens Modelo" />
              </div>
              {etat.biens > 0 && (
                <ul className="text-[13px] text-quai-text mt-3 space-y-0.5">
                  <li>{etat.surs} rapprochement{s(etat.surs)} sûr{s(etat.surs)}, {etat.probables} probable{s(etat.probables)} à confirmer, {etat.introuvables} personne{s(etat.introuvables)} introuvable{s(etat.introuvables)}.</li>
                  <li>{etat.fiches_plusieurs_biens} personne{s(etat.fiches_plusieurs_biens)} avec plusieurs biens, {etat.fiches_deux_contacts} en double dans Modelo (deux contacts).</li>
                  <li className="text-quai-muted">Dernier import le {jour(etat.dernier_import)}.</li>
                </ul>
              )}
            </>
          )}
        </section>

        <section className="bg-white border border-quai-border rounded-2xl p-4 md:p-5">
          <h2 className="font-display font-semibold text-quai-navy text-lg leading-tight">Importer le rapprochement</h2>
          <p className="text-xs text-quai-muted mt-0.5 mb-3 leading-snug">
            Le fichier rendu par Exploration Modelo : l’export des contacts de la mission, complété des identifiants Modelo, une ligne par bien.
            À importer tel quel, sans le rouvrir dans un tableur. Les fiches et les appels de la mission ne sont pas modifiés.
          </p>
          <label className="block cursor-pointer max-w-md">
            <span className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${fichier ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-dashed border-quai-border bg-quai-light text-quai-muted hover:border-quai-gold'}`}>
              <Icon name={fichier ? 'file-check' : 'file-up'} size="sm" className="shrink-0" />
              <span className="truncate">{fichier ? fichier.nom : 'Choisir le fichier (CSV)'}</span>
            </span>
            <input type="file" accept=".csv" className="hidden" onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { setFichier({ nom: f.name, texte: await lireFichier(f) }); setB(null); setRefus(null) } }} />
          </label>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-secondary" disabled={envoi} onClick={() => lancer(false)}>{envoi ? 'Lecture du fichier…' : 'Vérifier sans enregistrer'}</button>
            <button className="btn-primary" disabled={envoi || !b || !b.simulation || !b.lignes} onClick={() => lancer(true)}>Enregistrer le rapprochement</button>
          </div>
          {refus && <div className="mt-3 text-sm rounded-xl border px-3 py-2.5 bg-red-50 border-red-200 text-red-800"><p className="font-medium">Fichier refusé, rien n’a été enregistré.</p><p className="mt-0.5">{refus}</p></div>}
          {b && (
            <div className={`mt-3 text-sm rounded-xl border px-3 py-2.5 ${b.simulation ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`} data-bilan-rapprochement>
              <p className={`font-medium ${b.simulation ? 'text-amber-900' : 'text-emerald-900'}`}>{b.simulation ? 'Vérification : rien n’est encore enregistré.' : 'Rapprochement enregistré.'}</p>
              <ul className="mt-1 space-y-0.5">
                <li>{b.lignes_lues} ligne{s(b.lignes_lues)} lue{s(b.lignes_lues)}, {b.lignes} retenue{s(b.lignes)}.</li>
                <li className="font-semibold">{b.fiches} fiche{s(b.fiches)} de la mission, {b.biens} bien{s(b.biens)} Modelo.</li>
                <li>{b.surs} sûr{s(b.surs)}, {b.probables} probable{s(b.probables)}, {b.introuvables} introuvable{s(b.introuvables)}.</li>
                <li>{b.fiches_un_bien} personne{s(b.fiches_un_bien)} avec un bien, {b.fiches_plusieurs_biens} avec plusieurs, {b.fiches_sans_bien} sans bien.</li>
                {b.fiches_deux_contacts > 0 && <li>{b.fiches_deux_contacts} personne{s(b.fiches_deux_contacts)} en double dans Modelo (deux contacts).</li>}
                <li className="text-quai-muted">{b.nouvelles} ligne{s(b.nouvelles)} nouvelle{s(b.nouvelles)}, {b.mises_a_jour} mise{s(b.mises_a_jour)} à jour{b.retirees > 0 ? `, ${b.retirees} bien${s(b.retirees)} absent${s(b.retirees)} de ce fichier (gardé${s(b.retirees)}, marqué${s(b.retirees)} retiré${s(b.retirees)})` : ''}.</li>
                {b.biens_partages?.length > 0 && <li className="text-amber-900">{b.biens_partages.length} bien{s(b.biens_partages.length)} rattaché{s(b.biens_partages.length)} à deux fiches de l’appli : {b.biens_partages.slice(0, 6).map(x => `${x.id_bien} (fiches ${x.fiches.join(' et ')})`).join(' ; ')}{b.biens_partages.length > 6 ? '…' : ''}</li>}
                {b.rejets.length > 0 && (
                  <li className="text-red-700 font-medium">{b.rejets.length} ligne{s(b.rejets.length)} refusée{s(b.rejets.length)} :
                    <ul className="font-normal mt-0.5 max-h-40 overflow-y-auto">
                      {b.rejets.slice(0, 40).map((x, i) => <li key={i}>Ligne {x.ligne}{x.id ? `, fiche ${x.id}` : ''}{x.id_bien ? `, bien ${x.id_bien}` : ''} : {x.motif}</li>)}
                      {b.rejets.length > 40 && <li>… et {b.rejets.length - 40} autres.</li>}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>

        <section className="bg-white border border-quai-border rounded-2xl p-4 md:p-5">
          <h2 className="font-display font-semibold text-quai-navy text-lg leading-tight">Le fichier de report : à venir</h2>
          <p className="text-sm text-quai-muted leading-relaxed mt-1">
            Une fois les fiches reliées, les appels de la mission seront reportés dans Modelo : une note de suivi sur le contact et sur ses biens,
            et la réattribution quand la personne a été jointe. Les réattributions et les archivages seront validés ici avant chaque report.
          </p>
        </section>
      </div>
    </div>
  )
}
