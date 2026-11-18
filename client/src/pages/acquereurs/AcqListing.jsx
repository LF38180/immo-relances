import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import Papa from 'papaparse'
import api from '../../utils/api'
import Icon from '../../components/ui/Icon'
import { STATUTS as STATUTS_UI, StatutBadge, Pastille, Initiales } from './ui'

const AcqAppel = lazy(() => import('./AcqAppel'))

// Le Listing du Fichier Acquéreurs, comme celui de l'opération anciens
// clients : toutes les personnes, des filtres, une recherche, l'export CSV, et
// la fiche qui s'ouvre d'un clic.
const STATUTS = Object.fromEntries(Object.entries(STATUTS_UI).map(([k, v]) => [k, v.l]))
export const FILTRES = {
  '': { l: 'Tous', f: () => true },
  dans_file: { l: 'Dans la file', f: c => !c.exclu && !c.statut },
  jamais: { l: 'Jamais appelés', f: c => !c.exclu && !c.appels },
  ...Object.fromEntries(Object.entries(STATUTS).map(([k, l]) => [k, { l, f: c => c.statut === k }])),
  vendeurs: { l: 'Vendeurs repérés', f: c => c.vendeur }, est_prop: { l: 'Estimations proposées', f: c => c.estimation_proposee },
  est_acc: { l: 'Estimations calées', f: c => c.estimation_acceptee }, marine: { l: 'Courtage proposé', f: c => c.marine_proposee },
  marine_ok: { l: 'Courtage accepté', f: c => c.marine_accord },
  mandat: { l: 'Mandat proposé', f: c => !!c.mandat }, mandat_ok: { l: 'Mandat accepté', f: c => c.mandat === 'ACCEPTE' },
  a_reporter: { l: 'À reporter dans Modelo', f: c => c.a_reporter }, reporte: { l: 'Reportés dans Modelo', f: c => c.modelo_reporte_le && !c.a_reporter },
  hors_file: { l: 'Hors file', f: c => !!c.exclu },
}
const GROUPES = [['Tous', ['', 'dans_file', 'jamais']], ['Statut', Object.keys(STATUTS)],
  ['Obtenu', ['vendeurs', 'est_prop', 'est_acc', 'marine', 'marine_ok', 'mandat', 'mandat_ok']], ['Modelo', ['a_reporter', 'reporte']], ['Écartés', ['hors_file']]]
const jour = (d) => d ? new Date(String(d).replace(' ', 'T') + (String(d).includes('T') ? '' : 'Z')).toLocaleDateString('fr-FR') : ''

// `onOuvrir` : l'espace de l'admin ouvre la fiche en plein écran ; sans lui,
// la fiche s'ouvre à la place du Listing.
export default function AcqListing({ filtreInitial = '', onOuvrir = null }) {
  const [d, setD] = useState(null), [filtre, setFiltre] = useState(filtreInitial), [q, setQ] = useState(''), [ouvert, setOuvert] = useState(null)
  const charger = () => api.get('/acquereurs/admin/listing').then(r => setD(r.data)).catch(() => setD({ contacts: [], libelles: {} }))
  useEffect(() => { charger() }, [])
  useEffect(() => { setFiltre(filtreInitial) }, [filtreInitial])
  const visibles = useMemo(() => {
    if (!d) return []
    const m = q.trim().toLowerCase(), ch = m.replace(/\D/g, '')
    return d.contacts.filter(FILTRES[filtre]?.f || (() => true)).filter(c => !m
      || `${c.nom || ''} ${c.prenom || ''} ${c.commune || ''} ${c.email || ''}`.toLowerCase().includes(m)
      || (ch.length >= 3 && `${c.tel_portable || ''}${c.tel_fixe || ''}`.replace(/\D/g, '').includes(ch)))
  }, [d, filtre, q])
  if (ouvert) return (
    <Suspense fallback={<p className="p-6 text-sm text-quai-muted">Chargement…</p>}>
      <AcqAppel key={ouvert} id={ouvert} horsFile position="Depuis le Listing" revenir={{ libelle: 'Revenir au Listing', aller: () => { setOuvert(null); charger() } }}
        onSuivant={() => { setOuvert(null); charger() }} onRetour={() => { setOuvert(null); charger() }} />
    </Suspense>
  )
  if (!d) return <p className="p-6 text-sm text-quai-muted">Chargement…</p>
  const n = (k) => d.contacts.filter(FILTRES[k].f).length
  const exporter = () => {
    const lignes = visibles.map(c => ({ id_contact: c.id_contact, civilite: c.civilite, nom: c.nom, prenom: c.prenom, tel_portable: c.tel_portable,
      tel_fixe: c.tel_fixe, email: c.email, commune: c.commune, statut: STATUTS[c.statut] || (c.exclu ? 'hors file' : c.appels ? 'en cours' : 'jamais appelé'),
      hors_file: c.exclu ? (d.libelles[c.exclu] || c.exclu) : '', recherches: c.nb_fiches, gardees: c.fiches_gardees, archivees: c.fiches_archivees,
      appels: c.appels, dernier_appel: jour(c.dernier_appel_le), vendeur: c.vendeur ? 'oui' : '', estimation: c.estimation_acceptee ? 'calée' : c.estimation_proposee ? 'proposée' : '',
      courtage: c.marine_accord ? 'accepté' : c.marine_proposee ? 'proposé' : '',
      mandat_recherche: { ACCEPTE: 'accepté', REFUSE: 'refusé', A_REPROPOSER: 'à reproposer', PROPOSE: 'proposé' }[c.mandat] || '', ancien_conseiller: c.anciens_conseillers, traite_par: c.madame_fichier,
      modelo: c.a_reporter ? 'à reporter' : c.modelo_reporte_le ? `reporté le ${jour(c.modelo_reporte_le)}` : '' }))
    const blob = new Blob(['﻿' + Papa.unparse(lignes, { delimiter: ';' })], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `fichier-acquereurs-${(FILTRES[filtre]?.l || 'tous').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toLocaleDateString('fr-CA')}.csv`; a.click()
  }
  const puce = (k, vide) => `text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors ${filtre === k ? 'bg-quai-navy text-white border-quai-navy' : vide ? 'bg-transparent border-quai-border/60 text-quai-muted/60' : 'bg-white border-quai-border text-quai-navy hover:border-quai-gold'}`
  return (
    <div className="p-3 max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Icon name="search" size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-quai-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, commune, e-mail ou numéro…" className="input pl-8 min-h-[2.75rem] md:min-h-0" />
        </div>
        <button onClick={exporter} className="btn-secondary inline-flex items-center gap-1.5"><Icon name="download" size="sm" /> Export ({visibles.length})</button>
      </div>
      {GROUPES.map(([titre, cles]) => (
        <div key={titre} className="flex items-center gap-1.5 mb-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] uppercase tracking-wider text-quai-muted w-16 shrink-0">{titre}</span>
          {cles.map(k => { const nb = n(k); return (
            <button key={k} className={puce(k, !nb)} onClick={() => setFiltre(k)}>{FILTRES[k].l} <b className="font-semibold">{nb}</b></button>
          ) })}
        </div>
      ))}
      <ul className="bg-white border border-quai-border rounded-xl divide-y divide-quai-border mt-2">
        {visibles.slice(0, 300).map(c => (
          <li key={c.id_contact}>
            <button onClick={() => onOuvrir ? onOuvrir(c.id_contact) : setOuvert(c.id_contact)} className="w-full text-left px-3 py-2.5 hover:bg-quai-light flex items-start gap-3 transition-colors">
              <Initiales prenom={c.prenom} nom={c.nom} taille="sm" />
              <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-quai-navy font-medium">{c.civilite} {c.prenom} {c.nom}</span>
                <span className="text-[11px] text-quai-muted">{[c.tel_portable || c.tel_fixe, c.commune].filter(Boolean).join(' · ')}</span>
                <span className="ml-auto flex gap-1 flex-wrap justify-end">
                  <StatutBadge statut={c.statut} />
                  {c.exclu && <Pastille>hors file : {d.libelles[c.exclu] || c.exclu}</Pastille>}
                  {c.vendeur ? <Pastille ton="or">vendeur</Pastille> : null}
                  {c.estimation_acceptee ? <Pastille ton="vert">estimation</Pastille> : null}
                  {c.marine_proposee ? <Pastille ton="or">courtage</Pastille> : null}
                  {c.mandat ? <Pastille ton={c.mandat === 'ACCEPTE' ? 'vert' : 'or'}>mandat {c.mandat === 'ACCEPTE' ? 'accepté' : c.mandat === 'REFUSE' ? 'refusé' : c.mandat === 'A_REPROPOSER' ? 'à reproposer' : 'proposé'}</Pastille> : null}
                  {c.a_reporter ? <Pastille ton="ambre">à reporter</Pastille> : null}
                </span>
              </div>
              <div className="text-[11px] text-quai-muted mt-0.5">
                {c.nb_fiches} recherche{c.nb_fiches > 1 ? 's' : ''}{c.types_bien ? ` (${c.types_bien.replace(/,/g, ', ')})` : ''}
                {c.appels ? ` · ${c.appels} appel${c.appels > 1 ? 's' : ''}, le dernier le ${jour(c.dernier_appel_le)}` : ' · jamais appelé'}
                {c.anciens_conseillers ? ` · ancien conseiller : ${c.anciens_conseillers}` : ''}
              </div>
              </div>
            </button>
          </li>
        ))}
        {!visibles.length && <li className="p-4 text-sm text-quai-muted">Aucune personne ne correspond.</li>}
      </ul>
      {visibles.length > 300 && <p className="text-[11px] text-quai-muted text-center mt-2">300 premières affichées sur {visibles.length}. L’export contient tout.</p>}
    </div>
  )
}
