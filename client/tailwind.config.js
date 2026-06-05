export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Charte officielle Le Quai de l'Immobilier :
        //   navy #080432 = TRANSACTION (vente) · taupe #B6A997 = GESTION LOCATIVE · orange #FA7A35 = BUSINESS CLUB
        //   (quai-gold conservé comme alias de quai-taupe pour ne pas casser l'existant)
        quai: {
          navy:    '#080432',  // bleu marine officiel (transaction)
          navymd:  '#1a1a4e',  // navy intermédiaire
          navylt:  '#2d2d6b',  // navy clair
          taupe:   '#B6A997',  // taupe officiel (gestion locative)
          taupelt: '#cabfb0',
          gold:    '#B6A997',  // alias taupe (compat usages existants)
          goldlt:  '#cabfb0',
          orange:  '#FA7A35',  // orange business club
          orangelt:'#fb9560',
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
