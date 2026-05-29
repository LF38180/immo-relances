import { icons } from 'lucide-react'

const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 }

// Alias : noms du code applicatif -> noms réels dans cette version de lucide-react
const ALIASES = {
  'x-circle': 'CircleX',
  'alert-triangle': 'TriangleAlert',
  'check-circle-2': 'CircleCheckBig',
}

/**
 * Icône SVG unique pour toute l'app (charte : stroke 1.75 cohérent).
 * @param {string} name - nom Lucide en kebab-case (ex: "phone-off") ou PascalCase
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl' (défaut md)
 * @param {string} label - si fourni, l'icône est annoncée aux lecteurs d'écran ; sinon aria-hidden
 */
export default function Icon({ name, size = 'md', label, className = '', strokeWidth = 1.75, ...rest }) {
  const aliased = ALIASES[name] || name
  const pascal = aliased.includes('-')
    ? aliased.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
    : aliased
  const LucideIcon = icons[pascal] || icons[aliased] || icons.Circle
  const px = SIZES[size] || size
  return (
    <LucideIcon
      width={px} height={px} strokeWidth={strokeWidth} className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      {...rest}
    />
  )
}
