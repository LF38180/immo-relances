import { CATEGORIES, STATUTS } from '../utils/constants'
import Stars from './ui/Stars'

export function CategorieBadge({ categorie }) {
  const c = CATEGORIES[categorie] || CATEGORIES.autre
  return <span className={`badge ${c.color}`}>{c.label}</span>
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.a_contacter
  return <span className={`badge ${s.color}`}>{s.label}</span>
}

export function ScoreBadge({ score }) {
  const color = score >= 70
    ? 'bg-quai-navy text-white'
    : score >= 50
      ? 'bg-quai-gold/20 text-quai-navy border border-quai-gold/40'
      : 'bg-quai-light text-quai-muted border border-quai-border'
  return <span className={`badge ${color} font-bold tabular-nums`}>{score}</span>
}

export function PotentielStars({ potentiel }) {
  return <Stars potentiel={potentiel} />
}
