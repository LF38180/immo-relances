import { useState, useEffect, useMemo } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import Icon from '../../components/ui/Icon'
import { useAuth } from '../../hooks/useAuth'

// Soirée des anciens clients du 3 décembre : qui inviter, ce qui est parti.
//
// Les invitations sont envoyées hors de l'appli, par vagues. Cet écran trie,
// exporte ceux qui n'ont encore rien reçu, puis reprend le fichier une fois
// l'envoi fait. L'export ne marque rien : seul le réimport note « envoyé ».
// Les règles du tri sont côté serveur (utils/opSoiree.js).

const COLS = ['id_modelo', 'civilite', 'nom', 'prenom', 'email', 'conseiller', 'type']
const TYPE = { PERSONNALISEE: 'Personnalisée', GENERIQUE: 'Générique' }
// Le courrier du président, pour trier les invitations génériques.
const COURRIER = { ENVOYE: 'Envoyé', NPAI: 'Revenu (NPAI)', NPAI_RENVOYE: 'Revenu (NPAI), renvoyé', NON_ENVOYE: 'Non envoyé' }
const COLS_GEN = [...COLS, 'courrier', 'deja_appele']
const avecCourrier = (l) => ({ ...l, courrier: COURRIER[l.courrier] || '', deja_appele: l.appele ? 'oui' : 'non' })
const echCsv = (v) => { const x = v == null ? '' : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x }
function telechargerCsv(nom, cols, lignes) {
  const csv = [cols.join(';'), ...lignes.map(l => cols.map(c => echCsv(l[c])).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nom; a.click(); URL.revokeObjectURL(url)
}
// CSV « ; » (ou « , ») avec guillemets, en objets. Les en-têtes sont ramenés
// en minuscules sans accents : un tableur qui renomme « Prénom » ne casse rien.
function lireCsv(texte) {
  const t = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const premiere = t.split('\n')[0] || ''
  const sep = (premiere.match(/;/g) || []).length >= (premiere.match(/,/g) || []).length ? ';' : ','
  const lignes = []; let cur = '', champ = [], guillemets = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '"') { if (guillemets && t[i + 1] === '"') { cur += '"'; i++ } else guillemets = !guillemets }
    else if (ch === sep && !guillemets) { champ.push(cur); cur = '' }
    else if (ch === '\n' && !guillemets) { champ.push(cur); lignes.push(champ); champ = []; cur = '' }
    else cur += ch
  }
  if (cur || champ.length) { champ.push(cur); lignes.push(champ) }
  const [entete, ...corps] = lignes.filter(l => l.some(x => x.trim()))
  if (!entete) return []
  const cles = entete.map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .map(k => (k === 'e_mail' || k === 'mail') ? 'email' : (k === 'type_d_invitation' || k === 'type_invitation') ? 'type' : k)
  return corps.map(l => Object.fromEntries(cles.map((k, i) => [k, (l[i] || '').trim()])))
}
const jourParis = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
const dateFr = (j) => j ? j.slice(0, 10).split('-').reverse().join('/') : ''
const s = (n) => n > 1 ? 's' : ''

// Pas d'invitation possible par mail : stop mail, pas d'adresse, ou adresse morte.
const PAR_TEL = (l) => l.statut === 'STOP_MAIL' || l.statut === 'SANS_EMAIL' || l.statut === 'MAIL_EN_ERREUR'

const LISTES = [
  { id: 'perso', label: 'À inviter : personnalisée', f: l => l.statut === 'A_INVITER' && l.type === 'PERSONNALISEE' },
  { id: 'gen', label: 'À inviter : générique', f: l => l.statut === 'A_INVITER' && l.type === 'GENERIQUE' },
  { id: 'invites', label: 'Personnes invitées', f: l => l.statut === 'INVITE' },
  { id: 'confirmer', label: 'À confirmer', f: l => l.a_confirmer },
  { id: 'tel', label: 'À inviter par téléphone ou SMS', f: l => PAR_TEL(l) },
  { id: 'erreurs', label: 'Mails revenus en erreur', f: l => !!l.erreur_mail },
  { id: 'meme', label: 'Même adresse qu’une autre fiche', f: l => l.statut === 'MEME_EMAIL' },
  { id: 'exclus', label: 'Pas d’invitation', f: l => l.statut === 'EXCLU' },
]

export default function SoireePage() {
  const { user } = useAuth()
  const estAdmin = user?.role === 'admin'
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [liste, setListe] = useState('perso')
  const [conseiller, setConseiller] = useState('')
  const [recherche, setRecherche] = useState('')
  const [apercu, setApercu] = useState(null)   // retour de simulation + lignes du fichier
  const [envoi, setEnvoi] = useState(false)
  const [reponses, setReponses] = useState(null)   // simulation des fichiers de réponses
  const [relance, setRelance] = useState(null)   // simulation des fichiers de relance
  const [erreurs, setErreurs] = useState(null)   // simulation du fichier des mails en erreur

  const charger = () => api.get('/operation/soiree')
    .then(r => { setData(r.data); setErreur(false); return r.data })
    .catch(() => { setErreur(true); return null })
  useEffect(() => { charger() }, [])

  const conseillers = useMemo(() =>
    [...new Set((data?.lignes || []).map(l => l.conseiller).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [data])
  const visibles = useMemo(() => {
    if (!data) return []
    const q = recherche.trim().toLowerCase()
    // Une recherche porte sur toutes les listes : on cherche une personne, pas une case.
    const f = q ? () => true : LISTES.find(x => x.id === liste).f
    return data.lignes.filter(l => f(l)
      && (!conseiller || l.conseiller === conseiller)
      && (!q || `${l.nom} ${l.prenom} ${l.email} ${l.id_modelo}`.toLowerCase().includes(q)))
  }, [data, liste, conseiller, recherche])

  // L'export relit le tri juste avant : un appel enregistré il y a une minute compte.
  // `courrier` (facultatif) : un fichier par cas, pour trois messages différents.
  const exporter = async (type, courrier = null) => {
    const d = await charger()
    if (!d) return toast.error('Export impossible')
    const lignes = d.lignes.filter(l => l.statut === 'A_INVITER' && l.type === type
      && (!courrier || (courrier === 'NPAI' ? l.courrier.startsWith('NPAI') : l.courrier === courrier)))
    if (!lignes.length) return toast('Personne à inviter dans cette liste')
    const suffixe = { ENVOYE: '-courrier-recu', NPAI: '-courrier-revenu', NON_ENVOYE: '-sans-courrier' }[courrier] || ''
    telechargerCsv(`soiree-invitations-${type === 'PERSONNALISEE' ? 'personnalisees' : 'generiques'}${suffixe}-${jourParis()}.csv`,
      type === 'GENERIQUE' ? COLS_GEN : COLS, type === 'GENERIQUE' ? lignes.map(avecCourrier) : lignes)
    toast.success(`${lignes.length} ligne${s(lignes.length)} exportée${s(lignes.length)}. Rien n’est marqué tant que le fichier n’est pas réimporté.`, { duration: 6000 })
  }
  const exporterListe = () => {
    const cols = [...COLS_GEN, 'statut', 'detail']
    telechargerCsv(`soiree-${liste}-${jourParis()}.csv`, cols, visibles.map(l => ({ ...avecCourrier(l), detail: detail(l, data.motifs) })))
  }

  const choisirFichier = (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    const lecteur = new FileReader()
    lecteur.onload = async () => {
      try {
        const lignes = lireCsv(String(lecteur.result))
        if (!lignes.length) return toast.error('Le fichier est vide')
        if (!('id_modelo' in lignes[0])) return toast.error('Colonne id_modelo introuvable. Réimportez le fichier exporté par l’appli.')
        setEnvoi(true)
        const r = await api.post('/operation/soiree/envoye', { lignes, simulation: true })
        setApercu({ ...r.data, lignes, fichier: f.name, date: jourParis() })
      } catch (e) { toast.error(e.messageLisible || 'Lecture du fichier impossible') }
      finally { setEnvoi(false) }
    }
    lecteur.readAsText(f, 'utf-8')
  }
  // Les fichiers de relance : les exports de l'appli (Excel ou CSV), plusieurs
  // d'un coup. La ligne d'en-tête est celle qui contient « id_modelo » : un
  // fichier retravaillé peut avoir un titre au-dessus.
  const lireRelance = async (f) => {
    let grille, feuille = ''
    if (/\.xlsx?$/i.test(f.name)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      feuille = wb.SheetNames[0] || ''
      grille = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })
    } else {
      const texte = await f.text(), sep = (texte.split('\n')[0].match(/;/g) || []).length >= (texte.split('\n')[0].match(/,/g) || []).length ? ';' : ','
      grille = texte.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.split(sep).map(x => x.replace(/^"|"$/g, '')))
    }
    const tete = grille.findIndex(l => l.some(c => String(c).trim().toLowerCase() === 'id_modelo'))
    if (tete < 0) throw new Error(`${f.name} : colonne id_modelo introuvable`)
    const cols = grille[tete].map(c => String(c).trim().toLowerCase())
    return grille.slice(tete + 1).map((l, i) => ({ ...Object.fromEntries(cols.map((c, k) => [c, String(l[k] ?? '').trim()]).filter(([c]) => c)), _fichier: f.name, _feuille: feuille, _ligne: tete + i + 2 }))
      .filter(l => l.id_modelo)
  }
  const choisirRelance = async (ev) => {
    const fichiers = [...(ev.target.files || [])]; ev.target.value = ''
    if (!fichiers.length) return
    setEnvoi(true)
    try {
      const parFichier = [], lignes = []
      for (const f of fichiers) { const l = await lireRelance(f); parFichier.push({ nom: f.name, lignes: l.length }); lignes.push(...l) }
      if (!lignes.length) return toast.error('Aucune ligne lisible')
      const date = relance?.date || jourParis()
      const r = await api.post('/operation/soiree/relance', { lignes, relance_le: date, simulation: true })
      setRelance({ ...r.data, lignes, date, fichiers: parFichier })
    } catch (e) { toast.error(e.messageLisible || e.message || 'Lecture des fichiers impossible') }
    finally { setEnvoi(false) }
  }
  const dateRelance = async (date) => {
    if (!relance || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    setEnvoi(true)
    try { const r = await api.post('/operation/soiree/relance', { lignes: relance.lignes, relance_le: date, simulation: true }); setRelance({ ...relance, ...r.data, date }) }
    catch (e) { toast.error(e.messageLisible || 'Vérification impossible') } finally { setEnvoi(false) }
  }
  const enregistrerRelance = async () => {
    setEnvoi(true)
    try {
      const r = await api.post('/operation/soiree/relance', { lignes: relance.lignes, relance_le: relance.date, fichier: relance.fichiers.map(f => f.nom).join(', ') })
      toast.success(`${r.data.acceptees} relance${s(r.data.acceptees)} enregistrée${s(r.data.acceptees)}`)
      setRelance(null); charger()
    } catch (e) { toast.error(e.messageLisible || 'Enregistrement impossible') } finally { setEnvoi(false) }
  }
  // Les réponses reçues par mail : ont dit oui, ont dit non, désinscrits.
  const choisirReponses = async (ev) => {
    const fichiers = [...(ev.target.files || [])]; ev.target.value = ''
    if (!fichiers.length) return
    setEnvoi(true)
    try {
      const parFichier = [], lignes = []
      for (const f of fichiers) { const l = await lireRelance(f); parFichier.push({ nom: f.name, lignes: l.length }); lignes.push(...l) }
      if (!lignes.length) return toast.error('Aucune ligne lisible')
      const date = jourParis()
      const r = await api.post('/operation/soiree/reponses', { lignes, recue_le: date, simulation: true })
      setReponses({ ...r.data, lignes, date, fichiers: parFichier })
    } catch (e) { toast.error(e.messageLisible || e.message || 'Lecture des fichiers impossible') }
    finally { setEnvoi(false) }
  }
  const enregistrerReponses = async () => {
    const d = reponses.desinscrits.length
    if (d && !window.confirm(`${d} personne${s(d)} désinscrite${s(d)} : stop mail et stop téléphone, plus aucun appel ni mail, et report dans Modelo.\n\nConfirmer ?`)) return
    setEnvoi(true)
    try {
      const r = await api.post('/operation/soiree/reponses', { lignes: reponses.lignes, recue_le: reponses.date, fichier: reponses.fichiers.map(f => f.nom).join(', ') })
      toast.success(`${r.data.acceptees} réponse${s(r.data.acceptees)} enregistrée${s(r.data.acceptees)}`)
      setReponses(null); charger()
    } catch (e) { toast.error(e.messageLisible || 'Enregistrement impossible') } finally { setEnvoi(false) }
  }
  const choisirErreurs = (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''
    if (!f) return
    const lecteur = new FileReader()
    lecteur.onload = async () => {
      try {
        const lignes = lireCsv(String(lecteur.result))
        if (!lignes.length) return toast.error('Le fichier est vide')
        if (!('email' in lignes[0])) return toast.error('Colonne email introuvable.')
        setEnvoi(true)
        const r = await api.post('/operation/soiree/erreurs', { lignes, simulation: true })
        setErreurs({ ...r.data, lignes, fichier: f.name })
      } catch (e) { toast.error(e.messageLisible || 'Lecture du fichier impossible') }
      finally { setEnvoi(false) }
    }
    lecteur.readAsText(f, 'utf-8')
  }
  const enregistrerErreurs = async () => {
    setEnvoi(true)
    try {
      const r = await api.post('/operation/soiree/erreurs', { lignes: erreurs.lignes, fichier: erreurs.fichier })
      const n = r.data.reconnues.length + r.data.inconnues.length
      toast.success(`${n} adresse${s(n)} en erreur enregistrée${s(n)}`, { duration: 6000 })
      setErreurs(null); setListe('erreurs'); charger()
    } catch (e) { toast.error(e.messageLisible || 'Enregistrement impossible') }
    finally { setEnvoi(false) }
  }
  // Les adresses mortes, avec leur fiche, pour les corriger dans Modelo.
  const exporterAdressesMortes = () => {
    const l = data.lignes.filter(x => x.erreur_mail && x.erreur_mail.definitif)
      .map(x => ({ id_modelo: x.id_modelo, civilite: x.civilite, nom: x.nom, prenom: x.prenom, conseiller: x.conseiller,
        email_en_erreur: x.erreur_mail.email, motif: x.erreur_mail.motif }))
    if (!l.length) return toast('Aucune adresse morte enregistrée')
    telechargerCsv(`soiree-adresses-mortes-pour-modelo-${jourParis()}.csv`, ['id_modelo', 'civilite', 'nom', 'prenom', 'conseiller', 'email_en_erreur', 'motif'], l)
  }
  const enregistrer = async () => {
    setEnvoi(true)
    try {
      const r = await api.post('/operation/soiree/envoye', { lignes: apercu.lignes, envoye_le: apercu.date, fichier: apercu.fichier })
      toast.success(`Vague ${r.data.vague} enregistrée : ${r.data.acceptees} invitation${s(r.data.acceptees)}`, { duration: 6000 })
      setApercu(null); setListe('invites'); charger()
    } catch (e) { toast.error(e.messageLisible || 'Enregistrement impossible') }
    finally { setEnvoi(false) }
  }
  const annulerVague = async (v) => {
    if (!window.confirm(`Annuler la vague ${v.vague} (${v.n} invitation${s(v.n)}) ?\n\nCes personnes reviendront dans les listes à inviter. Les lignes restent en base, marquées annulées.`)) return
    try { await api.post(`/operation/soiree/vagues/${v.vague}/annuler`); toast.success(`Vague ${v.vague} annulée`); charger() }
    catch (e) { toast.error(e.messageLisible || 'Annulation impossible') }
  }

  // Invitation faite par SMS ou par téléphone, pour qui n'a pas de mail utilisable.
  const noter = async (l, canal) => {
    try {
      await api.post(`/operation/soiree/contacts/${encodeURIComponent(l.id_modelo)}/invitation`, { canal })
      toast.success(`${l.prenom} ${l.nom} : invitation par ${canal === 'SMS' ? 'SMS' : 'téléphone'} notée`)
      charger()
    } catch (e) { toast.error(e.messageLisible || 'Échec') }
  }
  const defaire = async (l) => {
    if (!window.confirm(`Retirer l’invitation notée pour ${l.prenom} ${l.nom} ?\n\nLa fiche reviendra dans la liste à inviter. La ligne reste en base, marquée annulée.`)) return
    try { await api.post(`/operation/soiree/contacts/${encodeURIComponent(l.id_modelo)}/invitation/annuler`); charger() }
    catch (e) { toast.error(e.messageLisible || 'Échec') }
  }

  if (erreur) return <div className="p-6 text-sm text-quai-muted">Impossible de charger le suivi de la soirée. <button className="underline" onClick={charger}>Réessayer</button></div>
  if (!data) return <div className="p-6 text-sm text-quai-muted animate-pulse">Chargement…</div>
  const c = data.compteurs
  const nbListe = (id) => data.lignes.filter(LISTES.find(x => x.id === id).f).length
  const partout = !!recherche.trim()
  // Où sont passés les « oui » : le bilan en compte plus que l'export, on dit pourquoi.
  const oui = data.lignes.filter(l => l.oui)
  const ouiOu = [
    [oui.filter(l => l.statut === 'A_INVITER').length, 'à inviter par mail'],
    [oui.filter(l => l.statut === 'INVITE').length, oui.filter(l => l.statut === 'INVITE').length > 1 ? 'déjà invités' : 'déjà invité'],
    [oui.filter(PAR_TEL).length, 'à inviter par téléphone ou SMS'],
    [oui.filter(l => l.statut === 'MEME_EMAIL').length, 'avec l’adresse d’une autre fiche'],
    [oui.filter(l => l.statut === 'EXCLU').length, 'sans invitation'],
  ].filter(([n]) => n)

  return (
    <div className="flex-1 overflow-y-auto bg-quai-light" data-soiree>
      <div className="max-w-5xl mx-auto p-3 md:p-5 space-y-3 pb-24">
        <div>
          <h1 className="font-display font-bold text-xl text-quai-navy">Soirée du 3 décembre</h1>
          <p className="text-[13px] text-quai-muted leading-snug">
            Le tri se refait à chaque appel enregistré. Exporter ne marque rien : c’est le réimport du fichier qui note l’envoi.
          </p>
        </div>

        {/* 1. Exporter */}
        <div className="grid sm:grid-cols-2 gap-3">
          <BlocExport titre="Invitations personnalisées" aide="Joints au téléphone, ont dit oui."
            n={c.a_inviter.personnalisee} onExporter={() => exporter('PERSONNALISEE')} />
          <BlocExport titre="Invitations génériques" aide="Jamais joints, ou pas encore appelés."
            n={c.a_inviter.generique} onExporter={() => exporter('GENERIQUE')} />
        </div>
        {c.a_inviter.generique > 0 && c.a_inviter.generique_courrier && (
          <div className="bg-white border border-quai-border rounded-xl p-3 -mt-1" data-courrier>
            <div className="text-sm font-semibold text-quai-navy">Les génériques, selon le courrier du président</div>
            <div className="text-[12px] text-quai-muted leading-snug mb-2">
              Un fichier par cas, si le message change. {c.a_inviter.generique_jamais_appeles} pas encore appelé{s(c.a_inviter.generique_jamais_appeles)}.
              Après l’envoi, chaque fichier se réimporte ci-dessous, comme les autres.
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {[['ENVOYE', 'Courrier reçu', c.a_inviter.generique_courrier.envoye],
                ['NPAI', 'Courrier revenu (NPAI)', c.a_inviter.generique_courrier.npai + c.a_inviter.generique_courrier.npai_renvoye],
                ['NON_ENVOYE', 'Sans courrier', c.a_inviter.generique_courrier.non_envoye]].map(([k, label, n]) => (
                <button key={k} onClick={() => exporter('GENERIQUE', k)} disabled={!n}
                  className="text-sm px-3 py-2 rounded-lg border border-quai-navy text-quai-navy bg-white inline-flex items-center justify-between gap-2 min-h-[2.75rem] disabled:opacity-40">
                  <span className="text-left leading-tight">{label}</span>
                  <span className="inline-flex items-center gap-1.5 shrink-0"><b className="tabular-nums">{n}</b><Icon name="file-down" size="sm" /></span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-[13px] text-quai-text leading-snug -mt-1" data-oui>
          <b>{oui.length} « oui » au téléphone</b>{ouiOu.length > 0 && <> : {ouiOu.map(([n, t]) => `${n} ${t}`).join(', ')}</>}.
        </p>

        {/* 2. Réimporter */}
        <div className="bg-white border border-quai-border rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-quai-navy">Après l’envoi : réimporter le fichier</div>
              <div className="text-[12px] text-quai-muted leading-snug">
                Le même fichier, sans le modifier. Si un envoi n’est pas parti, ajoutez une colonne « envoye » avec « non » sur sa ligne.
              </div>
            </div>
            <label className={`text-sm px-4 py-2.5 rounded-lg bg-quai-navy text-white inline-flex items-center gap-2 cursor-pointer min-h-[2.75rem] ${envoi ? 'opacity-40 pointer-events-none' : ''}`}>
              <Icon name="file-up" size="sm" /> Choisir le fichier envoyé
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={choisirFichier} />
            </label>
          </div>
          {apercu && <Apercu a={apercu} setA={setApercu} envoi={envoi} onEnregistrer={enregistrer} />}
        </div>

        {/* 2 bis. Mails revenus en erreur */}
        <div className="bg-white border border-quai-border rounded-xl p-3" data-erreurs>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-quai-navy">Mails revenus en erreur</div>
              <div className="text-[12px] text-quai-muted leading-snug">
                Un fichier avec les colonnes email, motif, definitif. Ces personnes repassent « à inviter par téléphone ou SMS ».
                {c.adresses_en_erreur > 0 && <> {c.adresses_en_erreur} adresse{s(c.adresses_en_erreur)} enregistrée{s(c.adresses_en_erreur)}.</>}
              </div>
            </div>
            {(c.mail_en_erreur > 0 || c.adresses_en_erreur > 0) && (
              <button onClick={exporterAdressesMortes}
                className="text-xs px-3 py-2 rounded-lg border border-quai-border text-quai-navy inline-flex items-center gap-1.5 min-h-[2.75rem]">
                <Icon name="download" size="sm" /> Adresses mortes, pour Modelo
              </button>
            )}
            <label className={`text-sm px-4 py-2.5 rounded-lg border border-quai-navy text-quai-navy bg-white inline-flex items-center gap-2 cursor-pointer min-h-[2.75rem] ${envoi ? 'opacity-40 pointer-events-none' : ''}`}>
              <Icon name="file-up" size="sm" /> Choisir le fichier des erreurs
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={choisirErreurs} />
            </label>
          </div>
          {erreurs && <ApercuErreurs a={erreurs} envoi={envoi} onAbandonner={() => setErreurs(null)} onEnregistrer={enregistrerErreurs} />}
        </div>

        {/* 2 ter. Relance par mail */}
        <div className="bg-white border border-quai-border rounded-xl p-3" data-relance>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-quai-navy">Relance par mail</div>
              <div className="text-[12px] text-quai-muted leading-snug">
                Les fichiers envoyés à ceux qui n’avaient pas répondu (Excel ou CSV, plusieurs à la fois). L’invitation d’origine ne change pas.
                {c.relances?.total > 0 && <> <b className="text-quai-navy">{c.relances.total} personne{s(c.relances.total)} relancée{s(c.relances.total)}</b>
                  {' '}({c.relances.jours.map(j => `${j.n} le ${String(j.relance_le).split('-').reverse().join('/')}`).join(', ')}).
                  {' '}{c.relances.invites_non_relances} invité{s(c.relances.invites_non_relances)} par mail non relancé{s(c.relances.invites_non_relances)} : ils ont répondu, ou leur mail est en erreur.</>}
              </div>
            </div>
            <label className={`text-sm px-4 py-2.5 rounded-lg border border-quai-navy text-quai-navy bg-white inline-flex items-center gap-2 cursor-pointer min-h-[2.75rem] ${envoi ? 'opacity-40 pointer-events-none' : ''}`}>
              <Icon name="file-up" size="sm" /> Choisir les fichiers de relance
              <input type="file" multiple accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={choisirRelance} />
            </label>
          </div>
          {relance && <ApercuRelance a={relance} envoi={envoi} onDate={dateRelance} onAbandonner={() => setRelance(null)} onEnregistrer={enregistrerRelance} />}
        </div>

        {/* 2 quater. Réponses reçues par mail */}
        <div className="bg-white border border-quai-border rounded-xl p-3" data-reponses>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-quai-navy">Réponses reçues par mail</div>
              <div className="text-[12px] text-quai-muted leading-snug">
                Les fichiers « ont dit oui », « ont dit non » et « désinscrits » (Excel ou CSV, plusieurs à la fois). Un désinscrit passe en stop mail et stop téléphone.
                {c.reponses && (c.reponses.oui + c.reponses.non + c.reponses.desinscrits) > 0 && <> <b className="text-quai-navy">{c.reponses.oui} oui</b> ({c.reponses.personnes_attendues} personne{s(c.reponses.personnes_attendues)} attendue{s(c.reponses.personnes_attendues)} au moins),
                  {' '}<b className="text-quai-navy">{c.reponses.non} non</b>, <b className="text-quai-navy">{c.reponses.desinscrits} désinscrit{s(c.reponses.desinscrits)}</b>.
                  {c.reponses.contradictoires > 0 && <span className="text-amber-800"> {c.reponses.contradictoires} réponse{s(c.reponses.contradictoires)} qui se contredi{c.reponses.contradictoires > 1 ? 'sent' : 't'} (oui au téléphone, non par mail) : à regarder dans la liste.</span>}</>}
              </div>
            </div>
            <label className={`text-sm px-4 py-2.5 rounded-lg border border-quai-navy text-quai-navy bg-white inline-flex items-center gap-2 cursor-pointer min-h-[2.75rem] ${envoi ? 'opacity-40 pointer-events-none' : ''}`}>
              <Icon name="file-up" size="sm" /> Choisir les fichiers de réponses
              <input type="file" multiple accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={choisirReponses} />
            </label>
          </div>
          {reponses && <ApercuReponses a={reponses} envoi={envoi} onAbandonner={() => setReponses(null)} onEnregistrer={enregistrerReponses} />}
        </div>

        {/* 3. Où on en est */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Chiffre n={c.invites.total} label="Personnes invitées"
            sous={`${c.invites.personnalisee} perso. · ${c.invites.generique} génér.${c.invites.par_sms ? ` · ${c.invites.par_sms} par SMS` : ''}${c.invites.par_telephone ? ` · ${c.invites.par_telephone} par téléphone` : ''}${c.invites.meme_adresse ? ` · dont ${c.invites.meme_adresse} par l’adresse d’une autre fiche` : ''}`} />
          <Chiffre n={c.a_confirmer} label="À confirmer" sous="Générique reçue, puis oui au téléphone" />
          <Chiffre n={c.stop_mail + c.sans_email + (c.mail_en_erreur || 0)} label="Par téléphone ou SMS" sous={`${c.sans_email} sans e-mail · ${c.stop_mail} stop mail${c.mail_en_erreur ? ` · ${c.mail_en_erreur} mail${s(c.mail_en_erreur)} en erreur` : ''}`} />
          <Chiffre n={c.exclus.total} label="Pas d’invitation"
            sous={Object.entries(data.motifs).filter(([k]) => c.exclus[k]).map(([k, v]) => `${c.exclus[k]} ${v.charAt(0).toLowerCase() + v.slice(1)}`).join(' · ')} />
        </div>

        {c.vagues.length > 0 && (
          <div className="bg-white border border-quai-border rounded-xl p-3">
            <div className="text-sm font-semibold text-quai-navy mb-1.5">Vagues envoyées</div>
            <div className="divide-y divide-quai-border/60">
              {c.vagues.map(v => (
                <div key={v.vague} className={`py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] ${v.annulee_le ? 'opacity-50' : ''}`}>
                  <b className="text-quai-navy">Vague {v.vague}</b>
                  <span>{dateFr(v.envoye_le)}</span>
                  <span>{v.n} invitation{s(v.n)} ({v.personnalisees} perso., {v.generiques} génér.)</span>
                  <span className="text-quai-muted">{v.par}</span>
                  <span className="flex-1" />
                  {v.annulee_le ? <span className="text-quai-muted italic">annulée</span>
                    : estAdmin && <button onClick={() => annulerVague(v)} className="text-[12px] text-red-700 underline">Annuler cette vague</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Les listes */}
        <div className="bg-white border border-quai-border rounded-xl">
          <div className="p-3 flex flex-wrap items-center gap-2 border-b border-quai-border">
            <select value={liste} onChange={e => setListe(e.target.value)} disabled={partout}
              className="disabled:opacity-40 text-sm border border-quai-border rounded-lg px-2 py-2 bg-white text-quai-navy font-medium min-h-[2.75rem]" aria-label="Liste affichée">
              {LISTES.map(x => <option key={x.id} value={x.id}>{x.label} ({nbListe(x.id)})</option>)}
            </select>
            <select value={conseiller} onChange={e => setConseiller(e.target.value)}
              className="text-sm border border-quai-border rounded-lg px-2 py-2 bg-white min-h-[2.75rem]" aria-label="Conseiller">
              <option value="">Tous les conseillers</option>
              {conseillers.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Nom, e-mail…"
              className="text-sm border border-quai-border rounded-lg px-3 py-2 min-h-[2.75rem] flex-1 min-w-[9rem]" />
            <button onClick={exporterListe} disabled={!visibles.length}
              className="text-xs px-3 py-2 rounded-lg border border-quai-border text-quai-navy inline-flex items-center gap-1.5 min-h-[2.75rem] disabled:opacity-40">
              <Icon name="download" size="sm" /> Télécharger cette liste
            </button>
          </div>
          <div className="px-3 py-1.5 text-[12px] text-quai-muted">
            {visibles.length} personne{s(visibles.length)}{partout && ' · recherche dans toutes les listes'}
          </div>
          <div className="divide-y divide-quai-border/60">
            {visibles.slice(0, 300).map(l => (
              <div key={l.id_modelo} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium text-quai-navy">{l.civilite} {l.prenom} {l.nom}</span>
                <span className="text-[12px] text-quai-text break-all">{l.email || 'pas d’e-mail utilisable'}</span>
                <span className="text-[12px] text-quai-muted">{l.conseiller || 'non attribuée'}</span>
                <span className="text-[12px] text-quai-muted basis-full sm:basis-auto sm:ml-auto">
                  {partout && <b className="text-quai-navy font-medium">{(LISTES.find(x => x.f(l)) || {}).label} · </b>}{detail(l, data.motifs)}
                </span>
                {PAR_TEL(l) && (
                  <span className="basis-full flex flex-wrap items-center gap-2 mt-1" data-noter>
                    <span className="text-[12px] text-quai-muted">Invitation faite :</span>
                    <button onClick={() => noter(l, 'SMS')} className="text-xs px-3 py-2 rounded-lg border border-quai-navy text-quai-navy bg-white min-h-[2.5rem]">par SMS</button>
                    <button onClick={() => noter(l, 'TELEPHONE')} className="text-xs px-3 py-2 rounded-lg border border-quai-navy text-quai-navy bg-white min-h-[2.5rem]">par téléphone</button>
                  </span>
                )}
                {l.statut === 'INVITE' && l.invitation.vague === 0 && !l.invitation.via && (
                  <button onClick={() => defaire(l)} className="text-[12px] text-red-700 underline">Retirer</button>
                )}
              </div>
            ))}
            {!visibles.length && <div className="p-4 text-sm text-quai-muted">Personne dans cette liste.</div>}
            {visibles.length > 300 && <div className="p-3 text-[12px] text-quai-muted">Les 300 premières sont affichées. Le téléchargement contient toute la liste.</div>}
          </div>
        </div>

        {estAdmin && <Acces />}
      </div>
    </div>
  )
}

const REP = { OUI: (r) => `a confirmé par mail le ${dateFr(r.recue_le)}${r.participants ? ` (${r.participants} pers.)` : ''}`, NON: (r) => `a répondu non par mail le ${dateFr(r.recue_le)}`,
  DESINSCRIT: (r) => `désinscrit le ${dateFr(r.recue_le)} : stop mail et stop téléphone` }
const texteReponses = (l) => (l.reponses || []).map(r => ' · ' + REP[r.reponse](r)).join('') + (l.reponses_contradictoires ? ' · RÉPONSES QUI SE CONTREDISENT' : '')
function detail(l, motifs) { return detailSansReponses(l, motifs) + texteReponses(l) }
function detailSansReponses(l, motifs) {
  if (l.statut === 'INVITE') {
    const i = l.invitation
    const quand = i.vague === 0
      ? `par ${i.canal === 'SMS' ? 'SMS' : 'téléphone'} le ${dateFr(i.envoye_le)}${i.par ? ` (${i.par})` : ''}`
      : `vague ${i.vague} du ${dateFr(i.envoye_le)}`
    return `${TYPE[i.type]}, ${quand}${i.via ? ' (même adresse qu’une autre fiche)' : ''}`
      + (l.relance ? ` · relancé par mail le ${dateFr(l.relance.le)}${l.relance.n > 1 ? ` (${l.relance.n} relances)` : ''}` : '')
      + (l.erreur_mail ? (l.erreur_mail.definitif ? ` · après un mail revenu en erreur (${l.erreur_mail.email})` : ` · ${l.erreur_mail.motif.toLowerCase()} : à relancer par un autre moyen`) : '')
      + (l.a_confirmer ? ' · a dit oui depuis' : '') + (l.motif ? ` · depuis : ${motifs[l.motif].toLowerCase()}` : '')
  }
  if (l.statut === 'EXCLU') return motifs[l.motif] + (l.oui ? ' · avait dit oui à la soirée' : '')
  if (l.statut === 'MAIL_EN_ERREUR') {
    const e = l.erreur_mail
    return `Mail revenu en erreur (${e.email}) : ${e.motif.toLowerCase()}`
      + (e.envoi ? ` · envoi du ${dateFr(e.envoi.envoye_le)}, vague ${e.envoi.vague}` : ' · pas encore envoyé') + ` · ${TYPE[l.type].toLowerCase()}`
  }
  if (l.statut === 'STOP_MAIL') return `Stop mail · ${TYPE[l.type].toLowerCase()}`
  if (l.statut === 'SANS_EMAIL') return `Pas d’e-mail · ${TYPE[l.type].toLowerCase()}`
  if (l.statut === 'MEME_EMAIL') return `Couverte par la fiche ${l.meme_que}`
  return TYPE[l.type]
}

function BlocExport({ titre, aide, n, onExporter }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3 flex items-center gap-3">
      <div className="text-3xl font-display font-bold text-quai-navy tabular-nums min-w-[3.5rem] text-center">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-quai-navy">{titre}</div>
        <div className="text-[12px] text-quai-muted leading-snug">{aide} Pas encore invités.</div>
      </div>
      <button onClick={onExporter} disabled={!n}
        className="text-sm px-3 py-2.5 rounded-lg border border-quai-navy text-quai-navy bg-white inline-flex items-center gap-1.5 min-h-[2.75rem] disabled:opacity-40">
        <Icon name="file-down" size="sm" /> Exporter
      </button>
    </div>
  )
}

function Chiffre({ n, label, sous }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3">
      <div className="text-2xl font-display font-bold text-quai-navy tabular-nums">{n}</div>
      <div className="text-[13px] font-medium text-quai-navy">{label}</div>
      {sous && <div className="text-[11px] text-quai-muted leading-snug mt-0.5">{sous}</div>}
    </div>
  )
}

// Ce que le fichier des erreurs va changer, avant de l'enregistrer.
function ApercuReponses({ a, envoi, onAbandonner, onEnregistrer }) {
  return (
    <div className="mt-3 border-t border-quai-border pt-3 space-y-2" data-apercu-reponses>
      <div className="text-sm text-quai-navy">
        {a.fichiers.length} fichier{s(a.fichiers.length)}, {a.lignes.length} ligne{s(a.lignes.length)} : <b>{a.oui} oui</b> ({a.personnes_attendues} personne{s(a.personnes_attendues)} au moins),
        {' '}<b>{a.non} non</b>, <b>{a.desinscrits.length} désinscrit{s(a.desinscrits.length)}</b>
        {a.deja_enregistrees > 0 && <>, {a.deja_enregistrees} déjà enregistrée{s(a.deja_enregistrees)}</>}
        {a.rejetees.length > 0 && <>, <span className="text-red-700">{a.rejetees.length} refusée{s(a.rejetees.length)}</span></>}.
      </div>
      <div className="text-[12px] text-quai-muted">{a.fichiers.map(f => `${f.nom} (${f.lignes})`).join(' · ')}</div>
      {a.desinscrits.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-[12px] text-red-800">
          <b>Désinscrits : stop mail et stop téléphone. Ils sortent de toutes les files, et les deux stops partent dans Modelo.</b>
          {a.desinscrits.map(x => <div key={x.id_modelo}>{x.prenom} {x.nom} · {x.conseiller || 'non attribuée'}</div>)}
        </div>
      )}
      {a.ecarts.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-900 max-h-32 overflow-y-auto">
          <b>Avaient dit oui au téléphone, répondent non par mail (les deux resteront affichés) :</b>
          {a.ecarts.map(x => <div key={x.id_modelo}>{x.prenom} {x.nom} · {x.conseiller || 'non attribuée'}</div>)}
        </div>
      )}
      {a.rejetees.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-[12px] text-red-800 max-h-40 overflow-y-auto">
          <b>Lignes refusées (rien n’est enregistré pour elles) :</b>
          {a.rejetees.map((x, i) => <div key={i}>{x.fichier ? `${x.fichier}, ` : ''}ligne {x.ligne} · {x.prenom} {x.nom} · {x.motif}</div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <button onClick={onAbandonner} className="text-sm px-3 py-2.5 rounded-lg border border-quai-border text-quai-navy min-h-[2.75rem]">Abandonner</button>
        <button onClick={onEnregistrer} disabled={envoi || !a.acceptees}
          className="text-sm px-4 py-2.5 rounded-lg bg-quai-gold text-quai-navy font-semibold min-h-[2.75rem] disabled:opacity-40">
          {a.acceptees ? `Enregistrer ${a.acceptees} réponse${s(a.acceptees)}` : 'Rien à enregistrer'}
        </button>
      </div>
    </div>
  )
}

function ApercuRelance({ a, envoi, onDate, onAbandonner, onEnregistrer }) {
  return (
    <div className="mt-3 border-t border-quai-border pt-3 space-y-2" data-apercu-relance>
      <div className="text-sm text-quai-navy">
        {a.fichiers.length} fichier{s(a.fichiers.length)}, {a.lignes.length} ligne{s(a.lignes.length)} : <b>{a.acceptees} relance{s(a.acceptees)} à enregistrer</b>
        {' '}({a.personnalisees} personnalisée{s(a.personnalisees)}, {a.generiques} générique{s(a.generiques)})
        {a.deja_enregistrees > 0 && <>, {a.deja_enregistrees} déjà enregistrée{s(a.deja_enregistrees)} pour ce jour</>}
        {a.rejetees.length > 0 && <>, <span className="text-red-700">{a.rejetees.length} refusée{s(a.rejetees.length)}</span></>}.
      </div>
      <div className="text-[12px] text-quai-muted">{a.fichiers.map(f => `${f.nom} (${f.lignes})`).join(' · ')}</div>
      {a.alertes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-900 max-h-32 overflow-y-auto">
          <b>Relancées quand même, à savoir :</b>
          {a.alertes.map((x, i) => <div key={i}>{x.prenom} {x.nom} · {x.motif}</div>)}
        </div>
      )}
      {a.rejetees.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-[12px] text-red-800 max-h-40 overflow-y-auto">
          <b>Lignes refusées (rien n’est enregistré pour elles) :</b>
          {a.rejetees.map((x, i) => <div key={i}>{x.fichier ? `${x.fichier}, ` : ''}ligne {x.ligne} · {x.prenom} {x.nom} · {x.motif}</div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-quai-muted inline-flex items-center gap-2">Relance envoyée le
          <input type="date" value={a.date} onChange={e => onDate(e.target.value)} className="px-2 py-1.5 rounded-lg border border-quai-border text-sm text-quai-navy" /></label>
        <span className="flex-1" />
        <button onClick={onAbandonner} className="text-sm px-3 py-2.5 rounded-lg border border-quai-border text-quai-navy min-h-[2.75rem]">Abandonner</button>
        <button onClick={onEnregistrer} disabled={envoi || !a.acceptees}
          className="text-sm px-4 py-2.5 rounded-lg bg-quai-gold text-quai-navy font-semibold min-h-[2.75rem] disabled:opacity-40">
          {a.acceptees ? `Enregistrer ${a.acceptees} relance${s(a.acceptees)}` : 'Rien à enregistrer'}
        </button>
      </div>
    </div>
  )
}

function ApercuErreurs({ a, envoi, onAbandonner, onEnregistrer }) {
  const n = a.reconnues.length + a.inconnues.length
  return (
    <div className="mt-3 border-t border-quai-border pt-3 space-y-2" data-apercu-erreurs>
      <div className="text-sm text-quai-navy">
        <b>{a.fichier}</b> : {a.lues} adresse{s(a.lues)} lue{s(a.lues)}. {a.reconnues.length} retrouvée{s(a.reconnues.length)} dans l’opération
        ({a.definitives} adresse{s(a.definitives)} morte{s(a.definitives)}, {a.boites_pleines} boîte{s(a.boites_pleines)} pleine{s(a.boites_pleines)})
        {a.deja_connues > 0 && <>, {a.deja_connues} déjà enregistrée{s(a.deja_connues)}</>}
        {a.inconnues.length > 0 && <>, <span className="text-amber-800">{a.inconnues.length} inconnue{s(a.inconnues.length)}</span></>}
        {a.rejetees.length > 0 && <>, <span className="text-red-700">{a.rejetees.length} illisible{s(a.rejetees.length)}</span></>}.
      </div>
      {a.reconnues.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-quai-border p-2 text-[12px] text-quai-text max-h-56 overflow-y-auto">
          {a.reconnues.map((e, i) => e.fiches.map(f => (
            <div key={i + f.id_modelo}>
              <b>{f.prenom} {f.nom}</b> ({f.conseiller || 'non attribuée'}) · {e.email} · {e.motif}
              {' · '}{!e.definitif ? (f.invitee_par_mail ? 'reste invitée, avec une alerte' : 'adresse valable, rien ne change') : f.invitee_par_mail ? 'n’est plus comptée invitée' : f.statut === 'EXCLU' ? 'fiche sans invitation' : 'ne sera pas invitée par mail'}
            </div>
          )))}
        </div>
      )}
      {a.inconnues.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-900 max-h-32 overflow-y-auto">
          <b>Adresses qui ne correspondent à aucune fiche de l’opération (gardées quand même) :</b>
          {a.inconnues.map((e, i) => <div key={i}>{e.email} · {e.motif}</div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <button onClick={onAbandonner} className="text-sm px-3 py-2.5 rounded-lg border border-quai-border text-quai-navy min-h-[2.75rem]">Abandonner</button>
        <button onClick={onEnregistrer} disabled={envoi || !n}
          className="text-sm px-4 py-2.5 rounded-lg bg-quai-gold text-quai-navy font-semibold min-h-[2.75rem] disabled:opacity-40">
          {n ? `Enregistrer ${n} adresse${s(n)} en erreur` : 'Rien à enregistrer'}
        </button>
      </div>
    </div>
  )
}

// Ce que l'import va faire, avant de le faire.
function Apercu({ a, setA, envoi, onEnregistrer }) {
  return (
    <div className="mt-3 border-t border-quai-border pt-3 space-y-2" data-apercu>
      <div className="text-sm text-quai-navy">
        <b>{a.fichier}</b> : {a.acceptees} invitation{s(a.acceptees)} à enregistrer
        {a.acceptees > 0 && <> ({a.personnalisees} personnalisée{s(a.personnalisees)}, {a.generiques} générique{s(a.generiques)})</>}
        {a.non_envoyees > 0 && <>, {a.non_envoyees} marquée{s(a.non_envoyees)} « non envoyée{s(a.non_envoyees)} »</>}
        {a.rejetees.length > 0 && <>, <span className="text-red-700">{a.rejetees.length} ligne{s(a.rejetees.length)} refusée{s(a.rejetees.length)}</span></>}.
      </div>
      {a.rejetees.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-[12px] text-red-900 max-h-40 overflow-y-auto">
          {a.rejetees.map((r, i) => <div key={i}>Ligne {r.ligne} · {r.nom} {r.prenom} {r.id_modelo && `(${r.id_modelo})`} : {r.motif}</div>)}
        </div>
      )}
      {a.alertes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-900 max-h-40 overflow-y-auto">
          <b>Envoyées alors que la fiche est exclue depuis l’export :</b>
          {a.alertes.map((r, i) => <div key={i}>{r.nom} {r.prenom} : {r.motif}</div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-quai-text inline-flex items-center gap-2">
          Date d’envoi
          <input type="date" value={a.date} onChange={e => setA({ ...a, date: e.target.value })}
            className="border border-quai-border rounded-lg px-2 py-2 text-sm min-h-[2.75rem]" />
        </label>
        <span className="flex-1" />
        <button onClick={() => setA(null)} className="text-sm px-3 py-2.5 rounded-lg border border-quai-border text-quai-navy min-h-[2.75rem]">Abandonner</button>
        <button onClick={onEnregistrer} disabled={envoi || !a.acceptees}
          className="text-sm px-4 py-2.5 rounded-lg bg-quai-gold text-quai-navy font-semibold min-h-[2.75rem] disabled:opacity-40">
          {a.acceptees ? `Enregistrer la vague ${a.vague}` : 'Rien à enregistrer'}
        </button>
      </div>
    </div>
  )
}

// Qui voit cet onglet, en plus des administrateurs. Réglé par l'admin.
function Acces() {
  const [comptes, setComptes] = useState(null)
  const [ouvert, setOuvert] = useState(false)
  const charger = () => api.get('/operation/soiree/acces').then(r => setComptes(r.data.comptes)).catch(() => {})
  useEffect(() => { charger() }, [])
  if (!comptes) return null
  const avec = comptes.filter(x => x.acces_soiree)
  const basculer = async (x) => {
    try { await api.put(`/operation/soiree/acces/${x.id}`, { acces: !x.acces_soiree }); charger() }
    catch (e) { toast.error(e.messageLisible || 'Échec') }
  }
  return (
    <div className="bg-white border border-quai-border rounded-xl p-3" data-acces-soiree>
      <button onClick={() => setOuvert(v => !v)} className="w-full flex items-center gap-2 text-left">
        <Icon name="users" size="sm" className="text-quai-muted" />
        <span className="text-sm text-quai-navy flex-1">
          <b>Qui voit cet onglet :</b> les administrateurs{avec.length ? `, ${avec.map(x => x.prenom).join(', ')}` : ' seulement'}
        </span>
        <Icon name={ouvert ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted" />
      </button>
      {ouvert && (
        <div className="mt-2 grid sm:grid-cols-2 gap-x-4">
          {comptes.map(x => (
            <label key={x.id} className="flex items-center gap-2 py-1.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={!!x.acces_soiree} onChange={() => basculer(x)} className="w-4 h-4" />
              {x.prenom} {x.nom} <span className="text-quai-muted">({x.role})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
