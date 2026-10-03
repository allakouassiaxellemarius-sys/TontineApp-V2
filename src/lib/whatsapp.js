// Rappels WhatsApp envoyés PAR LE SERVEUR (WhatsApp Business Cloud API, Meta).
//
// Différence avec src/lib/remind.js : celui-ci ouvre WhatsApp sur le téléphone
// (wa.me) et demande un geste par membre. Ici le Worker envoie le message
// tout seul, ce qui suppose que le numéro du membre quitte l'appareil — d'où
// le consentement explicite demandé dans l'interface et la divulgation dans la
// politique de confidentialité.
//
// Le client n'envoie QUE { tourNumero } : ni numéro de téléphone, ni montant,
// ni texte. Le serveur relit le groupe qu'il a en base, calcule qui n'a pas
// payé et compose un message à partir d'un template approuvé par Meta.
// Un compte malveillant ne peut donc pas se servir de cette route comme d'un
// relais de spam ni faire croire à un faux compte de collecte.
import { cloudRequest } from './cloudApi.js'

// Aperçu (aussi le témoin « configuré / non configuré ») : renvoie le tour
// visé et la liste des membres à relancer, avec la raison des non-joignables.
// tourNumero cible un tour précis ; sans lui, le serveur prend le premier en
// attente.
export async function statutWhatsApp(code, tourNumero) {
  try {
    const q = tourNumero == null ? '' : '?tour=' + encodeURIComponent(String(tourNumero))
    return await cloudRequest('GET', 'whatsapp/' + encodeURIComponent(String(code)) + '/statut' + q)
  } catch {
    return null
  }
}

// Envoie le rappel du tour `tourNumero` aux membres non à jour.
// Renvoie { configure, envoyes, ignores, raison? } — ne lève pas : l'interface
// affiche le détail membre par membre.
export async function envoyerRappelsWhatsApp(code, tourNumero) {
  try {
    const r = await cloudRequest('POST', 'whatsapp/' + encodeURIComponent(String(code)), { tourNumero })
    return r || { configure: false, envoyes: [], ignores: [], raison: 'Réponse vide du serveur' }
  } catch (e) {
    const msg = String((e && e.message) || '')
    const raison =
      msg === 'auth' ? 'Connectez votre compte pour activer l’envoi automatique.'
      : msg === 'forbidden' ? 'Seul le responsable (ou un co-gérant) peut envoyer des rappels WhatsApp.'
      : msg || 'Le serveur n’a pas répondu.'
    return { configure: false, envoyes: [], ignores: [], raison }
  }
}

export async function journalWhatsApp(code) {
  try {
    return await cloudRequest('GET', 'whatsapp/' + encodeURIComponent(String(code)))
  } catch {
    return null
  }
}
