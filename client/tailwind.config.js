export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Charte ImmoRelances : les couleurs des logos (novembre 2026). Avant, un
        // marine #0D0D2B et un or #C9A96E voisins mais différents : logos et
        // écrans ne s'accordaient pas tout à fait.
        quai: {
          navy:    '#080432',  // marine des logos
          navymd:  '#15104f',  // marine au survol
          navylt:  '#2a2470',  // marine clair
          gold:    '#B6A997',  // taupe des logos (accent)
          goldlt:  '#CBC1B2',  // taupe clair, au survol
          light:   '#F7F6F3',  // fond crème très clair
          border:  '#E2DDD6',  // bordure douce
          text:    '#1C1C1C',  // texte principal
          muted:   '#6B6660',  // texte secondaire
          // Les deux couleurs des logos ImmoRelances (novembre 2026), pour les
          // pictogrammes redessinés en CSS : elles doivent être celles des images.
          encre:   '#080432',  // marine des logos
          taupe:   '#B6A997',  // petit carré et mentions des logos
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
