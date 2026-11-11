import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'

// Fichiers : sur quoi chacun travaille.
//
// Un fichier est un ensemble de fiches à rappeler : « Fichier Estimés » (celui
// de toujours), « Fichier Acquéreurs », puis la base de chaque agent, découpée
// en blocs (contacts, estimés, acquéreurs, anciens clients, apporteurs…).
// Chaque agent ne voit que les fichiers qu'on lui ouvre ici. Rien n'est jamais
// effacé par cet écran : fermer un accès masque le fichier à la personne, ses
// fiches et ses appels restent.
export default function FichiersAdmin() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [nouveau, setNouveau] = useState(null)
  const [occupe, setOccupe] = useState(false)

  const charger = () => api.get('/admin/blocs').then(r => { setData(r.data); setErreur(null) })
    .catch(err => setErreur(err.messageLisible || 'Chargement impossible.'))
  useEffect(() => { charger() }, [])

  const enregistrer = async (id, champs, message) => {
    setOccupe(true)
    try { await api.put(`/admin/blocs/${id}`, champs); toast.success(message || 'Enregistré'); await charger() }
    catch (err) { toast.error(err.messageLisible || 'Enregistrement impossible') }
    finally { setOccupe(false) }
  }
  const creer = async () => {
    if (!nouveau?.libelle?.trim() || occupe) return
    setOccupe(true)
    try {
      await api.post('/admin/blocs', { libelle: nouveau.libelle.trim(), proprietaire_id: nouveau.proprietaire_id || null })
      toast.success('Fichier créé. Ouvrez-le maintenant aux personnes concernées.')
      setNouveau(null); await charger()
    } catch (err) { toast.error(err.messageLisible || 'Création impossible') }
    finally { setOccupe(false) }
  }

  if (erreur) return <div className="card text-sm text-quai-navy">{erreur} <button onClick={charger} className="underline">Réessayer</button></div>
  if (!data) return <div className="text-quai-muted text-sm animate-pulse">Chargement…</div>
  const nomDe = (id) => { const a = data.agents.find(x => x.id === id); return a ? `${a.prenom} ${a.nom}` : null }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="font-semibold text-quai-navy">Fichiers</h2>
        <button onClick={() => setNouveau({ libelle: '', proprietaire_id: '' })} className="btn-primary btn-sm inline-flex items-center gap-1.5">
          <Icon name="plus" size="sm" /> Nouveau fichier
        </button>
      </div>
      <p className="text-sm text-quai-muted mb-4">
        Chaque agent ne voit que les fichiers cochés à son nom : sa file d'appels, ses contacts, ses imports et son suivi.
        Un compte créé aujourd'hui n'a accès à aucun fichier tant que vous n'en cochez pas un ici.
      </p>

      {nouveau && (
        <div className="card mb-4 border-2 border-quai-gold/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">Nom du fichier</label>
              <input className="input" autoFocus placeholder="Fichier Acquéreurs" value={nouveau.libelle}
                onChange={e => setNouveau(n => ({ ...n, libelle: e.target.value }))} onKeyDown={e => e.key === 'Enter' && creer()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-quai-muted mb-1">À qui est-il ?</label>
              <select className="input" value={nouveau.proprietaire_id} onChange={e => setNouveau(n => ({ ...n, proprietaire_id: e.target.value }))}>
                <option value="">À l'agence (on choisit ensuite qui y travaille)</option>
                {data.agents.map(a => <option key={a.id} value={a.id}>Base personnelle de {a.prenom} {a.nom}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={creer} disabled={occupe || !nouveau.libelle.trim()} className="btn-primary">Créer</button>
            <button onClick={() => setNouveau(null)} className="btn-secondary">Annuler</button>
          </div>
        </div>
      )}

      <DansPlusieursFichiers />

      <div className="space-y-3">
        {data.blocs.map(b => <Fichier key={b.id} b={b} agents={data.agents} proprietaire={nomDe(b.proprietaire_id)} occupe={occupe} onEnregistrer={enregistrer} />)}
      </div>
    </div>
  )
}

// La même personne dans plusieurs fichiers (même téléphone ou même e-mail).
// L'application ne tranche pas et ne fusionne rien : elle le signale ici.
function DansPlusieursFichiers() {
  const [liste, setListe] = useState(null)
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => { api.get('/admin/doublons-fichiers').then(r => setListe(r.data)).catch(() => setListe(null)) }, [])
  if (!liste || liste.length === 0) return null
  return (
    <div className="card mb-4 border-2 border-quai-gold/60">
      <button onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
        className="w-full flex items-center justify-between gap-3 text-left min-h-[44px]">
        <span className="font-semibold text-quai-navy">
          {liste.length} personne{liste.length > 1 ? 's' : ''} présente{liste.length > 1 ? 's' : ''} dans plusieurs fichiers
        </span>
        <span className="text-sm text-quai-muted underline">{ouvert ? 'Masquer' : 'Voir'}</span>
      </button>
      <p className="text-sm text-quai-muted mt-1">
        Même téléphone ou même e-mail. Rien n'est fusionné ni bloqué : à vous de dire qui garde le contact,
        puis de supprimer la fiche en trop (elle part à la corbeille).
      </p>
      {ouvert && (
        <div className="mt-3 divide-y divide-quai-border">
          {liste.map((g, i) => (
            <div key={i} className="py-2.5">
              <div className="text-sm font-medium text-quai-navy">{g.personne || 'Sans nom'}{g.telephone ? ` · ${g.telephone}` : ''}</div>
              <ul className="mt-1 space-y-0.5">
                {g.fiches.map(f => (
                  <li key={f.id} className="text-sm text-quai-text">
                    {f.fichier}{f.proprietaire ? ` (base de ${f.proprietaire})` : ''}
                    <span className="text-quai-muted">
                      {f.suivi_par ? ` · suivi par ${f.suivi_par}` : ''}{f.cree_le ? ` · fiche du ${f.cree_le.slice(8, 10)}/${f.cree_le.slice(5, 7)}/${f.cree_le.slice(0, 4)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Fichier({ b, agents, proprietaire, occupe, onEnregistrer }) {
  const [d1, setD1] = useState(b.delai_sans_reponse_jours ?? '')
  const [d2, setD2] = useState(b.relance_sans_projet_jours ?? '')
  const [nom, setNom] = useState(b.libelle)
  const basculer = (id) => {
    const acces = b.acces.includes(id) ? b.acces.filter(x => x !== id) : [...b.acces, id]
    const a = agents.find(x => x.id === id)
    onEnregistrer(b.id, { acces }, b.acces.includes(id) ? `Fichier fermé à ${a?.prenom}` : `Fichier ouvert à ${a?.prenom}`)
  }
  const reglagesChanges = String(d1) !== String(b.delai_sans_reponse_jours ?? '') || String(d2) !== String(b.relance_sans_projet_jours ?? '') || nom.trim() !== b.libelle
  return (
    <div className={`card ${b.actif ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <span className="font-semibold text-quai-navy">{b.libelle}</span>
          <span className="text-sm text-quai-muted"> · {b.nb_contacts.toLocaleString('fr')} fiche{b.nb_contacts > 1 ? 's' : ''}</span>
          {proprietaire && <span className="text-sm text-quai-muted"> · base personnelle de {proprietaire}</span>}
          {!b.actif && <span className="text-sm text-quai-muted"> · désactivé</span>}
        </div>
        {b.id !== 1 && (
          <button disabled={occupe} onClick={() => {
              if (b.actif && !window.confirm(`Désactiver « ${b.libelle} » ? Il disparaîtra pour les personnes qui y travaillent. Rien n'est effacé, et vous pourrez le réactiver.`)) return
              onEnregistrer(b.id, { actif: !b.actif }, b.actif ? 'Fichier désactivé (rien n\'est effacé)' : 'Fichier réactivé')
            }}
            className="text-xs text-quai-muted underline min-h-[32px]">{b.actif ? 'Désactiver' : 'Réactiver'}</button>
        )}
      </div>

      <div className="text-xs font-medium text-quai-muted mb-1.5">Qui y travaille</div>
      {proprietaire
        ? <p className="text-sm text-quai-text mb-3">{proprietaire} seulement : c'est sa base.</p>
        : (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
            {agents.map(a => (
              <label key={a.id} className="inline-flex items-center gap-2 text-sm text-quai-text min-h-[44px] cursor-pointer">
                <input type="checkbox" className="w-4 h-4" checked={b.acces.includes(a.id)} disabled={occupe} onChange={() => basculer(a.id)} />
                {a.prenom} {a.nom}
              </label>
            ))}
            {agents.length === 0 && <span className="text-sm text-quai-muted">Aucun agent actif.</span>}
          </div>
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Nom</label>
          <input className="input" value={nom} onChange={e => setNom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Rappel après « pas de réponse » (jours)</label>
          <input className="input" type="number" min="1" max="365" placeholder="réglage général" value={d1} onChange={e => setD1(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-quai-muted mb-1">Rappel après « plus de projet » (jours)</label>
          <input className="input" type="number" min="1" max="3650" placeholder="réglage général" value={d2} onChange={e => setD2(e.target.value)} />
        </div>
      </div>
      {reglagesChanges && (
        <button disabled={occupe || !nom.trim()} className="btn-primary btn-sm mt-3"
          onClick={() => onEnregistrer(b.id, { libelle: nom.trim(), delai_sans_reponse_jours: d1, relance_sans_projet_jours: d2 })}>Enregistrer</button>
      )}
    </div>
  )
}

// Corbeille : les fiches supprimées ne sont plus détruites. Elles sont ici, avec
// leur historique d'appels, et se remettent en place d'un clic.
export function Corbeille() {
  const [fiches, setFiches] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)
  const charger = () => api.get('/contacts/corbeille').then(r => { setFiches(r.data); setErreur(null) })
    .catch(err => setErreur(err.messageLisible || 'La corbeille n\'a pas pu être lue.'))
  useEffect(() => { charger() }, [])
  const restaurer = async (corps, message) => {
    setOccupe(true)
    try { const r = await api.post('/contacts/corbeille/restaurer', corps); toast.success(`${r.data.restaures} fiche(s) ${message}`); await charger() }
    catch (err) { toast.error(err.messageLisible || 'Restauration impossible') }
    finally { setOccupe(false) }
  }
  if (erreur) return <div className="card mb-4 text-sm text-quai-navy">{erreur} <button onClick={charger} className="underline">Réessayer</button></div>
  if (!fiches) return null
  // Les fiches effacées d'un coup portent la même date : on les remet d'un coup.
  const lots = Object.entries(fiches.reduce((m, f) => ({ ...m, [f.supprime_le]: (m[f.supprime_le] || 0) + 1 }), {})).filter(([, n]) => n > 1)
  const quand = (iso) => new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="card mb-4">
      <h3 className="font-medium text-quai-navy mb-1">Corbeille · {fiches.length} fiche{fiches.length > 1 ? 's' : ''}</h3>
      <p className="text-sm text-quai-muted mb-3">Une fiche supprimée n'est plus détruite : elle est gardée ici avec tous ses appels, et peut être remise en place. Après un ré-import, ne remettez pas les anciennes fiches : elles feraient doublon.</p>
      {lots.map(([le, n]) => (
        <button key={le} disabled={occupe} onClick={() => restaurer({ supprime_le: le }, 'remises en place')} className="btn-secondary btn-sm mr-2 mb-2">
          Remettre les {n} fiches effacées le {quand(le)}
        </button>
      ))}
      {fiches.length === 0 ? <p className="text-sm text-quai-muted">La corbeille est vide.</p> : (
        <div className="max-h-72 overflow-y-auto border border-quai-border rounded-lg divide-y divide-quai-border">
          {fiches.slice(0, 200).map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-quai-navy font-medium">{[f.prenom, f.nom].filter(Boolean).join(' ')}</span>
                <span className="text-quai-muted"> · {f.ville || 'ville inconnue'} · {f.nb_relances} appel{f.nb_relances > 1 ? 's' : ''} · supprimée le {quand(f.supprime_le)}{f.supprime_par_nom ? ` par ${f.supprime_par_nom}` : ''}</span>
              </span>
              <button disabled={occupe} onClick={() => restaurer({ ids: [f.id] }, 'remise en place')} className="btn-secondary btn-sm flex-shrink-0">Remettre</button>
            </div>
          ))}
        </div>
      )}
      {fiches.length > 200 && <p className="text-xs text-quai-muted mt-2">Les 200 plus récentes sont affichées.</p>}
    </div>
  )
}
