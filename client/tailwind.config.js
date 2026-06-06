export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Charte Le Quai de l'Immobilier
        quai: {
          navy:    '#0D0D2B',  // bleu marine foncé (carré logo)
          navymd:  '#1a1a4e',  // navy intermédiaire
          navylt:  '#2d2d6b',  // navy clair
          gold:    '#C9A96E',  // or/beige chaleureux (accent)
          goldlt:  '#e8c98a',  // or clair hover
          light:   '#F7F6F3',  // fond crème très clair
          border:  '#E2DDD6',  // bordure douce
          text:    '#1C1C1C',  // texte principal
          muted:   '#6B6660',  // texte secondaire
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
        // Titres : Jost (sans-serif géométrique, équivalent libre d'ITC Avant Garde / Century Gothic).
        display: ['Jost', 'Century Gothic', 'sans-serif'],
      },
    }
  },
  plugins: []
}
