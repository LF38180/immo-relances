import { useState } from 'react'
import Icon from './Icon'

// Champ de mot de passe avec un œil : un toucher montre ce qui est tapé, un
// second le masque à nouveau. S'utilise comme un <input> ordinaire.
// L'œil n'est pas dans l'ordre de tabulation : Tab passe du champ au bouton
// suivant, comme avant.
export default function ChampMotDePasse({ className = 'input', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-12`}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" tabIndex={-1} onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visible}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute inset-y-0 right-0 w-11 grid place-items-center text-quai-muted hover:text-quai-navy">
        <Icon name={visible ? 'eye-off' : 'eye'} size="md" />
      </button>
    </div>
  )
}
