import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'

// Récapitulatif des appels passés, modifiable.
//
// On note vite entre deux appels, et on se rend compte après coup qu'on a
// oublié une date de rendez-vous ou mal orthographié une adresse. Sans cet
// écran, il faudrait rappeler la personne pour corriger une faute de frappe.

const LIBELLE_ISSUE = {
  JOINT: 'Joint', REPONDEUR: 'Répondeur', PAS_DE_REPONSE: 'Pas de réponse',
  FAUX_NUMERO: 'Faux numéro', A_RAPPELER: 'À rappeler', REFUS_FERME: 'Refus',
  ERREUR_IDENTITE: 'Pas la bonne personne', DECEDE: 'Décédé',
  SUIVI_ANCIEN_CONSEILLER: 'Parti avec son conseiller',
}

export default function RecapSession({ onFermer }) {
  const [appels, setAppels] = useState(null)
  const [periode, setPeriode] = useState('jour')
  const [edition, setEdition] = useState(null)   // id_modelo en cours de correction

  const charger = () => {
    const depuis = periode === 'jour' ? new Date().toISOString().slice(0, 10)
      : periode === 'semaine' ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      : null
    api.get('/operation/recap', { params: depuis ? { depuis } : {} })
      .then(r => setAppels(r.data.appels))
      .catch(() => toast.error('Chargement impossible'))
  }

  useEffect(() => { charger() }, [periode])

  const exporter = () => {
    if (!appels?.length) return toast.error('Rien à exporter')
    const colonnes = ['horodatage', 'conseiller', 'nom', 'prenom', 'commune', 'issue',
      'actualisation', 'date_rdv', 'adresse_maj', 'code_postal_maj', 'commune_maj',
      'soiree', 'panneau', 'projet', 'recommandation_nom', 'notes', 'id_modelo']
    const echappe = (v) => {
      const x = v == null ? '' : String(v)
      return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x
    }
    const csv = [colonnes.join(';'), ...appels.map(a => colonnes.map(c => echappe(a[c])).join(';'))].join('\n')
    // Le BOM fait ouvrir le fichier correctement dans Excel en français.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `appels-anciens-clients-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-[1250] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div className="bg-quai-light w-full md:max-w-3xl h-[90vh] md:h-auto md:max-h-[88vh]
                      rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="bg-white px-4 py-3 border-b border-quai-border flex items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-quai-navy text-sm">Mes appels</div>
            <div className="text-[11px] text-quai-muted">
              {appels ? `${appels.length} appel${appels.length > 1 ? 's' : ''}` : '…'}
            </div>
          </div>
          <button onClick={exporter}
            className="text-xs px-2.5 py-2 rounded-lg border border-quai-border text-quai-muted
                       hover:border-quai-gold hover:text-quai-navy inline-flex items-center gap-1.5">
            <Icon name="file-down" size="sm" /> Excel
          </button>
          <button onClick={onFermer} className="text-quai-muted hover:text-quai-navy p-1.5">
            <Icon name="x" size="sm" />
          </button>
        </div>

        <div className="bg-white px-4 pb-2 flex gap-1.5 border-b border-quai-border shrink-0">
          {[['jour', 'Aujourd’hui'], ['semaine', '7 jours'], ['tout', 'Tout']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriode(v)}
              className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                periode === v ? 'bg-quai-navy text-white border-quai-navy'
                              : 'border-quai-border text-quai-muted'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!appels && <p className="text-sm text-quai-muted text-center py-6">Chargement…</p>}
          {appels?.length === 0 && (
            <p className="text-sm text-quai-muted text-center py-6">Aucun appel sur cette période.</p>
          )}
          {appels?.map(a => (
            <Appel key={a.id} appel={a}
              enEdition={edition === a.id}
              onEditer={() => setEdition(edition === a.id ? null : a.id)}
              onEnregistre={() => { setEdition(null); charger() }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Appel({ appel: a, enEdition, onEditer, onEnregistre }) {
  const [vals, setVals] = useState({})
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (enEdition) setVals({
      adresse_maj: a.adresse_maj || '', code_postal_maj: a.code_postal_maj || '',
      commune_maj: a.commune_maj || '', actualisation: a.actualisation || '',
      date_rdv: a.date_rdv || '', soiree: a.soiree ?? '', panneau: a.panneau ?? '',
      recommandation_nom: a.recommandation_nom || '',
      recommandation_tel: a.recommandation_tel || '',
    })
  }, [enEdition])

  const enregistrer = async () => {
    setEnvoi(true)
    try {
      const envoyer = {}
      for (const [k, v] of Object.entries(vals)) envoyer[k] = v === '' ? null : v
      await api.put(`/operation/contacts/${a.id_modelo}/resultat`, envoyer)
      toast.success('Corrigé')
      onEnregistre()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Enregistrement impossible')
    } finally { setEnvoi(false) }
  }

  const quand = new Date(a.horodatage).toLocaleString('fr-FR',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-quai-navy text-sm">
              {a.civilite} {a.prenom} {a.nom}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              a.issue === 'JOINT' ? 'bg-emerald-100 text-emerald-800'
                : a.issue === 'REFUS_FERME' ? 'bg-red-100 text-red-800'
                : 'bg-quai-light text-quai-muted'}`}>
              {LIBELLE_ISSUE[a.issue] || a.issue}
            </span>
          </div>
          <div className="text-[11px] text-quai-muted">{quand} · {a.commune}</div>

          {/* Ce qui a été recueilli, en une ligne. */}
          <div className="text-[11px] text-quai-text mt-1 leading-snug space-y-0.5">
            {a.actualisation === 'ACCEPTEE' && (
              <div className="text-emerald-700">
                Actualisation calée{a.date_rdv ? ` le ${a.date_rdv}` : ''}
              </div>
            )}
            {a.adresse_maj && (
              <div>Adresse : {[a.adresse_maj, a.code_postal_maj, a.commune_maj].filter(Boolean).join(' ')}</div>
            )}
            {a.recommandation_nom && <div>Recommande : {a.recommandation_nom}</div>}
            {a.rappel_le && <div>Rappel : {new Date(a.rappel_le).toLocaleString('fr-FR')}</div>}
            {a.notes && <div className="text-quai-muted italic">{a.notes}</div>}
            {a.hors_cadre && (
              <div className="text-amber-700">Hors cadre : {a.hors_cadre.toLowerCase().replace(/_/g, ' ')}</div>
            )}
          </div>
        </div>

        <button onClick={onEditer}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-quai-border text-quai-muted
                     hover:border-quai-gold hover:text-quai-navy shrink-0">
          {enEdition ? 'Fermer' : 'Corriger'}
        </button>
      </div>

      {enEdition && (
        <div className="mt-3 pt-3 border-t border-quai-border space-y-2">
          <p className="text-[11px] text-quai-muted leading-snug">
            L’issue de l’appel ne se change pas — elle est horodatée. Ce qui a été
            recueilli, oui.
          </p>
          <Champ label="Adresse" value={vals.adresse_maj}
            onChange={v => setVals(s => ({ ...s, adresse_maj: v }))} />
          <div className="grid grid-cols-3 gap-2">
            <Champ label="Code postal" value={vals.code_postal_maj}
              onChange={v => setVals(s => ({ ...s, code_postal_maj: v }))} />
            <div className="col-span-2">
              <Champ label="Commune" value={vals.commune_maj}
                onChange={v => setVals(s => ({ ...s, commune_maj: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-quai-muted">Actualisation</span>
              <select value={vals.actualisation}
                onChange={e => setVals(s => ({ ...s, actualisation: e.target.value }))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                           min-h-[2.75rem] md:min-h-0 bg-white">
                <option value="">—</option>
                <option value="ACCEPTEE">Acceptée</option>
                <option value="A_REPROPOSER">À reproposer</option>
                <option value="REFUSEE">Refusée</option>
              </select>
            </label>
            <Champ label="Rendez-vous le" type="date" value={vals.date_rdv}
              onChange={v => setVals(s => ({ ...s, date_rdv: v }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Champ label="Recommande" value={vals.recommandation_nom}
              onChange={v => setVals(s => ({ ...s, recommandation_nom: v }))} />
            <Champ label="Son téléphone" type="tel" value={vals.recommandation_tel}
              onChange={v => setVals(s => ({ ...s, recommandation_tel: v }))} />
          </div>
          <button onClick={enregistrer} disabled={envoi}
            className="btn-primary w-full min-h-[2.75rem] disabled:opacity-50">
            {envoi ? 'Enregistrement…' : 'Enregistrer la correction'}
          </button>
        </div>
      )}
    </div>
  )
}

function Champ({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] text-quai-muted">{label}</span>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-lg border border-quai-border
                   min-h-[2.75rem] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-quai-navy/30" />
    </label>
  )
}
