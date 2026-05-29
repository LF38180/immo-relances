import Icon from './Icon'

const LABELS = { 1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Très élevé' }

export default function Stars({ potentiel = 3, size = 'sm' }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Potentiel : ${potentiel} sur 5 (${LABELS[potentiel] || ''})`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon key={i} name="star" size={size}
          className={i <= potentiel ? 'text-quai-gold' : 'text-quai-border'}
          fill={i <= potentiel ? 'currentColor' : 'none'} />
      ))}
    </span>
  )
}
