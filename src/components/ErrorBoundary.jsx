import { Component } from 'react'

// Capture toute erreur de rendu pour éviter un écran noir muet.
// Affiche le message d'erreur réel afin de pouvoir diagnostiquer la cause.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Erreur capturée par ErrorBoundary :', error, info)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="relative mx-auto min-h-screen max-w-lg px-4 py-10" style={{ background: 'rgb(var(--bg))' }}>
          <div className="card glass-strong p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-danger-500/15 text-danger-500 text-xl">⚠️</span>
              <h1 className="text-base font-extrabold text-[rgb(var(--text))]">Une erreur est survenue</h1>
            </div>
            <p className="text-sm text-[rgb(var(--text-dim))]">
              L'écran s'est arrêté. Revenez à l'accueil ou rechargez l'application. Le message ci-dessous aide au diagnostic.
            </p>
            <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] leading-snug text-danger-300">{String(error && error.stack ? error.stack : error)}</pre>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-secondary flex-1" onClick={() => { window.location.hash = '#/' }}>Accueil</button>
              <button className="btn btn-primary flex-1" onClick={() => window.location.reload()}>Recharger</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
