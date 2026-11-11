export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      {/* Le nom de l'écran est déjà dans la barre du haut : on ne le répète pas. */}
      <div>
        {title && <h1 className="text-2xl font-display font-semibold text-quai-navy">{title}</h1>}
        {title && <div className="mt-1.5 w-10 h-0.5 bg-quai-gold" />}
        {subtitle && <p className={`text-quai-muted text-sm ${title ? 'mt-2' : ''} first-letter:uppercase`}>{subtitle}</p>}
      </div>
      {children && <div className="flex gap-3 items-center flex-wrap">{children}</div>}
    </div>
  )
}
