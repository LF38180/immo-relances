import Modal from './Modal'
import Icon from './Icon'

export default function ConfirmDialog({ title = 'Confirmer', message, confirmLabel = 'Confirmer', danger = true, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm"
      footer={(
        <>
          <button onClick={onCancel} className="btn-secondary">Annuler</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="flex gap-3">
        {danger && <Icon name="alert-triangle" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />}
        <p className="text-sm text-quai-text">{message}</p>
      </div>
    </Modal>
  )
}
