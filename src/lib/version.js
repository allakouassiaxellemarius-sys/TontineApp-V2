// Une OTA n'est proposée que si sa version est strictement supérieure au bundle
// actif : publier du nouveau contenu sous un numéro déjà servi ne l'installe
// sur aucun téléphone déjà à jour (garde : miseAJour.js:108).
export const VERSION_APP = '2.3.18'
