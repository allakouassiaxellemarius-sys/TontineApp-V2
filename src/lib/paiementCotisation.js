// Paiement Money Fusion PAR COTISATION.
// Le lien n'est plus un compte marchand unique : le worker en crée un pour le
// tour et le membre, avec un montant calculé côté serveur. L'application ne
// détient toujours aucune clé marchande. Un statut « paid » lu ici est un
// indice pour pré-remplir le signalement — la cotisation reste confirmée par
// le responsable.
import { SYNC_BASE, authHeaders, syncDisponible } from './cloudApi'
import { normaliserCompteCollecte } from './paiementSimple'

async function requete(method, chemin, corps) {
  if (!syncDisponible()) return { ok: false, code: 'hors_ligne' }
  const auth = await authHeaders()
  if (!auth) return { ok: false, code: 'hors_ligne' }
  const opts = { method, headers: { ...auth } }
  if (corps !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(corps)
  }
  try {
    const res = await fetch(SYNC_BASE + '/' + chemin.replace(/^\/+/, ''), opts)
    const j = await res.json().catch(() => null)
    if (res.ok) return { ok: true, ...(j || {}) }
    return { ok: false, statut: res.status, code: (j && (j.code || j.error)) || 'HTTP ' + res.status }
  } catch {
    return { ok: false, code: 'reseau' }
  }
}

// Le serveur sait si le lien par cotisation est configuré (secret présent),
// sans jamais révéler la clé marchande.
export async function configPaiementCotisation() {
  const r = await requete('GET', 'paiement/config')
  return r.ok ? !!r.actif : false
}

// Renvoie { ok, url, token } ou { ok:false, code }.
// L'URL repasse la même porte que le compte de collecte : un fournisseur qui
// rendrait autre chose est traité comme une panne, pas comme un lien à ouvrir.
export async function creerLienCotisation({ code, tourId, membreId }) {
  if (!code || tourId == null || membreId == null) return { ok: false, code: 'incomplet' }
  const r = await requete('POST', 'paiement/init', {
    code,
    tourId: Number(tourId),
    membreId: Number(membreId),
  })
  if (!r.ok) return r
  const compte = normaliserCompteCollecte(r.url)
  if (!compte) return { ok: false, code: 'fournisseur' }
  return { ok: true, url: compte.url, token: String(r.token || ''), montant: Number(r.montant) || 0 }
}

export async function statutLienCotisation(token) {
  if (!token) return { ok: false, code: 'incomplet' }
  return requete('GET', 'paiement/statut?token=' + encodeURIComponent(token))
}
