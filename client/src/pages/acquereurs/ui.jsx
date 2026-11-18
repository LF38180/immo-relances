import Icon from '../../components/ui/Icon'

// Petites briques visuelles du Fichier Acquéreurs et de l'espace des missions.
// Charte Le Quai : marine, or, crème. Les couleurs hors charte ne servent qu'à
// dire quelque chose : vert = acquis, ambre = à faire, rouge = arrêt.

export const STATUTS = {
  REQUALIFIE: { l: 'Requalifié', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  A_RAPPELER: { l: 'À rappeler', c: 'bg-amber-50 text-amber-900 border-amber-200' },
  EN_PAUSE: { l: 'En pause', c: 'bg-quai-light text-quai-navy border-quai-border' },
  ABANDONNE: { l: 'Abandonné', c: 'bg-quai-light text-quai-muted border-quai-border' },
  DEJA_ACHETE: { l: 'Déjà acheté', c: 'bg-quai-light text-quai-muted border-quai-border' },
  SANS_REPONSE: { l: 'Sans réponse (4 essais)', c: 'bg-quai-light text-quai-muted border-quai-border' },
  NE_PLUS_CONTACTER: { l: 'Ne plus contacter', c: 'bg-red-50 text-red-800 border-red-200' },
  ERREUR_IDENTITE: { l: 'Pas la bonne personne', c: 'bg-quai-light text-quai-muted border-quai-border' },
  DECEDE: { l: 'Décédé', c: 'bg-quai-light text-quai-muted border-quai-border' },
  FAUX_NUMERO: { l: 'Faux numéro', c: 'bg-amber-50 text-amber-900 border-amber-200' },
}

export function Pastille({ children, ton = 'neutre' }) {
  const c = { neutre: 'bg-quai-light text-quai-muted border-quai-border', or: 'bg-quai-gold/15 text-quai-navy border-quai-gold/40',
    vert: 'bg-emerald-50 text-emerald-800 border-emerald-200', ambre: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge: 'bg-red-50 text-red-800 border-red-200', marine: 'bg-quai-navy text-white border-quai-navy',
    // `clair` : posée sur un fond marine (en-tête de mission).
    clair: 'bg-white/10 text-white border-white/30' }[ton]
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${c}`}>{children}</span>
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut]
  if (!s) return null
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${s.c}`}>{s.l}</span>
}

// Les initiales dans un rond : un repère visuel stable pour chaque personne.
export function Initiales({ prenom, nom, taille = 'md', ton = 'creme' }) {
  const i = `${(prenom || '').trim()[0] || ''}${(nom || '').trim()[0] || ''}`.toUpperCase() || '?'
  const t = { sm: 'w-8 h-8 text-[11px]', md: 'w-10 h-10 text-xs', lg: 'w-12 h-12 text-sm' }[taille]
  const c = ton === 'marine' ? 'bg-quai-navy text-quai-gold' : 'bg-quai-light text-quai-navy border border-quai-border'
  return <span className={`${t} ${c} rounded-full grid place-items-center font-semibold shrink-0`} aria-hidden="true">{i}</span>
}

// Un chiffre et son libellé. `fort` : le chiffre qui compte sur l'écran.
// `detail` : une ligne de précision sous le libellé. `alerte` : le chiffre
// passe en ambre (quelque chose à faire). Cliquable : un petit chevron le dit.
export function Chiffre({ valeur, libelle, icon, fort, onClick, detail, alerte }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`text-left rounded-xl border p-3 w-full transition-all ${fort ? 'bg-quai-navy border-quai-navy text-white' : 'bg-white border-quai-border'} ${onClick ? 'hover:border-quai-gold hover:shadow-sm cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`text-3xl font-display font-semibold leading-none ${fort ? 'text-quai-gold' : alerte ? 'text-amber-700' : 'text-quai-navy'}`}>{valeur ?? '–'}</div>
        {icon && <Icon name={icon} size="sm" className={fort ? 'text-white/50' : 'text-quai-taupe'} />}
      </div>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <div className={`text-xs leading-snug min-w-0 ${fort ? 'text-white/80' : 'text-quai-muted'}`}>
          {libelle}
          {detail && <span className="block mt-0.5 opacity-80">{detail}</span>}
        </div>
        {onClick && <Icon name="chevron-right" size={12} className={`shrink-0 ${fort ? 'text-white/50' : 'text-quai-taupe'}`} />}
      </div>
    </Tag>
  )
}

export const Titre = ({ children }) => (
  <h2 className="flex items-center gap-2 text-[11px] font-semibold text-quai-muted uppercase tracking-wider mb-2">
    <span className="w-4 h-0.5 bg-quai-gold" aria-hidden="true" />{children}
  </h2>
)

// Une carte de section : pictogramme, titre, phrase d'aide, puis le contenu.
// Recopiée de l'administration des Acquéreurs pour servir aux autres écrans.
export function Bloc({ titre, icon, aide, children }) {
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
