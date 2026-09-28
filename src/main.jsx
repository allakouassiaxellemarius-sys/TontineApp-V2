import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Sensation native : le menu contextuel du long-press (copier l'image,
// ouvrir le lien…) est désactivé hors des champs de saisie.
document.addEventListener('contextmenu', (e) => {
  const t = e.target
  if (!(t instanceof HTMLElement)) return
  if (!t.closest('input, textarea, [contenteditable="true"]')) e.preventDefault()
})
