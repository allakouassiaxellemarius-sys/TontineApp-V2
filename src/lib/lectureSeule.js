// Mode lecture seule global.
// Il n'est actif que lorsque l'utilisateur a explicitement ACCEPTÉ de
// continuer hors ligne. « Rester actif » laisse les écritures locales actives,
// même si l'état réseau rapporté par le navigateur (navigator.onLine) est
// incertain — sinon les modifications seraient bloquées silencieusement.
let lectureSeule = false

export function setLectureSeule(v) {
  lectureSeule = !!v
}

export function estLectureSeule() {
  return lectureSeule
}
