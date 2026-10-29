import { Component } from 'react'

// Filet de rendu.
//
// Sans lui, une erreur de rendu — ou un morceau de l'application qui ne se
// charge pas, réseau faible ou version périmée après un déploiement — démonte
// tout l'arbre React : page blanche, sans message, sans issue. Ici : un
// message, un bouton pour recharger. L'agent sait quoi faire.
export default class ErrorBoundary extends Component {
  state = { erreur: null }

  static getDerivedStateFromError(erreur) { return { erreur } }

  componentDidCatch(erreur, info) {
    console.error('[ErrorBoundary]', erreur, info?.componentStack)
  }

  render() {
    if (!this.state.erreur) return this.props.children
    const chargement = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|MIME type/i
      .test(String(this.state.erreur?.message || ''))
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 bg-quai-light">
        <div className="bg-white border border-quai-border rounded-xl p-5 max-w-sm w-full text-center">
          <div className="font-display font-bold text-quai-navy text-lg">
            {chargement ? 'Une mise à jour est disponible' : 'Quelque chose s’est mal passé'}
          </div>
          <p className="text-sm text-quai-muted mt-2 leading-snug">
            {chargement
              ? 'L’application a été mise à jour. Rechargez la page pour continuer — vous retrouverez votre liste.'
              : 'Rechargez la page. Si cela recommence, prévenez Loïck.'}
          </p>
          <button onClick={() => window.location.reload()}
            className="btn-primary w-full mt-4 min-h-[3rem]">
            Recharger la page
          </button>
        </div>
      </div>
    )
  }
}
