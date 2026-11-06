// Le clavier virtuel Android recouvre la page sans la redimensionner : le
// projet n'embarque pas @capacitor/keyboard et le manifeste est en adjustPan,
// donc aucun `100vh`, aucun `position:fixed bottom` et aucun bouton de modale
// ne bougent quand le clavier monte. visualViewport est la seule source qui
// voie la zone réellement libre ; on en déduit la hauteur masquée et on la
// publie en `--clavier` (px) sur <html>, que le CSS et les feuilles modales
// exploitent.
//
// La soustraction rend 0 dès que l'OS redimensionne lui-même la page (ajustResize
// du prochain APK, ou interactive-widget=resizes-content) : la compensation ne
// se cumule jamais avec le geste du système.
const SEUIL_PX = 60   // en dessous, c'est la barre de suggestions, pas un clavier

export function surveillerClavier() {
  const vv = window.visualViewport
  if (!vv) return () => {}
  const publier = () => {
    const masque = window.innerHeight - vv.height - vv.offsetTop
    const valeur = masque > SEUIL_PX ? `${Math.round(masque)}px` : '0px'
    const racine = document.documentElement
    if (racine.style.getPropertyValue('--clavier') !== valeur) racine.style.setProperty('--clavier', valeur)
    racine.classList.toggle('clavier-ouvert', valeur !== '0px')
  }
  publier()
  vv.addEventListener('resize', publier)
  vv.addEventListener('scroll', publier)
  return () => {
    vv.removeEventListener('resize', publier)
    vv.removeEventListener('scroll', publier)
    document.documentElement.style.removeProperty('--clavier')
    document.documentElement.classList.remove('clavier-ouvert')
  }
}
