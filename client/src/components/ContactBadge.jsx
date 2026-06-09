import { CATEGORIES, STATUTS } from '../utils/constants'
import Stars from './ui/Stars'
import Icon from './ui/Icon'
import { infoCadence } from '../utils/cadence'

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

export function CadenceBadge({ contact, jalons }) {
  const info = infoCadence(contact, jalons)
  if (!info) return null
  return (
    <span className="badge bg-quai-gold/15 text-quai-navy border border-quai-gold/40 inline-flex items-center gap-1">
      <Icon name="calendar-clock" size="sm" /> Estimation J+{info.jalonJours}
    </span>
  )
}
