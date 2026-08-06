import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import Icon from '../components/ui/Icon'

/**
 * Écran bloquant affiché quand user.must_change_password est vrai :
 * l'utilisateur doit définir un nouveau mot de passe avant d'accéder à l'app.
 */
export default function ChangePasswordGate() {
  const { user, updateUser, logout } = useAuth()
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErreur('')
    if (!ancien) { setErreur('Saisissez votre mot de passe actuel.'); return }
    if (nouveau.length < 8) { setErreur('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return }
    if (nouveau !== confirmation) { setErreur('Les deux nouveaux mots de passe ne sont pas identiques.'); return }
    setSubmitting(true)
    try {
      await api.put('/auth/password', { ancien, nouveau })
      toast.success('Mot de passe modifié')
      updateUser({ must_change_password: 0 })
    } catch (err) {
      setErreur(err.response?.data?.error || 'Erreur lors du changement de mot de passe.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-quai-light flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6">
        <h1 className="text-xl font-display font-semibold text-quai-navy mb-1">Nouveau mot de passe requis</h1>
        <div className="w-10 h-0.5 bg-quai-gold mb-3" />
        <p className="text-sm text-quai-muted mb-5">
          Bonjour {user?.prenom}, pour sécuriser votre compte vous devez choisir un nouveau
          mot de passe avant d'accéder à l'application.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-quai-muted mb-1">Mot de passe actuel</label>
            <input type="password" className="input" value={ancien} autoFocus autoComplete="current-password"
              onChange={e => setAncien(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-quai-muted mb-1">Nouveau mot de passe (8 caractères minimum)</label>
            <input type="password" className="input" value={nouveau} autoComplete="new-password"
              onChange={e => setNouveau(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-quai-muted mb-1">Confirmez le nouveau mot de passe</label>
            <input type="password" className="input" value={confirmation} autoComplete="new-password"
              onChange={e => setConfirmation(e.target.value)} />
          </div>
          {erreur && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <Icon name="alert-triangle" size="sm" className="flex-shrink-0 mt-0.5" />
              <span>{erreur}</span>
            </div>
          )}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Enregistrement…' : 'Valider le nouveau mot de passe'}
          </button>
        </form>
        <button onClick={logout} className="mt-4 text-xs text-quai-muted hover:text-quai-navy inline-flex items-center gap-1.5">
          <Icon name="log-out" size="sm" /> Se déconnecter
        </button>
      </div>
    </div>
  )
}
