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
      toast.error(err.response?.data?.error || 'Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Panneau gauche — identité agence */}
      <div className="hidden lg:flex lg:w-1/2 bg-quai-navy flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Motif décoratif */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full border border-white" />
          <div className="absolute top-20 left-20 w-48 h-48 rounded-full border border-white" />
          <div className="absolute bottom-10 right-10 w-80 h-80 rounded-full border border-white" />
        </div>

        <div className="relative z-10 text-center">
          <img
            src="https://img.netty.fr/logo/company55382byt/2/logo_web.png"
            alt="Le Quai de l'Immobilier"
            className="h-20 w-auto object-contain mx-auto mb-8"
          />
          <p className="text-white/60 text-sm italic max-w-xs mx-auto leading-relaxed">
            "Le symbole d'un départ, d'une rencontre, d'une destination"
          </p>
          <div className="mt-8 w-12 h-0.5 bg-quai-gold mx-auto" />
          <p className="text-quai-gold text-xs mt-4 tracking-widest uppercase">
            Gestion des relances
          </p>
        </div>
      </div>

      {/* Panneau droit — formulaire */}
      <div className="flex-1 flex items-center justify-center p-8 bg-quai-light">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden mb-8 text-center">
            <img
              src="https://img.netty.fr/logo/company55382byt/2/logo_web.png"
              alt="Le Quai de l'Immobilier"
              className="h-12 w-auto object-contain mx-auto invert"
            />
          </div>

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
