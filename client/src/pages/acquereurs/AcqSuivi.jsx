import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import { Chiffre, Titre } from './ui'

// Tableau de bord (cahier, section 6). Pas de compteur « affaires conclues » :
// le délai se compte en mois, un compteur bloqué à zéro démobilise.
const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ilYa = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return jourLocal(d) }
const lundi = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return jourLocal(d) }
const DEBUT = '2000-01-01'
const ISSUES = [['JOINT', 'Joints', 'bg-emerald-500'], ['A_RAPPELER', 'À rappeler', 'bg-amber-400'], ['REPONDEUR', 'Répondeur', 'bg-quai-taupe'],
  ['PAS_DE_REPONSE', 'Pas de réponse', 'bg-quai-border'], ['SMS', 'SMS envoyés', 'bg-quai-gold'], ['MAIL', 'Mails envoyés', 'bg-quai-gold'],
  ['FAUX_NUMERO', 'Faux numéro', 'bg-red-300'], ['ERREUR_IDENTITE', 'Pas la bonne personne', 'bg-red-300'], ['DECEDE', 'Décédé', 'bg-red-300'],
  ['NE_PLUS_CONTACTER', 'Ne plus contacter', 'bg-red-500']]

export default function AcqSuivi({ onVoir }) {
  const [debut, setDebut] = useState(lundi())
  const [d, setD] = useState(null), [panne, setPanne] = useState(false)
  const charger = useCallback(() => { setPanne(false); setD(null)
    api.get('/acquereurs/suivi', { params: { debut } }).then(r => setD(r.data)).catch(() => setPanne(true)) }, [debut])
  useEffect(() => { charger() }, [charger])
  // Troisième valeur : le filtre de l'onglet Contacts que la case ouvre (admin).
  const voir = (f) => (onVoir && f ? () => onVoir(f) : undefined)
  const bouton = (actif) => `text-xs px-3 py-1.5 min-h-[2.75rem] md:min-h-0 rounded-full border transition-colors ${actif ? 'bg-quai-navy text-white border-quai-navy' : 'bg-white border-quai-border text-quai-navy hover:border-quai-gold'}`
  const PERIODES = [['Aujourd’hui', jourLocal(new Date())], ['Cette semaine', lundi()], ['30 derniers jours', ilYa(29)], ['Depuis le début', DEBUT]]
  const total = d ? ISSUES.reduce((n, [k]) => n + (d.issues?.[k] || 0), 0) : 0
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5 espace-mission">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODES.map(([l, v]) => <button key={l} className={bouton(debut === v)} onClick={() => setDebut(v)}>{l}</button>)}
        <label className="inline-flex items-center gap-2 text-xs text-quai-muted ml-auto">Depuis le
          <input type="date" value={debut === DEBUT ? '' : debut} onChange={e => e.target.value && setDebut(e.target.value)} className="input max-w-[11rem]" /></label>
      </div>
      {panne ? (
        <div className="bg-white border border-quai-border rounded-xl p-6 text-center">
          <p className="text-sm text-red-700 mb-3">Le suivi n’a pas pu être chargé.</p>
          <button className="btn-primary" onClick={charger}>Réessayer</button>
        </div>
      ) : !d ? <p className="text-sm text-quai-muted animate-pulse">Chargement…</p> : (<>
        <section>
          <Titre>L’activité</Titre>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Chiffre fort valeur={d.appels} libelle="appels passés" icon="phone" />
            <Chiffre valeur={d.traites} libelle="personnes traitées" icon="users" />
            <Chiffre valeur={d.joints} libelle="personnes jointes" icon="phone-call" />
            <Chiffre valeur={d.taux_joints == null ? '–' : `${d.taux_joints} %`} libelle="de personnes jointes" icon="trending-up" />
          </div>
        </section>

        {total > 0 && (
          <section>
            <Titre>Résultat des appels</Titre>
            <div className="bg-white border border-quai-border rounded-xl p-3 space-y-1.5">
              {ISSUES.filter(([k]) => d.issues?.[k]).map(([k, l, c]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0 text-quai-text truncate">{l}</span>
                  <span className="flex-1 h-2.5 bg-quai-light rounded-full overflow-hidden"><span className={`block h-full rounded-full ${c}`} style={{ width: `${Math.max(2, Math.round((d.issues[k] / total) * 100))}%` }} /></span>
                  <span className="w-16 text-right tabular-nums text-quai-navy font-medium">{d.issues[k]} <span className="text-quai-muted font-normal">· {Math.round((d.issues[k] / total) * 100)} %</span></span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <Titre>Ce que ça a donné</Titre>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
            <Chiffre valeur={d.requalifies} libelle="requalifiés" icon="check-circle-2" onClick={voir('REQUALIFIE')} />
            <Chiffre valeur={d.vendeurs} libelle="vendeurs repérés" icon="tag" onClick={voir('vendeurs')} />
            <Chiffre valeur={d.estimations_acceptees} libelle={`estimations calées (${d.estimations_proposees} proposées)`} icon="calendar-check" onClick={voir('est_acc')} />
            <Chiffre valeur={d.marine} libelle="rendez-vous courtage proposés" icon="users" onClick={voir('marine')} />
            <Chiffre valeur={d.mandats_acceptes} libelle={`mandats de recherche acceptés (${d.mandats_proposes} proposés)`} icon="file-check" onClick={voir('mandat_ok')} />
            <Chiffre valeur={d.archives} libelle="archivés (abandon, déjà acheté, ne plus contacter)" icon="file-check" />
            <Chiffre valeur={d.restants} libelle="jamais appelés, au total" icon="phone-off" onClick={voir('jamais')} />
          </div>
          {onVoir && <p className="text-[11px] text-quai-muted mt-1.5">Les chiffres comptent la période choisie. Un clic ouvre la liste des personnes dans cet état aujourd’hui, toutes périodes confondues.</p>}
        </section>

        {(d.par_personne?.length > 1 || d.par_jour?.length > 1) && (
          <section className="grid gap-4 md:grid-cols-2">
            {d.par_personne?.length > 1 && (
              <div>
                <Titre>Par personne</Titre>
                <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-quai-light text-left text-quai-muted"><th className="px-3 py-2 font-medium">Qui</th><th className="px-2 py-2 font-medium text-right">Appels</th><th className="px-2 py-2 font-medium text-right">Jointes</th><th className="px-3 py-2 font-medium text-right">Requalifiés</th></tr></thead>
                    <tbody className="divide-y divide-quai-border">
                      {d.par_personne.map(p => <tr key={p.qui}><td className="px-3 py-2 text-quai-navy">{p.qui}</td><td className="px-2 py-2 text-right tabular-nums">{p.appels}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.joints} <span className="text-quai-muted">({p.traites ? Math.round((p.joints / p.traites) * 100) : 0} %)</span></td><td className="px-3 py-2 text-right tabular-nums">{p.requalifies}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {d.par_jour?.length > 1 && (
              <div>
                <Titre>Par jour</Titre>
                <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-quai-light text-left text-quai-muted"><th className="px-3 py-2 font-medium">Jour</th><th className="px-2 py-2 font-medium text-right">Appels</th><th className="px-3 py-2 font-medium text-right">Jointes</th></tr></thead>
                    <tbody className="divide-y divide-quai-border">
                      {d.par_jour.map(j => <tr key={j.j}><td className="px-3 py-2 text-quai-navy first-letter:uppercase">{new Date(j.j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{j.appels}</td><td className="px-3 py-2 text-right tabular-nums">{j.joints}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </>)}
    </div>
  )
}
