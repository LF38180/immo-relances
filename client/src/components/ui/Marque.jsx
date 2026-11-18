// Le pictogramme des logos ImmoRelances (novembre 2026), redessiné en CSS pour
// rester net à toutes les tailles : un carré, une lettre, et le petit carré
// taupe en bas à droite. « iR » pour l'appli, « E », « A », « C » pour les
// missions Estimés, Acquéreurs et Courtage.
//
// `clair` : carré blanc et lettre marine (sur fond foncé). Sinon carré marine
// et lettre blanche (sur fond clair). Les couleurs sont celles des logos.
export default function Marque({ lettre, taille = 28, clair = false, className = '' }) {
  return (
    <span aria-hidden="true"
      className={`relative inline-grid place-items-center shrink-0 font-display font-bold leading-none select-none ${clair ? 'bg-white text-quai-encre' : 'bg-quai-encre text-white'} ${className}`}
      style={{ width: taille, height: taille, fontSize: Math.round(taille * (String(lettre).length > 1 ? 0.42 : 0.52)) }}>
      {lettre}
      <span className="absolute right-0 bottom-0 bg-quai-taupe" style={{ width: Math.round(taille * 0.2), height: Math.round(taille * 0.2) }} />
    </span>
  )
}

// Le logo de l'appli en toutes lettres, pour les fonds foncés (menu de gauche).
export function LogoImmoRelances({ compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <Marque lettre="iR" taille={compact ? 32 : 36} clair />
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className="block font-display text-white text-[17px] tracking-tight"><span className="font-normal">Immo</span><span className="font-bold">Relances</span></span>
          <span className="block text-quai-taupe text-[8px] tracking-[0.2em] mt-1 whitespace-nowrap">LE QUAI DE L’IMMOBILIER</span>
        </span>
      )}
    </span>
  )
}
