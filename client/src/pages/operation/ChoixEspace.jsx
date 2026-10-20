import Icon from '../../components/ui/Icon'

// Écran d'aiguillage, montré uniquement aux personnes qui ont deux espaces :
// Marine (courtage) et Chrystelle (relances), toutes deux engagées dans
// l'opération. Les autres vont directement là où ils ont à faire.
//
// Leur espace de travail habituel n'est pas modifié : cet écran se place
// AVANT, il ne touche à rien de ce qui existe.
export default function ChoixEspace({ espaces, onChoisir, prenom }) {
  return (
    <div className="min-h-screen bg-quai-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="font-display text-xl font-bold text-quai-navy text-center">
          Bonjour {prenom}
        </h1>
        <p className="text-sm text-quai-muted text-center mt-1 mb-5">
          Où voulez-vous travailler ?
        </p>

        <div className="space-y-2.5">
          {espaces.map(e => (
            <button key={e.id} onClick={() => onChoisir(e.id)}
              className="w-full bg-white border border-quai-border rounded-xl p-4 text-left
                         hover:border-quai-gold hover:shadow-sm transition-all flex items-center gap-3">
              {e.image
                ? <img src={e.image} alt="" className="w-12 h-12 rounded shrink-0" />
                : <div className="w-12 h-12 rounded bg-quai-navy grid place-items-center shrink-0">
                    <Icon name={e.icon} size="md" className="text-quai-gold" />
                  </div>}
              <div className="min-w-0">
                <div className="font-semibold text-quai-navy">{e.titre}</div>
                <div className="text-xs text-quai-muted leading-snug">{e.aide}</div>
              </div>
              <Icon name="chevron-right" size="sm" className="text-quai-muted ml-auto shrink-0" />
            </button>
          ))}
        </div>

        <p className="text-[11px] text-quai-muted text-center mt-4">
          Vous pouvez passer de l’un à l’autre à tout moment.
        </p>
      </div>
    </div>
  )
}
