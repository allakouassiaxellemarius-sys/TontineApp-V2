// Politique de confidentialité + recueil du consentement (RGPD art. 7 et 13).
// La version change dès que le texte change : un consentement donné pour une
// version antérieure n'est plus valable et la question est reposée.
import { storage } from './storage.js'
import { getLangue } from './i18n.js'
import { SYNC_BASE } from './cloudApi.js'

// Révision 2 (1er octobre 2026) : ajout de la divulgation du traitement Meta
// (rappels WhatsApp envoyés par le serveur). Le suffixe fait reposer la question
// de consentement aux utilisateurs qui avaient accepté la révision 1.
export const VERSION_POLITIQUE = '2026-10-01.2'

export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'tontine.manager.app@gmail.com'

// La politique hébergée fait foi pour les stores : elle est relue et versionnée
// côté serveur, y compris après une mise à jour de l'application installée.
export const POLITIQUE_URL = SYNC_BASE + '/privacy'
export const SUPPRESSION_URL = SYNC_BASE + '/suppression'

export function consentementEnregistre() {
  const c = storage.load('consentement', null)
  return c && c.version === VERSION_POLITIQUE ? c : null
}

export function consentementDonne() {
  return !!consentementEnregistre()
}

export function enregistrerConsentement() {
  storage.save('consentement', {
    version: VERSION_POLITIQUE,
    langue: getLangue(),
    le: Date.now(),
  })
}

const FR = [
  {
    titre: "Ce que fait l'application",
    texte:
      "Tontine Manager tient le compte de vos tontines : membres, cotisations, tours, prêts, épargne, rappels et messages du groupe. L'argent ne transite jamais par l'application : les paiements se font de membre à membre (espèces, Wave, Orange Money, MTN MoMo ou Flutterwave).",
  },
  {
    titre: 'Données enregistrées sur votre appareil',
    texte:
      "Groupes, membres (noms, téléphones, e-mails que VOUS saisissez), cotisations, prêts, objectifs d'épargne, réglages, code PIN, photos jointes aux messages. Par défaut, rien ne quitte votre téléphone : ces données restent dans l'application tant que vous ne les supprimez pas.",
  },
  {
    titre: 'Données synchronisées dans le cloud',
    texte:
      "Uniquement si vous créez un compte et activez la synchronisation d'une tontine : adresse e-mail, nom affiché, photo de profil éventuelle, identifiant technique, groupes gérés, messages et photos de la discussion, demandes d'adhésion, références de paiement, accusés de lecture (qui a lu quel message) et jeton de notification push. Hébergé chez Cloudflare (Workers, D1, Key-Value). Les personnes qui disposent du code d'invitation que vous partagez peuvent lire et enrichir cette copie.",
  },
  {
    titre: 'Assistant IA',
    texte:
      "Facultatif. L'assistant reçoit un résumé structurel de VOTRE tontine (nom, membres, montants, statut des paiements) pour calculer sa réponse. Les e-mails et les numéros de téléphone des membres sont retirés avant l'envoi ; seul le numéro du responsable est conservé, pour que l'assistant puisse dicter les instructions de paiement. Les photos que vous lui soumettez ne servent qu'à la réponse en cours.",
  },
  {
    titre: 'Rappels WhatsApp envoyés par le serveur',
    texte:
      "Facultatif, réservé au responsable d'une tontine synchronisée : les rappels de cotisation partent alors du numéro professionnel de la tontine via WhatsApp Business (Meta Platforms), sans passer par le téléphone du responsable. Pour ce seul envoi, les numéros de téléphone des membres à relancer, leur nom, le nom du groupe, le montant et l'échéance sont transmis à Meta. Une réponse « STOP » d'un membre supprime ce numéro de toute relance future. Les rappels envoyés depuis votre propre téléphone (WhatsApp ou SMS) ne passent pas par nos serveurs.",
  },
  {
    titre: 'Sous-traitants',
    texte:
      "Google (connexion Google, notifications push via Firebase Cloud Messaging) · Cloudflare (hébergement, base de données, envoi des notifications) · Flutterwave et les opérateurs Mobile Money (paiements : nom, téléphone, montant, référence) · Meta (WhatsApp Business : numéros des membres relancés par le serveur, nom, montant et échéance — uniquement à l'envoi par le serveur) · Resend (e-mail de réinitialisation du mot de passe) · GitHub (manifeste et paquet des mises à jour de l'application ; le moteur de mise à jour reste local, sans télémétrie). Chacun ne reçoit que les données nécessaires à son service.",
  },
  {
    titre: 'Ce que nous ne faisons pas',
    texte:
      "Aucune publicité, aucun traceur, aucun profilage, aucune revente ou location de données, aucune donnée de localisation, aucune lecture du contenu de vos messageries ni de votre carnet d'adresses. Les numéros que vous entrez servent uniquement à notifier vos propres membres.",
  },
  {
    titre: 'Sécurité',
    texte:
      "Tous les échanges passent par HTTPS. Les mots de passe sont vérifiés par une fonction de dérivation PBKDF2 (100 000 itérations) et ne sont jamais stockés en clair. Votre session est conservée dans un stockage chiffré de l'appareil (AES-GCM, clé non extractible). L'ouverture de l'application peut être protégée par code PIN ou biométrie, et cette confirmation est exigée pour toute action sensible (distribution du pot, changement du compte de collecte, suppression d'un groupe). Limite assumée : les tontines non synchronisées sont dans le stockage local d'Android, protégé par le système mais non chiffré par l'application, et il n'y a pas de chiffrement de bout en bout.",
  },
  {
    titre: 'Durée de conservation',
    texte:
      "Données locales : jusqu'à leur suppression dans l'application ou la désinstallation. Données synchronisées : tant que la synchronisation du groupe est active — la désactiver ou supprimer le groupe supprime sa copie cloud (messages, photos, accusés de lecture, paiements signalés). Compte et jeton de notification : jusqu'à la suppression du compte.",
  },
  {
    titre: 'Vos droits',
    texte:
      "Accès et portabilité : export en PDF, Excel, CSV ou JSON (Réglages → Exporter mes données, et Sauvegarde). Rectification : directement dans l'application. Effacement : Réglages → Supprimer mon compte efface immédiatement votre compte et ses données côté serveur, ou demandez-le par e-mail / via la page de suppression : " +
      SUPPRESSION_URL +
      ". Retrait du consentement : notifications, synchronisation et assistant IA se désactivent à tout moment, sans affecter le reste. Réclamation : auprès de l'autorité de contrôle de votre pays (par exemple la ARTDP en Côte d'Ivoire).",
  },
  {
    titre: 'Mineurs',
    texte:
      "L'application s'adresse aux personnes majeures, capables de gérer seules une activité financière de groupe. Nous ne collectons pas volontairement de données d'enfants.",
  },
  {
    titre: 'Hors Union européenne',
    texte:
      "Cloudflare et Google peuvent héberger les données synchronisées hors de l'UE. L'éditeur s'appuie sur les clauses contractuelles types de ces hébergeurs pour ces transferts.",
  },
  {
    titre: 'Texte qui fait foi',
    texte:
      "Cette synthèse est incluse dans l'application ; la version complète et à jour est publiée à l'adresse " +
      POLITIQUE_URL +
      ' (mise à jour ' +
      VERSION_POLITIQUE +
      ').',
  },
  {
    titre: 'Contact',
    texte: 'Pour toute question sur vos données ou pour exercer vos droits : ' + CONTACT_EMAIL + '.',
  },
]

const EN = [
  {
    titre: 'What the app does',
    texte:
      'Tontine Manager keeps the books for your tontines: members, contributions, rounds, loans, savings goals, reminders and group messages. Money never flows through the app — payments go directly between members (cash, Wave, Orange Money, MTN MoMo or Flutterwave).',
  },
  {
    titre: 'Data stored on your device',
    texte:
      'Groups, members (names, phones and e-mails that YOU enter), contributions, loans, savings goals, settings, PIN and photos attached to messages. By default nothing leaves your phone: this data stays inside the app until you delete it.',
  },
  {
    titre: 'Data synced to the cloud',
    texte:
      'Only when you create an account and turn on sync for a tontine: e-mail address, display name, optional profile photo, a technical identifier, the groups you manage, discussion messages and photos, join requests, payment references, read receipts (who read which message) and your push-notification token. Hosted on Cloudflare (Workers, D1, Key-Value). Anyone holding the invite code you share can read and add to that copy.',
  },
  {
    titre: 'AI assistant',
    texte:
      'Optional. The assistant receives a structural summary of YOUR tontine (group name, members, amounts, payment status) to compute its answer. Members’ e-mails and phone numbers are stripped before sending; only the treasurer’s number is kept so the assistant can write payment instructions. Images you submit are used for that answer only.',
  },
  {
    titre: 'WhatsApp reminders sent by the server',
    texte:
      "Optional, reserved to the treasurer of a synced tontine: contribution reminders are then sent from the tontine's business number via WhatsApp Business (Meta Platforms), without going through the treasurer's phone. For that single send, the phone numbers of the members to remind, their name, the group name, the amount and the due date are transmitted to Meta. A member who replies “STOP” is removed from all future reminders. Reminders sent from your own phone (WhatsApp or SMS) do not go through our servers.",
  },
  {
    titre: 'Sub-processors',
    texte:
      'Google (Sign-In and Firebase Cloud Messaging push) · Cloudflare (hosting, database and notification delivery) · Flutterwave and Mobile Money operators (payments: name, phone, amount, reference) · Meta (WhatsApp Business: phone numbers of members reminded by the server, name, amount and due date — only when sending from the server) · Resend (password-reset e-mails) · GitHub (update manifest and package; the updater itself runs locally, with no telemetry). Each one only receives the data needed for its service.',
  },
  {
    titre: 'What we never do',
    texte:
      'No advertising, no trackers, no profiling, no selling or renting of data, no location data, no reading of your mailboxes or your contacts. The numbers you enter are only used to notify your own members.',
  },
  {
    titre: 'Security',
    texte:
      'All traffic goes over HTTPS. Passwords are verified with PBKDF2 (100,000 iterations) and are never stored in clear text. Your session is kept in encrypted device storage (AES-GCM with a non-extractable key). Opening the app can be locked behind a PIN or biometrics, and that confirmation is required for any sensitive action (distributing the pot, changing the collection account, deleting a group). Admitted limitation: non-synced tontines live in Android local storage, protected by the OS but not encrypted by the app, and there is no end-to-end encryption.',
  },
  {
    titre: 'Retention',
    texte:
      'Local data: until you delete it in the app or uninstall it. Synced data: as long as sync is on for the group — turning it off, or deleting the group, removes its cloud copy (messages, photos, read receipts, reported payments). Account and notification token: until the account is deleted.',
  },
  {
    titre: 'Your rights',
    texte:
      'Access and portability: PDF, Excel, CSV or JSON export (Settings → Export my data, and Backup). Rectification: directly in the app. Erasure: Settings → Delete my account wipes your account and its server-side data immediately, or ask by e-mail / through the deletion page: ' +
      SUPPRESSION_URL +
      '. Withdrawal of consent: notifications, sync and the AI assistant can be turned off at any time without affecting the rest. Complaint: with the data-protection authority of your country (e.g. ARTDP in Côte d’Ivoire).',
  },
  {
    titre: 'Minors',
    texte:
      'The app is intended for adults able to run a group financial activity on their own. We do not knowingly collect children’s data.',
  },
  {
    titre: 'Transfers outside the EU',
    texte:
      'Cloudflare and Google may host synced data outside the EU. The publisher relies on these hosts’ standard contractual clauses for such transfers.',
  },
  {
    titre: 'Authoritative text',
    texte:
      'This summary ships inside the app; the full, up-to-date policy is published at ' +
      POLITIQUE_URL +
      ' (updated ' +
      VERSION_POLITIQUE +
      ').',
  },
  {
    titre: 'Contact',
    texte: 'Any question about your data, or to exercise your rights: ' + CONTACT_EMAIL + '.',
  },
]

export function sectionsPolitique(langue) {
  const l = langue || getLangue()
  return l === 'en' ? EN : FR
}
