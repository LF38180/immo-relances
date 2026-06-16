import { useRef, useEffect, useState, useCallback } from 'react'
import Icon from './ui/Icon'
import { sanitizeContenu } from '../utils/scriptContenu'

const BOUTONS = [
  { cmd: 'bold', icon: 'bold', label: 'Gras' },
  { cmd: 'italic', icon: 'italic', label: 'Italique' },
  { cmd: 'underline', icon: 'underline', label: 'Souligné' },
]

// Éditeur de texte enrichi minimal : gras / italique / souligné.
// value = HTML string, onChange(html) remonte le HTML brut (sanitize au save côté parent).
export default function RichTextEditor({ value, onChange }) {
  const ref = useRef(null)
  const [actifs, setActifs] = useState({ bold: false, italic: false, underline: false })

  // Initialise le contenu une seule fois (évite de casser la position du curseur en frappe).
  // Sanitize à l'injection : défense en profondeur si du HTML non nettoyé existait en base.
  useEffect(() => {
    const clean = sanitizeContenu(value || '')
    if (ref.current && ref.current.innerHTML !== clean) {
      ref.current.innerHTML = clean
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const majActifs = useCallback(() => {
    setActifs({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    })
  }, [])

  const exec = (cmd) => {
    document.execCommand(cmd, false, null)
    if (ref.current) onChange(ref.current.innerHTML)
    majActifs()
    if (ref.current) ref.current.focus()
  }

  const onInput = () => { if (ref.current) onChange(ref.current.innerHTML) }

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {BOUTONS.map(b => (
          <button
            key={b.cmd}
            type="button"
            aria-label={b.label}
            aria-pressed={actifs[b.cmd]}
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec(b.cmd)}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded border transition-colors ${
              actifs[b.cmd]
                ? 'bg-quai-gold/20 border-quai-gold text-quai-navy'
                : 'bg-white border-quai-border text-quai-muted hover:text-quai-navy hover:border-quai-gold/50'
            }`}
          >
            <Icon name={b.icon} size="sm" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Contenu du script"
        onInput={onInput}
        onKeyUp={majActifs}
        onMouseUp={majActifs}
        className="input resize-none min-h-[12rem] overflow-y-auto whitespace-pre-wrap text-left"
        suppressContentEditableWarning
      />
    </div>
  )
}
