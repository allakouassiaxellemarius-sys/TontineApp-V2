// État des conflits multi-appareils détectés sur les groupes personnels.
// Module pur (sans dépendance à Firebase) : le hook useDetecterConflits
// alimente ce registre, l'UI le lit via useConflits pour afficher le bandeau
// et proposer la résolution (adopter la version cloud / fusionner / garder).
const conflits = {}

export function enregistrerConflit(groupeId, snapshot) {
  conflits[groupeId] = { snapshot, detecteLe: Date.now() }
}

export function retirerConflit(groupeId) {
  delete conflits[groupeId]
}

export function viderConflits() {
  for (const k of Object.keys(conflits)) delete conflits[k]
}

export function getConflit(groupeId) {
  return conflits[groupeId] || null
}

export function getConflits() {
  return conflits
}

export function nbConflits() {
  return Object.keys(conflits).length
}

export function groupesEnConflit() {
  return Object.keys(conflits)
}
