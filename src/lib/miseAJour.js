// ═══════════════════════════════════════════════════════════════
// Mises à jour à distance (sans Play Store)
// ---------------------------------------------------------------
// Le bundle web est empaqueté en zip et hébergé sur Netlify avec un
// manifeste update.json { version, url }. Au démarrage, l'app compare
// la version du manifeste à la version embarquée : si une version plus
// récente existe, elle télécharge le zip, l'active (CapacitorUpdater)
// et recharge l'application — sans aucune réinstallation de l'APK.
// ═══════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core'
import { VERSION_APP } from './version'

// URL de base du manifeste OTA. Hébergé gratuitement sur GitHub : raw
// serve avec Access-Control-Allow-Origin: * et invalide son cache (5 min)
// dès qu'une branche change. jsDelivr s'est révélé piégé par un cache
// CDN de longue durée sur update.json (manifeste périmé servi indéfiniment
// malgré les purges), donc on lit directement sur raw.githubusercontent.com.
// Remplaçable dans les réglages de l'app (champ « URL de mise à jour »).
export const MAJ_URL_DEFAUT =
  'https://raw.githubusercontent.com/allakouassiaxellemarius-sys/tontine-manager-ota/main/update.json'
const CLE_VERSION_BUNDLE = 'tontine_bundle_version'
const CLE_URL = 'tontine_maj_url'

export function majDisponibles() {
  return Capacitor.isNativePlatform()
}

export function urlManifest() {
  try {
    let v = localStorage.getItem(CLE_URL)
    // Migration : oublie l'ancienne URL Netlify mémorisée (crédits épuisés).
    if (v && v.indexOf('tontine-manager.netlify.app') !== -1) {
      localStorage.removeItem(CLE_URL)
      v = null
    }
    // Migration : l'URL jsDelivr @main s'est révélée servir un manifeste
    // périmé en cache (malgré les purges). Retombe sur raw GitHub.
    if (v && v.indexOf('cdn.jsdelivr.net') !== -1) {
      localStorage.removeItem(CLE_URL)
      v = null
    }
    return v || MAJ_URL_DEFAUT
  } catch {
    return MAJ_URL_DEFAUT
  }
}

export function sauverUrlManifest(url) {
  try {
    if (url) localStorage.setItem(CLE_URL, url)
    else localStorage.removeItem(CLE_URL)
  } catch {}
}

// Version du bundle web actuellement actif. Après une mise à jour à
// distance, la valeur stockée est mise à jour avant le rechargement.
// Le bundle embarqué dans l'APK fait autorité : si le numéro de version
// natif est >= à la dernière version OTA mémorisée, la version mémorisée
// est obsolète (le nouvel APK l'a déjà) et on retombe sur VERSION_APP.
// Ça évite de reproposer une mise à jour déjà incluse dans l'APK.
export function versionBundleActuelle() {
  try {
    const v = localStorage.getItem(CLE_VERSION_BUNDLE)
    if (v && comparerVersions(VERSION_APP, v) >= 0) return VERSION_APP
    return v || VERSION_APP
  } catch {
    return VERSION_APP
  }
}

export function enregistrerVersionBundle(v) {
  try {
    localStorage.setItem(CLE_VERSION_BUNDLE, String(v))
  } catch {}
}

// Comparaison sémantique simple "1.10.0" vs "1.11.0".
// Retourne 1 si a > b, -1 si a < b, 0 si égales.
export function comparerVersions(a, b) {
  const pa = String(a || '').split('.').map(Number)
  const pb = String(b || '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

// Récupère le manifeste Netlify. Retourne { version, url } ou null.
export async function lireManifest(url) {
  const cible = url || urlManifest()
  const res = await fetch(cible, { cache: 'no-store' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  if (!data || !data.version || !data.url) return null
  return { version: String(data.version), url: String(data.url) }
}

// Vérifie s'il existe une mise à jour plus récente que le bundle actif.
// Retourne { version, url } ou null.
export async function verifierMiseAJour(url) {
  if (!majDisponibles()) return null
  const manifest = await lireManifest(url)
  if (!manifest) return null
  const actuelle = versionBundleActuelle()
  if (comparerVersions(manifest.version, actuelle) <= 0) return null
  return manifest
}

// fetch avec délai maximal : sans timeout, un réseau qui stalle (serveur
// injoignable, pare-feu…) ferait tourner le spinner indéfiniment. Après le
// délai, on abandonne et on remonte un message qui distingue « serveur
// injoignable » d'une autre erreur réseau.
async function fetchAvecTimeout(url, options, ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Applique un délai maximal à une promesse (ici le téléchargement natif du
// plugin, qui n'a pas de timeout propre). Le téléchargement natif continue
// en arrière-plan mais l'app ne reste plus bloquée en attente.
async function avecTimeout(promise, ms, message) {
  let timer
  const tropLong = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, tropLong])
  } finally {
    clearTimeout(timer)
  }
}

// Télécharge le bundle distant et le rend actif, puis recharge l'app.
// À n'appeler qu'après confirmation de l'utilisateur.
// Le plugin natif exige >= 100 Mo d'espace libre et une connexion stable :
// on réessaie une fois, puis on remonte une erreur claire si ça échoue.
// Avant l'appel natif, un test HEAD vérifie que l'appareil peut joindre le
// zip : ça permet de distinguer un problème réseau d'un problème de stockage.
// `onEtape('connexion'|'telechargement'|'installation')` permet à l'interface
// d'afficher la progression au lieu d'un simple spinner muet.
export async function installerMiseAJour(maj, onEtape) {
  if (onEtape) onEtape('connexion')
  let diagnostic = ''
  try {
    const rep = await fetchAvecTimeout(
      maj.url,
      { method: 'HEAD', cache: 'no-store' },
      15000
    )
    diagnostic = rep.ok
      ? `Serveur joignable (HTTP ${rep.status}, ${rep.headers.get('content-length') || '?'} octets).`
      : `Le serveur répond HTTP ${rep.status}.`
  } catch (e) {
    diagnostic =
      (e && e.name === 'AbortError')
        ? "Le serveur ne répond pas (délai de 15 s dépassé). Vérifiez la connexion, ou changez l'« URL de mise à jour » dans les réglages si le blocage persiste."
        : "L'appareil ne peut pas joindre le serveur : " + ((e && e.message) || 'erreur réseau')
  }
  console.info('[MAJ] Diagnostic :', diagnostic)

  const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
  let dernierErreur = null
  for (let tentative = 0; tentative < 2; tentative++) {
    if (onEtape) onEtape('telechargement')
    try {
      const bundle = await avecTimeout(
        CapacitorUpdater.download({ version: maj.version, url: maj.url }),
        90000,
        'délai de téléchargement dépassé (90 s). Le serveur est peut-être trop lent ou inaccessible depuis ce réseau.'
      )
      if (!bundle || !bundle.id) throw new Error('Téléchargement impossible')
      if (onEtape) onEtape('installation')
      // set() active le bundle et déclenche lui-même le rechargement de l'app
      // (reload interne : le plugin attend que le nouveau bundle appelle
      // notifyAppReady avant de répondre). Il ne faut PAS rappeler reload()
      // après : il n'y aurait plus d'appel notifyAppReady possible et l'app
      // resterait bloquée à l'étape d'installation.
      await avecTimeout(CapacitorUpdater.set(bundle), 60000, "délai d'activation dépassé")
      enregistrerVersionBundle(maj.version)
      return
    } catch (e) {
      dernierErreur = e
      if (tentative === 0) {
        console.error('[MAJ] Échec du téléchargement (nouvelle tentative) :', e && e.message)
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }
  const detail = (dernierErreur && dernierErreur.message) || 'inconnue'
  console.error('[MAJ] Échec définitif du téléchargement :', detail)
  const msg =
    "Impossible de télécharger la mise à jour. " + diagnostic + ' ' +
    "Vérifiez qu'il reste au moins 100 Mo d'espace libre sur l'appareil et " +
    'que la connexion est stable, puis réessayez. (détail natif : ' + detail + ')'
  throw new Error(msg)
}

// Préviens le plugin que le bundle actuel est sain (évite le rollback
// automatique). À appeler dès que l'app est prête.
export async function annoncerAppPrete() {
  if (!majDisponibles()) return
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
  } catch (e) {
    console.error('[MAJ] notifyAppReady a échoué :', e && e.message)
  }
}

// ── Notification locale de rappel de mise à jour ──────────────────
// Dès qu'une mise à jour est détectée, un rappel quotidien (10h00) est
// programmé pour prévenir l'utilisateur, même s'il ne rouvre pas l'app.
// Il est annulé dès que la mise à jour est installée (ou qu'il n'y a
// plus rien à installer). Ne fonctionne que sur mobile natif.
const ID_RAPPEL_MAJ = 2000000007

async function chargerLocalNotifs() {
  return (await import('@capacitor/local-notifications')).LocalNotifications
}

export async function annulerRappelMiseAJour() {
  if (!majDisponibles()) return
  try {
    const { LocalNotifications } = await chargerLocalNotifs()
    await LocalNotifications.cancel({ notifications: [{ id: ID_RAPPEL_MAJ }] })
  } catch {}
}

// Programme le rappel quotidien (10h00, répété) tant que la version n'est
// pas installée. Demande la permission au premier passage si nécessaire.
export async function programmerRappelMiseAJour(version) {
  if (!majDisponibles()) return
  try {
    const { LocalNotifications } = await chargerLocalNotifs()
    const p = await LocalNotifications.checkPermissions()
    let perm = p && p.display
    if (perm === 'prompt') {
      const r = await LocalNotifications.requestPermissions()
      perm = r && r.display
    }
    if (perm !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: ID_RAPPEL_MAJ,
        title: 'Mise à jour Tontine Manager',
        body: `La version v${version} est disponible. Ouvrez l'application pour l'installer — aucune réinstallation de l'APK nécessaire.`,
        sound: 'chime_duo.wav',
        schedule: { on: { hour: 10, minute: 0, second: 0 }, repeats: true },
        data: { type: 'mise_a_jour', code: null, groupeId: null },
      }],
    })
  } catch {}
}
