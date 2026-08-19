// Permet à une vue (ex. une feuille modale) de « capturer » le bouton
// retour matériel Android : tant qu'un override est défini, il est appelé
// à la place de la navigation par défaut (fermer la modale plutôt que
// quitter l'écran).
let override = null

export function setBackOverride(fn) {
  override = typeof fn === 'function' ? fn : null
}

export function getBackOverride() {
  return override
}
