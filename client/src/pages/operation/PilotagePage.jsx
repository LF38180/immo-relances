import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import MarquerNpai from './MarquerNpai'

// Ce qu'on regarde le matin.
//
// L'indicateur principal est le nombre d'actualisations calées : c'est le seul
// qui se transforme en mandat. On ne compte pas les mandats — le délai entre
// l'appel et la signature se mesure en mois, et un compteur bloqué à zéro
// pendant six semaines démobilise une équipe.
export default function PilotagePage({ onAppeler }) {
  const [d, setD] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [npaiOuvert, setNpaiOuvert] = useState(false)

  useEffect(() => {
    api.get('/operation/pilotage')
      .then(r => setD(r.data))
      .catch(() => { setErreur(true); toast.error('Chargement impossible') })
  }, [])

  if (erreur) return <p className="p-6 text-quai-muted">Impossible de charger le suivi.</p>
  if (!d) return <p className="p-6 text-quai-muted">Chargement…</p>

  const r = d.resultats || {}
  const totalPortefeuille = d.avancement.reduce((s, a) => s + a.portefeuille, 0)
  const totalAppeles = d.avancement.reduce((s, a) => s + a.appeles, 0)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">

        {/* L'indicateur qui compte, en grand. */}
        <div className="bg-quai-navy text-white rounded-xl p-4">
          <div className="text-[11px] text-white/60 uppercase tracking-wide">Actualisations calées</div>
          <div className="font-display text-4xl font-bold text-quai-gold leading-none mt-1">
            {r.actualisations || 0}
          </div>
          <div className="text-[11px] text-white/60 mt-1.5">
            C’est le seul indicateur qui se transforme en mandat.
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tuile valeur={r.adresses_maj || 0} libelle="adresses récupérées" />
          <Tuile valeur={r.soiree || 0} libelle="inscrits à la soirée" />
          <Tuile valeur={r.courriers_renvoyes || 0} libelle="courriers renvoyés" />
          <Tuile valeur={r.panneau || 0} libelle="panneaux acceptés" />
        </div>

        <Section titre="Avancement" aide={`${totalAppeles} contacts appelés sur ${totalPortefeuille}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-quai-muted text-left">
                <th className="font-medium pb-1.5">Conseiller</th>
                <th className="font-medium pb-1.5 text-right w-16">Appelés</th>
                <th className="font-medium pb-1.5 text-right w-16">Total</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {d.avancement.map(a => {
                const pct = a.portefeuille ? Math.round((a.appeles / a.portefeuille) * 100) : 0
                return (
                  <tr key={a.conseiller} className="border-t border-quai-border/50">
                    <td className="py-1.5 text-quai-navy">{a.conseiller}</td>
                    <td className="py-1.5 text-right tabular-nums text-quai-navy font-medium">{a.appeles}</td>
                    <td className="py-1.5 text-right tabular-nums text-quai-muted">{a.portefeuille}</td>
                    <td className="py-1.5 pl-2">
                      <div className="h-1.5 bg-quai-light rounded-full overflow-hidden">
                        <div className="h-full bg-quai-gold rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        {d.rappels_du_jour.length > 0 && (
          <Section titre="Rappels à honorer aujourd’hui" aide="Un rendez-vous téléphonique manqué annule le bénéfice de l’appel précédent.">
            <ul className="text-xs space-y-1">
              {d.rappels_du_jour.map((x, i) => (
                <li key={i} className="flex justify-between gap-2 py-1 border-t border-quai-border/50 first:border-0">
                  <span className="text-quai-navy">{x.prenom} {x.nom}</span>
                  <span className="text-quai-muted">{x.conseiller}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.appels_par_jour.length > 0 && (
          <Section titre="Appels des sept derniers jours">
            <ul className="text-xs space-y-1">
              {d.appels_par_jour.map((x, i) => (
                <li key={i} className="flex justify-between gap-2 py-1 border-t border-quai-border/50 first:border-0">
                  <span className="text-quai-muted w-20 shrink-0">
                    {new Date(x.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-quai-navy flex-1 truncate">{x.conseiller}</span>
                  <span className="tabular-nums font-medium text-quai-navy">{x.n}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.refus_recents.length > 0 && (
          <Section titre="Refus récents" aide="Retirés définitivement, retrait horodaté.">
            <ul className="text-xs space-y-1">
              {d.refus_recents.map((x, i) => (
                <li key={i} className="flex justify-between gap-2 py-1 border-t border-quai-border/50 first:border-0">
                  <span className="text-quai-navy">{x.prenom} {x.nom}</span>
                  <span className="text-quai-muted">{x.conseiller}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Les courriers revenus. Les plis sont partis le 16 octobre et les
            retours arrivent pendant l'opération : il faut pouvoir recouper le
            nombre saisi avec la pile de plis, voir qui en porte, et ouvrir les
            fiches. */}
        <SectionNpai npai={d.npai} onSaisir={() => setNpaiOuvert(true)} onAppeler={onAppeler} />

        {d.a_dispatcher > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-snug">
            <Icon name="alert-triangle" size="sm" className="inline mr-1" />
            <b>{d.a_dispatcher}</b> fiche{d.a_dispatcher > 1 ? 's' : ''} sans conseiller.
            Elles ne sont dans la file d’appel de personne.
          </div>
        )}
      </div>

      {npaiOuvert && <MarquerNpai onFermer={() => setNpaiOuvert(false)} />}
    </div>
  )
}

// Les courriers revenus, en trois temps : combien, chez qui, et lesquels.
//
// Le total se recoupe avec la pile de plis sur le bureau — c'est la seule
// vérification possible, l'application ne sait pas combien de courriers sont
// partis. Le détail par jour de saisie sert à retrouver un lot entré deux
// fois : quarante retours saisis d'un coup le 29 octobre se voient.
function SectionNpai({ npai, onSaisir, onAppeler }) {
  const [ouvert, setOuvert] = useState(false)
  const [liste, setListe] = useState(null)
  const n = npai || {}

  // La liste n'est chargée qu'à l'ouverture : la plupart des matins, on ne
  // regarde que le nombre.
  useEffect(() => {
    if (!ouvert || liste) return
    api.get('/operation/npai')
      .then(r => setListe(r.data))
      .catch(() => toast.error('Liste des NPAI inaccessible'))
  }, [ouvert, liste])

  return (
    <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <Icon name="mail" size="md" className="text-quai-gold shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-quai-navy">
            Courriers revenus
            {!!n.total && <span className="ml-1.5 text-quai-gold">{n.total}</span>}
          </div>
          <div className="text-[11px] text-quai-muted leading-snug">
            {n.total
              ? "Ces clients n'ont rien reçu : l'adresse est à récupérer au téléphone."
              : 'Aucun retour saisi pour le moment.'}
          </div>
        </div>
        <button onClick={onSaisir}
          className="text-[11px] px-2.5 py-1.5 rounded-lg bg-quai-navy text-white shrink-0
                     hover:bg-quai-navy/90">
          Saisir
        </button>
      </div>

      {!!n.total && (
        <>
          {/* Le rapprochement avec la saisie : par jour, pour repérer un lot
              entré deux fois. */}
          {!!n.par_jour?.length && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {n.par_jour.map(j => (
                <span key={j.le}
                  className="text-[11px] px-2 py-1 rounded-lg bg-quai-light text-quai-muted">
                  {new Date(j.le + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  {' · '}<b className="text-quai-navy">{j.n}</b>
                </span>
              ))}
            </div>
          )}

          {n.a_dispatcher > 0 && (
            <div className="mx-3 mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200
                            rounded-lg px-2.5 py-2 leading-snug">
              <b>{n.a_dispatcher}</b> de ces fiches {n.a_dispatcher > 1 ? 'n\'ont' : 'n\'a'} pas
              de conseiller : personne n'ira chercher {n.a_dispatcher > 1 ? 'leur' : 'son'} adresse.
            </div>
          )}

          {/* Par conseiller : dix NPAI sur douze fiches, ce n'est plus une
              liste d'appels, c'est une liste d'adresses à retrouver. */}
          {!!n.par_conseiller?.length && (
            <div className="px-3 pb-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-quai-muted text-left">
                    <th className="font-medium pb-1.5">Conseiller</th>
                    <th className="font-medium pb-1.5 text-right w-20">Revenus</th>
                    <th className="font-medium pb-1.5 text-right w-24">Portefeuille</th>
                  </tr>
                </thead>
                <tbody>
                  {n.par_conseiller.map((c, i) => (
                    <tr key={i} className="border-t border-quai-border/60">
                      <td className="py-1.5 text-quai-navy">{c.conseiller || 'sans conseiller'}</td>
                      <td className="py-1.5 text-right font-semibold text-quai-navy tabular-nums">{c.npai}</td>
                      {/* Une fiche sans conseiller n'appartient à aucun
                          portefeuille : afficher « 0 » laisserait croire à un
                          compte faux. */}
                      <td className="py-1.5 text-right text-quai-muted tabular-nums">
                        {c.conseiller ? c.portefeuille : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={() => setOuvert(v => !v)}
            className="w-full px-3 py-2 text-[11px] text-quai-navy border-t border-quai-border
                       hover:bg-quai-light inline-flex items-center justify-center gap-1">
            <Icon name={ouvert ? 'chevron-up' : 'chevron-down'} size="sm" />
            {ouvert ? 'Masquer les fiches' : 'Voir les fiches'}
          </button>

          {ouvert && (
            <div className="border-t border-quai-border divide-y divide-quai-border/60">
              {!liste && <p className="text-xs text-quai-muted p-3">Chargement…</p>}
              {liste && (
                <div className="px-3 py-2 text-[11px] text-quai-muted">
                  {liste.adresse_recuperee} adresse{liste.adresse_recuperee > 1 ? 's' : ''} déjà
                  récupérée{liste.adresse_recuperee > 1 ? 's' : ''} sur {liste.total}.
                </div>
              )}
              {liste?.lignes.map(l => (
                <div key={l.id_modelo} className="px-3 py-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-quai-navy">
                      {l.nom} {l.prenom}
                      {l.adresse_maj && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100
                                         text-emerald-800 font-medium">adresse à jour</span>
                      )}
                    </div>
                    <div className="text-[11px] text-quai-muted">
                      {l.conseiller || 'sans conseiller'}
                      {l.commune && ` · ${l.commune}`}
                      {` · script ${l.script}`}
                      {l.appels > 0 && ` · ${l.appels} appel${l.appels > 1 ? 's' : ''}`}
                    </div>
                  </div>
                  {onAppeler && (
                    <button onClick={() => onAppeler(l)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-quai-border text-quai-navy
                                 shrink-0 hover:border-quai-gold inline-flex items-center gap-1">
                      <Icon name="phone" size="sm" /> Appeler
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Tuile({ valeur, libelle }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className="font-display text-2xl font-bold text-quai-navy leading-none tabular-nums">{valeur}</div>
      <div className="text-[11px] text-quai-muted mt-1 leading-snug">{libelle}</div>
    </div>
  )
}

function Section({ titre, aide, children }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className="text-sm font-semibold text-quai-navy">{titre}</div>
      {aide && <p className="text-[11px] text-quai-muted mt-0.5 mb-2 leading-snug">{aide}</p>}
      <div className={aide ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}
