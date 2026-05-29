import { useEffect, useRef } from 'react'
import Icon from './Icon'

/**
 * Modale accessible : role=dialog, aria-modal, fermeture Échap, focus trap,
 * focus restauré à la fermeture. Respecte prefers-reduced-motion (animation CSS).
 */
export default function Modal({ title, onClose, children, footer, size = 'lg' }) {
  const ref = useRef(null)
  const titleId = useRef('modal-title-' + Math.random().toString(36).slice(2)).current

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const node = ref.current
    const focusable = () => node.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable()[0]
    first?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); return }
      if (e.key === 'Tab') {
        const els = focusable()
        if (els.length === 0) return
        const firstEl = els[0], lastEl = els[els.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  const maxW = size === 'sm' ? 'max-w-md' : size === 'md' ? 'max-w-lg' : 'max-w-2xl'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-scrim"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} max-h-[90vh] flex flex-col modal-panel`}
      >
        <div className="flex items-center justify-between p-5 border-b border-quai-border">
          <h2 id={titleId} className="text-lg font-display font-semibold text-quai-navy">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-quai-muted hover:text-quai-navy rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-quai-navy">
            <Icon name="x" size="md" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-3 p-5 border-t border-quai-border">{footer}</div>}
      </div>
    </div>
  )
}
