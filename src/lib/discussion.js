// ═══════════════════════════════════════════════════════════════
// Discussion — ce qui ne relève ni de la base locale (db.js) ni du transport
// (sync.js) : photos, accusés de lecture, brouillons, file d'envoi.
// ═══════════════════════════════════════════════════════════════
import { storage } from './storage'
import { chargerMedia, chargerLectures, publierLecture, televerserMedia } from './sync'
import { choisirPhoto } from './photo'

const K_BROUILLONS = 'discussionBrouillons'
const K_LUS = 'discussionLus'

// ── Photos ───────────────────────────────────────────────────
// 1 280 px / JPEG 0,72 : lisible sur un téléphone et sous la taille que le
// worker accepte (400 Ko). Le worker stocke en base64, d'où le seuil côté app.
const POIDS_MAX_B64 = 540 * 1024

export async function choisirPhotoDiscussion() {
  const dataUrl = await choisirPhoto({ maxSize: 1280, quality: 0.72 })
  if (!dataUrl) return null
  if (dataUrl.length > POIDS_MAX_B64) {
    // Image trop lourde même compressée : on retente plus bas plutôt que de
    // refuser la photo (un refus brutal n'apprend rien à l'utilisateur).
    const plusPetite = await choisirPhoto({ maxSize: 900, quality: 0.55 })
    if (!plusPetite || plusPetite.length > POIDS_MAX_B64) return { erreur: 'Photo trop lourde, choisissez-en une plus simple' }
    return decouper(plusPetite)
  }
  return decouper(dataUrl)
}

function decouper(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '')
  if (!m) return { erreur: 'Photo illisible' }
  return { type: m[1], data: m[2] }
}

export function nouvelIdMedia() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Renvoie le chemin du média, ou null si le téléversement a échoué : l'écran
// doit pouvoir refuser l'envoi plutôt que publie un message dont l'image est
// restée sur l'appareil.
export async function televerserPhoto(code, id, media) {
  try {
    const res = await televerserMedia(code, id, media.type, media.data)
    return (res && res.media) || '/media/' + code + '/' + id
  } catch {
    return null
  }
}

// Une balise <img> ne peut pas envoyer l'en-tête d'auth : on récupère le base64
// et on le transforme en data: URL. Cache mémoire (jamais localStorage : des
// megaoctets de base64 satureraient le quota) + déduplication des demandes en
// vol, parce qu'un fil de discussion affiche souvent la même image deux fois.
const cacheMedia = new Map()
const enVol = new Map()

export function mediaEnCache(chemin) {
  return cacheMedia.get(chemin) || null
}

export async function resoudreMedia(chemin) {
  if (!chemin) return null
  if (chemin.startsWith('data:')) return chemin
  const deja = cacheMedia.get(chemin)
  if (deja) return deja
  const inFlight = enVol.get(chemin)
  if (inFlight) return inFlight

  const morceaux = String(chemin).split('/').filter(Boolean)
  // '/media/{code}/{id}'
  if (morceaux.length < 3 || morceaux[0] !== 'media') return null
  const Promesse = chargerMedia(morceaux[1], morceaux[2])
    .then((r) => {
      enVol.delete(chemin)
      if (!r || !r.data) return null
      const url = 'data:' + (r.type || 'image/jpeg') + ';base64,' + r.data
      cacheMedia.set(chemin, url)
      return url
    })
    .catch(() => {
      enVol.delete(chemin)
      return null
    })
  enVol.set(chemin, Promesse)
  return Promesse
}

// ── Accusés de lecture ───────────────────────────────────────
export async function publierLectureDiscussion(code, { uid, nom, derniereCle, derniereDate }) {
  if (!code || !uid || !derniereDate) return false
  try {
    await publierLecture(code, { uid, nom, derniereCle, derniereDate, luLe: new Date().toISOString() })
    return true
  } catch {
    return false
  }
}

export async function chargerLectureDiscussion(code) {
  if (!code) return {}
  try {
    const brut = await chargerLectures(code)
    return brut && typeof brut === 'object' ? brut : {}
  } catch {
    return {}
  }
}

// Un accusé ne vaut que s'il porte l'horodatage du message lu : « luLe » est
// l'heure de l'appareil qui lit, « derniereDate » celle du message. La seconde
// seule est comparable entre appareils (deux horloges fausses d'une minute
// inverseraient le « vu par »).
export function dejasVu(pointeur, message) {
  if (!pointeur || !pointeur.derniereDate || !message || !message.date) return false
  if (pointeur.derniereCle && message.cle && pointeur.derniereCle === message.cle) return true
  return String(message.date) <= String(pointeur.derniereDate)
}

// ── Position de lecture locale (le séparateur « nouveaux messages ») ──
export function derniereLu(groupeId) {
  const map = storage.load(K_LUS, {}) || {}
  return map[String(groupeId)] || null
}
export function marquerLu(groupeId, date) {
  if (!date) return
  const map = storage.load(K_LUS, {}) || {}
  map[String(groupeId)] = date
  storage.save(K_LUS, map)
}

// ── Brouillon ────────────────────────────────────────────────
// Un texte tapissé puis abandonné (appel entrant, navigation) doit retrouver son
// auteur à la réouverture de la discussion. Par groupe, jamais partagé.
export function chargerBrouillon(groupeId) {
  const map = storage.load(K_BROUILLONS, {}) || {}
  return map[String(groupeId)] || ''
}
export function sauverBrouillon(groupeId, texte) {
  const map = storage.load(K_BROUILLONS, {}) || {}
  const t = String(texte || '')
  // Un texte blanc n'est pas un brouillon : sans ça, une espace effacée laisse
  // une « conversation en cours » que l'écran rejoue à chaque ouverture.
  if (t.trim()) map[String(groupeId)] = t
  else delete map[String(groupeId)]
  storage.save(K_BROUILLONS, map)
}

// ── Dates et auteurs (partagé par la carte de résumé et l'écran) ─
export function heure(iso) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
export function cleJour(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return String(iso || '')
  }
}
export function libelleJour(iso) {
  try {
    const d = new Date(iso)
    const aujourd = new Date()
    aujourd.setHours(0, 0, 0, 0)
    const hier = new Date(aujourd)
    hier.setDate(aujourd.getDate() - 1)
    const debut = new Date(d)
    debut.setHours(0, 0, 0, 0)
    if (+debut === +aujourd) return "Aujourd'hui"
    if (+debut === +hier) return 'Hier'
    if (+aujourd - +debut < 6 * 86400000) {
      return d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return String(iso || '')
  }
}

const COULEURS_AVATAR = [
  'bg-info-400', 'bg-success-500', 'bg-warning-500', 'bg-brand-500',
  'bg-danger-400', 'bg-gray-400', 'bg-brand-400', 'bg-info-500',
]
export function initiale(nom) {
  const n = String(nom || '').trim()
  return n ? n.charAt(0).toUpperCase() : '?'
}
export function couleurAvatar(nom) {
  let h = 0
  const n = String(nom || '')
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return COULEURS_AVATAR[h % COULEURS_AVATAR.length]
}

// Deux messages du même auteur_collés_ s'ils suivent dans la même fenêtre de
// dix minutes : c'est ce qui fait les paquets de bulles d'une vraie messagerie.
export const FENETRE_GROUPE_MS = 10 * 60 * 1000
export function memeFenetre(a, b) {
  if (!a || !b) return false
  const ecart = new Date(b.date).getTime() - new Date(a.date).getTime()
  return ecart >= 0 && ecart <= FENETRE_GROUPE_MS && a.auteur === b.auteur
}

// Lignes de rendu : séparateurs de jour + messages annotés début/fin de paquet,
// et marqueur « premier non lu » posé une seule fois sur le fil.
export function construireLignes(messages, { premiereNonLue } = {}) {
  const rows = []
  let jourPrec = null
  messages.forEach((m, i) => {
    const j = cleJour(m.date)
    if (j !== jourPrec) {
      rows.push({ type: 'jour', date: m.date, cle: 'j-' + i })
      jourPrec = j
    }
    const prec = messages[i - 1]
    const suiv = messages[i + 1]
    rows.push({
      type: 'message',
      m,
      debut: !memeFenetre(prec, m),
      fin: !memeFenetre(m, suiv),
      nonLu: !!premiereNonLue && cleMessageLocal(m) === premiereNonLue,
      cle: cleMessageLocal(m) || m.date + '-' + i,
    })
  })
  return rows
}
const cleMessageLocal = (m) => String((m && (m.cle || m.id)) || '')

// ── Résumé pour la carte de l'onglet Groupe ──────────────────
export function resumeDiscussion(group, utilisateur) {
  const messages = [...(group.messages || []), ...(group.pendingMessages || [])]
    .slice()
    .sort((a, b) => ((a.date < b.date ? -1 : 1)))
  const dernier = messages[messages.length - 1] || null
  const lu = derniereLu(group.id)
  const nonLus = lu ? messages.filter((m) => String(m.date) > String(lu) && !(utilisateur && m.uid === utilisateur.uid)).length : 0
  let apercu = ''
  if (dernier) {
    const moi = utilisateur && (dernier.uid === utilisateur.uid || dernier.auteur === utilisateur.email)
    const corps = dernier.media && !dernier.texte ? 'Photo' : dernier.texte
    apercu = (moi ? 'Vous : ' : (dernier.auteur || '') + ' : ') + String(corps || '').slice(0, 80)
  }
  return { dernier, apercu, nonLus, total: messages.length }
}

// ── Recherche dans le fil ────────────────────────────────────
// Insensible à la casse et aux accents : on écrit « cotisation » et le fil dit
// « Cotisation ».
const SANS_ACCENTS = { a: 'áàâãäåā', b: 'ß', c: 'çćč', d: 'ðđ', e: 'éèêëēę', i: 'íìîïī', l: 'ł', n: 'ñń', o: 'óòôõöø', r: 'ř', s: 'śşš', t: 'ť', u: 'úùûüū', y: 'ýÿ', z: 'źžż' }
function normaliser(s) {
  let out = String(s || '').toLowerCase()
  for (const [base, acc] of Object.entries(SANS_ACCENTS)) out = out.replace(new RegExp('[' + acc + ']', 'g'), base)
  return out
}
export function correspondance(message, recherche) {
  const q = normaliser((recherche || '').trim())
  if (!q) return true
  return normaliser(message && message.texte).includes(q) || normaliser(message && message.auteur).includes(q)
}
export { normaliser }
