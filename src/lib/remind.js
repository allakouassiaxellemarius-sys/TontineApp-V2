import { getSettings, formatMontant, formatDate } from './format.js'

export function normaliserTelephone(tel) {
  if (!tel) return ''
  let t = String(tel).replace(/[\s.\-()]/g, '')
  if (t.startsWith('+')) return t.slice(1)
  if (t.startsWith('00')) return t.slice(2)
  if (t.startsWith('0')) return '225' + t
  return t
}

export function buildMessageRappel(membre, groupe, tour) {
  const s = getSettings()
  const echeance = formatDate(tour?.datePrevue)
  const montant = formatMontant(groupe.montantCotisation, groupe)
  const lignes = [
    `Rappel de cotisation — ${groupe.nom}`,
    ``,
    `Bonjour ${membre.nom} 👋,`,
    ``,
    `Votre cotisation de ${montant} est attendue pour le tour #${tour?.numero || '?'} (échéance : ${echeance}).`,
    ``,
    `Merci de régler avant la date limite.`,
    s.nomTresorier ? `Cordialement, ${s.nomTresorier}` : 'Merci 🙏',
  ]
  return lignes.join('\n')
}

export function buildMessageReception(membre, groupe, tour) {
  const montant = formatMontant(tour?.montantPot, groupe)
  const date = formatDate(tour?.dateReception)
  return [
    `Bravo ${membre.nom} 🎉 !`,
    ``,
    `Vous avez reçu le pot de la tontine « ${groupe.nom} » : ${montant}, le ${date}.`,
    `Félicitations et bonne gestion !`,
  ].join('\n')
}

export function buildMessageBienvenue(membre, groupe) {
  const s = getSettings()
  const tpl = s.bienvenueMessage || 'Bonjour {nom} 👋, bienvenue dans la tontine « {groupe} » !'
  return tpl.replaceAll('{nom}', membre.nom || '').replaceAll('{groupe}', groupe.nom || '')
}

// Envoi SMS via le Web App Apps Script (recommandé) : le téléphone n'envoie
// que { to, body }, les identifiants Twilio restent côté serveur.
export function envoyerSMSviaServeur(to, body) {
  const s = getSettings()
  if (!s.smsServerUrl) return null
  const url = s.smsServerUrl.replace(/\/$/, '')
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: String(to).trim(), body: String(body) }),
  })
    .then((r) => r.json())
    .then((j) => (j && (j.code === 200 || j.code === undefined) ? { ok: true } : { ok: false, raison: (j && j.message) || 'Échec' }))
    .catch(() => ({ ok: false, raison: 'Serveur SMS injoignable' }))
}

export function envoyerBienvenue(membre, groupe) {
  const s = getSettings()
  const message = buildMessageBienvenue(membre, groupe)
  if (!membre.telephone) return { ok: false, raison: 'Aucun numéro de téléphone' }

  if (s.smsServerUrl) {
    envoyerSMSviaServeur(membre.telephone, message)
    return { ok: true, via: 'sms_serveur', url: null }
  }

  if (s.twilioSid && s.twilioToken && s.smsApiUrl) {
    const url = s.smsApiUrl.replace(/\/$/, '') + '/send-sms'
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: membre.telephone,
        from: s.twilioFrom,
        sid: s.twilioSid,
        token: s.twilioToken,
        body: message,
      }),
    })
      .then((r) => r.json())
      .catch(() => {})
    return { ok: true, via: 'sms', url: null }
  }

  return { ok: true, via: 'whatsapp', url: lienWhatsApp(membre.telephone, message) }
}

export function lienWhatsApp(tel, message) {
  return `https://wa.me/${normaliserTelephone(tel)}?text=${encodeURIComponent(message)}`
}

// Ouvre un lien dans le navigateur système / l'application native (WhatsApp).
// Sous Capacitor, '_blank' afficherait le site dans le WebView (page verte) ;
// '_system' délègue au navigateur Android / à l'app WhatsApp installée.
export function ouvrirLien(url) {
  if (!url) return
  window.open(url, '_system')
}

// Message auto pour le groupe WhatsApp de la tontine. opts : { lien, code }.
// lien = lien du groupe WhatsApp (chat.whatsapp.com), sinon code d'invitation.
export function buildMessageInvitationGroupe(groupe, opts = {}) {
  const lignes = [
    `Bienvenue dans le groupe WhatsApp de la tontine « ${groupe.nom} » ! 🎉`,
    ``,
  ]
  if (opts.lien) {
    lignes.push(`Rejoignez le groupe : ${opts.lien}`)
  } else if (opts.code) {
    lignes.push(
      `Pour recevoir une copie de la tontine, ouvrez Tontine Manager → « Rejoindre un groupe » et tapez le code : ${opts.code}`
    )
  }
  lignes.push(``, `Ici vous recevrez les rappels de cotisation et les infos du groupe.`)
  return lignes.join('\n')
}

export function lienSMS(tel, message) {
  return `sms:${normaliserTelephone(tel)}?body=${encodeURIComponent(message)}`
}

export function envoyerRappel(membre, groupe, tour) {
  const s = getSettings()
  const message = buildMessageRappel(membre, groupe, tour)
  if (!membre.telephone) return { ok: false, raison: 'Aucun numéro de téléphone' }

  if (s.smsServerUrl) {
    envoyerSMSviaServeur(membre.telephone, message)
    return { ok: true, via: 'sms_serveur', url: null }
  }

  if (s.twilioSid && s.twilioToken && s.smsApiUrl) {
    const url = s.smsApiUrl.replace(/\/$/, '') + '/send-sms'
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: membre.telephone,
        from: s.twilioFrom,
        sid: s.twilioSid,
        token: s.twilioToken,
        body: message,
      }),
    })
      .then((r) => r.json())
      .catch(() => {})
    return { ok: true, via: 'sms', url: null }
  }

  return { ok: true, via: 'whatsapp', url: lienWhatsApp(membre.telephone, message) }
}
