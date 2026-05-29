import { CATEGORIES, STATUTS } from '../utils/constants'

export function CategorieBadge({ categorie }) {
  const c = CATEGORIES[categorie] || CATEGORIES.autre
  return <span className={`badge ${c.color}`}>{c.label}</span>
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.a_contacter
  return <span className={`badge ${s.color}`}>{s.label}</span>
}

export function ScoreBadge({ score }) {
  const color = score >= 70 ? 'bg-red-100 text-red-800' : score >= 50 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
  return <span className={`badge ${color} font-bold`}>{score}</span>
}

export function PotentielStars({ potentiel }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(potentiel)}{'☆'.repeat(5 - potentiel)}
    </span>
  )
}
