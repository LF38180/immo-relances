import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.email, form.password)
    } catch (err) {
      if (err.response) {
        // Le serveur a répondu (ex. 401) : identifiants invalides
        toast.error(err.response.data?.error || 'Email ou mot de passe incorrect')
      } else {
        // Pas de réponse : serveur injoignable (souvent le backend non démarré)
        toast.error('Serveur injoignable. Vérifiez que l\'application est bien démarrée (npm run dev / start.sh).')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Panneau identité agence — colonne gauche en desktop, bandeau haut en mobile */}
      <div className="bg-quai-navy flex flex-col items-center justify-center px-6 py-10 lg:py-12 lg:p-12 lg:w-1/2 relative overflow-hidden">
        {/* Motif décoratif */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute -top-6 -left-6 w-48 h-48 rounded-full border border-white" />
          <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full border border-white" />
        </div>

        <div className="relative z-10 text-center">
          <img
            src="https://img.netty.fr/logo/company55382byt/2/logo_web.png"
            alt="Le Quai de l'Immobilier"
            className="h-24 lg:h-28 w-auto object-contain mx-auto mb-5 lg:mb-6"
          />
          <h1 className="font-display text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Immo<span className="text-quai-gold">Relances</span>
          </h1>
          <p className="text-white/60 text-sm italic max-w-xs mx-auto leading-relaxed mt-5">
            "Le symbole d'un départ, d'une rencontre, d'une destination"
          </p>
          <div className="mt-6 lg:mt-8 w-12 h-0.5 bg-quai-gold mx-auto" />
          <p className="text-quai-gold text-xs mt-4 tracking-widest uppercase">
            Gestion des relances
          </p>
        </div>
      </div>

      {/* Panneau formulaire */}
      <div className="flex-1 flex items-center justify-center p-8 bg-quai-light">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-semibold text-quai-navy">Connexion</h2>
            <div className="mt-2 w-10 h-0.5 bg-quai-gold" />
            <p className="text-quai-muted text-sm mt-3">Accédez à votre espace de relances</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-quai-navy uppercase tracking-wider mb-1.5">
                Adresse email
              </label>
              <input
                type="email" required autoFocus
                className="input"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="prenom.nom@lequai-immobilier.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-quai-navy uppercase tracking-wider mb-1.5">
                Mot de passe
              </label>
              <input
                type="password" required
                className="input"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg mt-2 tracking-wide"
            >
              {loading ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-white rounded-xl border border-quai-border text-xs text-quai-muted">
            <p className="font-semibold text-quai-navy mb-2">Comptes de démonstration</p>
            <div className="space-y-1">
              <p>Agent : <span className="font-mono">agent@lequai-immobilier.com</span> / agent123</p>
              <p>Manager : <span className="font-mono">manager@lequai-immobilier.com</span> / manager123</p>
              <p>Admin : <span className="font-mono">admin@lequai-immobilier.com</span> / admin123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
