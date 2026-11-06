import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, ChevronDown, Copy, Eye, Image as ImageIcon,
  MessageCircle, Paperclip, Pin, Reply, Search, Send, Sparkles, Trash2, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import {
  cleMessage, envoyerMessage, envoyerMessageInvite, fileDEnvoi, getGroup, getMembres,
  marquerEnvoiInvite, modifierMessage, pinguerMessage, supprimerMessage,
} from '../lib/db'
import { publierMessageInvite } from '../lib/sync'
import {
  chargerBrouillon, chargerLectureDiscussion, choisirPhotoDiscussion, construireLignes, correspondance,
  couleurAvatar, dejasVu, derniereLu, heure, initiale, libelleJour, marquerLu, mediaEnCache,
  nouvelIdMedia, publierLectureDiscussion, resoudreMedia, sauverBrouillon, televerserPhoto,
} from '../lib/discussion'
import { haptic } from '../lib/haptique'
import { lienWhatsApp, ouvrirLien } from '../lib/remind'
import EmptyState from '../components/EmptyState'

// Écran de discussion : une vraie messagerie (réponses citées, photos, accusés
// de lecture, épingles, brouillon retrouvé, file d'envoi reprise au retour du
// réseau). Il a sa propre route parce qu'un fil ne se lit pas dans une fenêtre
// de 62 % de hauteur collée sous un tableau de bord.
export default function DiscussionScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { utilisateur } = useAuth()
  const { refresh, version } = useData()
  const toast = useToast()

  const group = getGroup(id)
  const code = group && (group.code || group.codeUnique)
  const estInvite = !!(group && group.rejoint)
  const monAuteur = utilisateur ? utilisateur.displayName || utilisateur.email || 'Membre' : 'Membre'
  const monUid = utilisateur ? utilisateur.uid : null
  const membres = useMemo(() => (group ? getMembres(id) : []), [id, group, version])

  const [texte, setTexte] = useState('')
  const [repondreA, setRepondreA] = useState(null)
  const [media, setMedia] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [chercheOuvert, setChercheOuvert] = useState(false)
  const [selection, setSelection] = useState(null)
  const [visionneuse, setVisionneuse] = useState(null)
  const [lectures, setLectures] = useState({})
  const [colleEnBas, setColleEnBas] = useState(true)
  const [nouveaux, setNouveaux] = useState(0)

  const zoneRef = useRef(null)
  const basRef = useRef(null)
  const taRef = useRef(null)

  const messages = useMemo(
    () => [...(group?.messages || []), ...(group?.pendingMessages || [])]
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [group?.messages, group?.pendingMessages]
  )

  const premiereNonLue = useMemo(() => {
    const lu = derniereLu(id)
    if (!lu) return null
    const premier = messages.find((m) => String(m.date) > String(lu) && m.uid !== monUid)
    return premier ? cleMessage(premier) : null
  }, [messages, id, monUid])

  const visibles = useMemo(() => messages.filter((m) => correspondance(m, recherche)), [messages, recherche])
  const lignes = useMemo(() => construireLignes(visibles, { premiereNonLue }), [visibles, premiereNonLue])
  const epingles = useMemo(() => messages.filter((m) => m.epingle), [messages])
  const estMoi = useCallback((m) => !!(m && ((monUid && m.uid === monUid) || (monAuteur && m.auteur === monAuteur))), [monUid, monAuteur])

  // ── Brouillon : retrouvé à l'ouverture, gardé pendant la saisie ──
  useEffect(() => { setTexte(chargerBrouillon(id) || '') }, [id])
  useEffect(() => {
    const minute = setTimeout(() => sauverBrouillon(id, texte), 400)
    return () => clearTimeout(minute)
  }, [texte, id])

  // ── Clavier : la zone de saisie reste au-dessus du clavier virtuel ──
  // `--clavier` est publié par src/lib/clavier.js (monté dans App) — la barre
  // de saisie n'a donc qu'à s'y caler, comme les feuilles modales.

  // ── Accusés de lecture : sondage du groupe, publication de son pointeur ──
  useEffect(() => {
    if (!code) return undefined
    let vif = true
    const tirer = async () => {
      const brut = await chargerLectureDiscussion(code)
      if (vif) setLectures(brut || {})
    }
    tirer()
    const minute = setInterval(tirer, 15000)
    return () => { vif = false; clearInterval(minute) }
  }, [code])

  const dernier = messages[messages.length - 1]
  useEffect(() => {
    if (!code || !dernier) return
    publierLectureDiscussion(code, {
      uid: monUid,
      nom: monAuteur,
      derniereCle: cleMessage(dernier),
      derniereDate: dernier.date,
    })
  }, [code, dernier?.date, monUid, monAuteur]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File d'envoi : reprise dès que le réseau revient ──
  const rejouerFile = useCallback(async () => {
    if (!code || !estInvite) return
    const enRetard = fileDEnvoi(id)
    if (!enRetard.length) return
    for (const p of enRetard) {
      try {
        await publierMessageInvite(code, p)
        marquerEnvoiInvite(id, cleMessage(p), 'envoye')
      } catch {
        marquerEnvoiInvite(id, cleMessage(p), 'echoue')
      }
    }
    refresh()
  }, [code, estInvite, id, refresh])

  useEffect(() => {
    rejouerFile()
    window.addEventListener('online', rejouerFile)
    return () => window.removeEventListener('online', rejouerFile)
  }, [rejouerFile])

  // ── Défilement ──
  useLayoutEffect(() => {
    if (colleEnBas) {
      basRef.current?.scrollIntoView({ block: 'end' })
      setNouveaux(0)
    }
  }, [colleEnBas, messages.length])

  useEffect(() => {
    if (!colleEnBas) setNouveaux((n) => n + 1)
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const surScroll = () => {
    const el = zoneRef.current
    if (!el) return
    const presDuBas = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (presDuBas !== colleEnBas) setColleEnBas(presDuBas)
    if (presDuBas) setNouveaux(0)
  }
  const allerEnBas = () => {
    setColleEnBas(true)
    setNouveaux(0)
    basRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // ── Envoi ──
  const poster = async () => {
    const t = texte.trim()
    if ((!t && !media) || envoiEnCours) return
    setEnvoiEnCours(true)
    try {
      let chemin = media && media.chemin
      if (media && !media.televerse) {
        chemin = await televerserPhoto(code, media.id, { type: media.type, data: media.data })
        if (!chemin) { toast.error('Photo non téléversée, réessayez'); return }
      }
      const extras = { repondreA: repondreA ? cleMessage(repondreA) : null, media: chemin || null }
      const m = estInvite
        ? envoyerMessageInvite(id, t, monAuteur, monUid, utilisateur?.email, extras)
        : envoyerMessage(id, t, monAuteur, monUid, utilisateur?.email, extras)
      if (!m) { toast.error('Envoi impossible (groupe en lecture seule)'); return }

      setTexte('')
      sauverBrouillon(id, '')
      setMedia(null)
      setRepondreA(null)
      setColleEnBas(true)
      marquerLu(id, m.date)
      haptic.tap()
      if (taRef.current) taRef.current.style.height = 'auto'

      if (estInvite && code) {
        publierMessageInvite(code, m)
          .then(() => marquerEnvoiInvite(id, cleMessage(m), 'envoye'))
          .catch(() => marquerEnvoiInvite(id, cleMessage(m), 'echoue'))
          .finally(() => refresh())
      }
      refresh()
    } finally {
      setEnvoiEnCours(false)
    }
  }

  const joindrePhoto = async () => {
    if (!code) { toast.error('Il faut synchroniser le groupe pour envoyer des photos'); return }
    const pris = await choisirPhotoDiscussion()
    if (!pris) return
    if (pris.erreur) { toast.error(pris.erreur); return }
    setMedia({ ...pris, id: nouvelIdMedia(), televerse: false, apercu: 'data:' + pris.type + ';base64,' + pris.data })
    haptic.tap()
  }

  // ── Actions du menu ──
  const surRepondre = (m) => { setRepondreA(m); setSelection(null); taRef.current?.focus() }
  const surCopier = async (m) => {
    setSelection(null)
    try {
      await navigator.clipboard.writeText(m.texte || '')
      haptic.tap()
      toast.success('Message copié')
    } catch { /* presse-papiers refusé */ }
  }
  const surEditer = (m) => {
    setSelection(null)
    const corrige = window.prompt('Corriger le message', m.texte || '')
    if (corrige == null || !corrige.trim()) return
    if (!modifierMessage(id, cleMessage(m), corrige)) { toast.error('Modification impossible'); return }
    refresh()
  }
  const surEpingle = (m) => {
    setSelection(null)
    if (pinguerMessage(id, cleMessage(m), !m.epingle) === null) { toast.error('Épinglage réservé au responsable'); return }
    refresh()
    toast.success(m.epingle ? 'Message désépinglé' : 'Message épinglé')
  }
  const surSupprimer = (m) => {
    setSelection(null)
    supprimerMessage(id, cleMessage(m))
    refresh()
    toast.info('Message supprimé')
  }
  const surTransfert = (m) => {
    setSelection(null)
    const destinataire = membres.find((x) => x.telephone && String(x.uid) !== String(monUid))
    ouvrirLien(lienWhatsApp(destinataire ? destinataire.telephone : '', (m.auteur ? m.auteur + ' : ' : '') + m.texte))
  }

  if (!group) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--bg))] p-6">
        <EmptyState
          icon={MessageCircle}
          title="Groupe introuvable"
          description="Ce groupe n’existe plus sur cet appareil."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Mes tontines</button>}
        />
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-[rgb(var(--bg))]">
      <header className="z-10 shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 pb-2 pt-safe">
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-icon !h-10 !w-10 shrink-0" onClick={() => navigate(-1)} aria-label="Retour"><ArrowLeft size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold leading-tight text-gray-800">{group.nom}</p>
            <p className="truncate text-[11px] font-semibold text-gray-500">
              {chercheOuvert
                ? visibles.length + ' message(s) sur ' + messages.length
                : membres.length + ' membre' + (membres.length > 1 ? 's' : '') + (code ? '' : ' · discussion locale')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-icon !h-10 !w-10 shrink-0"
            onClick={() => { setChercheOuvert((v) => !v); if (chercheOuvert) setRecherche('') }}
            aria-label={chercheOuvert ? 'Fermer la recherche' : 'Chercher dans la discussion'}
          >
            {chercheOuvert ? <X size={18} /> : <Search size={18} />}
          </button>
        </div>
        {chercheOuvert && (
          <input
            className="mt-2 w-full rounded-2xl border-2 border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-muted))] px-3.5 py-2 text-sm font-semibold outline-none focus:border-brand-500"
            placeholder="Un mot, un nom…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher dans la discussion"
          />
        )}
      </header>

      {epingles.length > 0 && !chercheOuvert && (
        <div className="shrink-0 border-b border-[rgb(var(--border))] bg-brand-50">
          <button
            type="button"
            className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 py-2 text-left"
            onClick={() => {
              const cible = epingles[epingles.length - 1]
              const noeud = document.querySelector('[data-msg="' + cleMessage(cible) + '"]')
              noeud?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          >
            <Pin size={14} className="shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-brand-800">{epingles[epingles.length - 1].texte || 'Photo'}</span>
            <span className="shrink-0 rounded-full bg-brand-100 px-1.5 text-[10px] font-extrabold text-brand-700">{epingles.length}</span>
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessageCircle}
              title="Discussion vide"
              description="Écrivez le premier message : réponses citées, photos et accusés de lecture sont de la partie."
            />
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState icon={Search} title="Rien à montrer" description={'Aucun message ne contient « ' + recherche + ' ».'} />
          </div>
        ) : (
          <div ref={zoneRef} onScroll={surScroll} className="h-full overflow-y-auto overscroll-contain bg-[rgb(var(--surface-muted))] px-2.5 py-3">
            <div className="mx-auto max-w-lg">
              {lignes.map((row) => {
                if (row.type === 'jour') {
                  return (
                    <div key={row.cle} className="sticky top-0 z-10 flex justify-center py-1.5">
                      <span className="rounded-full bg-[rgb(var(--surface))] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-gray-400 shadow-sm">
                        {libelleJour(row.date)}
                      </span>
                    </div>
                  )
                }
                const { m, debut, fin, nonLu } = row
                const moi = estMoi(m)
                return (
                  <div key={row.cle}>
                    {nonLu && (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-full bg-brand-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">Nouveaux messages</span>
                      </div>
                    )}
                    <div id={'msg-' + cleMessage(m)} data-msg={cleMessage(m)} className={`flex items-end gap-1.5 ${moi ? 'justify-end' : 'justify-start'} ${debut ? 'mt-2.5' : 'mt-0.5'}`}>
                      <span className={`mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white ${moi ? 'hidden' : debut ? couleurAvatar(m.auteur) : 'bg-transparent'}`}>
                        {debut ? initiale(m.auteur) : ''}
                      </span>
                      <Bulle
                        m={m}
                        moi={moi}
                        debut={debut}
                        fin={fin}
                        lu={Object.values(lectures).some((x) => x && String(x.uid) !== String(monUid) && dejasVu(x, m))}
                        surRepondre={surRepondre}
                        surMenu={setSelection}
                        surOuvrir={setVisionneuse}
                        surCopier={surCopier}
                        cible={findCible(messages, m)}
                      />
                    </div>
                  </div>
                )
              })}
              <div ref={basRef} className="h-1" />
            </div>
          </div>
        )}

        {!colleEnBas && (
          <button
            type="button"
            className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-brand-600 shadow-lg ring-1 ring-[rgb(var(--border))]"
            onClick={allerEnBas}
            aria-label="Aller aux derniers messages"
          >
            <ChevronDown size={18} />
            {nouveaux > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-extrabold text-white">
                {nouveaux > 9 ? '9+' : nouveaux}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 pb-safe pt-2" style={{ marginBottom: 'var(--clavier)' }}>
        {repondreA && (
          <div className="mx-auto mb-1.5 flex max-w-lg items-center gap-2 rounded-xl border-l-4 border-brand-500 bg-[rgb(var(--surface-muted))] px-3 py-1.5">
            <Reply size={13} className="shrink-0 text-brand-600" />
            <p className="min-w-0 flex-1 truncate text-xs font-bold text-gray-700">
              <span className="text-brand-700">{repondreA.auteur} · </span>{repondreA.texte || 'Photo'}
            </p>
            <button type="button" className="shrink-0 text-gray-400" onClick={() => setRepondreA(null)} aria-label="Annuler la réponse"><X size={14} /></button>
          </div>
        )}
        {media && (
          <div className="mx-auto mb-1.5 flex max-w-lg items-center gap-2 rounded-xl bg-[rgb(var(--surface-muted))] p-1.5 pl-3">
            <img src={media.apercu} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            <p className="min-w-0 flex-1 truncate text-xs font-bold text-gray-700">Photo prête</p>
            <button type="button" className="btn btn-icon !h-8 !w-8 shrink-0" onClick={() => setMedia(null)} aria-label="Retirer la photo"><X size={14} /></button>
          </div>
        )}
        <div className="mx-auto flex max-w-lg items-end gap-1.5">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition active:scale-90 disabled:opacity-40"
            onClick={joindrePhoto}
            disabled={!code || envoiEnCours}
            aria-label="Joindre une photo"
          ><Paperclip size={18} /></button>
          <textarea
            ref={taRef}
            className="max-h-32 min-h-0 flex-1 resize-none rounded-3xl border-2 border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-muted))] px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none transition placeholder:font-normal placeholder:text-gray-400 focus:border-brand-500"
            rows={1}
            autoCapitalize="sentences"
            placeholder={estInvite ? 'Écrire au groupe…' : 'Votre message…'}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); poster() } }}
          />
          <button
            type="button"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition ${
              (!texte.trim() && !media) || envoiEnCours
                ? 'cursor-not-allowed bg-gray-300'
                : 'bg-brand-600 shadow-[0_3px_0_rgb(46_125_50)] active:translate-y-[2px] active:shadow-none'
            }`}
            onClick={poster}
            disabled={(!texte.trim() && !media) || envoiEnCours}
            aria-label="Envoyer"
          ><Send size={16} className="ml-0.5" /></button>
        </div>
      </div>

      {selection && (
        <MenuMessage
          m={selection.m}
          moi={selection.moi}
          invite={estInvite}
          onClose={() => setSelection(null)}
          surRepondre={surRepondre}
          surCopier={surCopier}
          surEditer={surEditer}
          surEpingle={surEpingle}
          surTransfert={surTransfert}
          surSupprimer={surSupprimer}
        />
      )}
      {visionneuse && <Visionneuse chemin={visionneuse} onClose={() => setVisionneuse(null)} />}
    </div>,
    document.body
  )
}

// ── Bulle : citation, photo, statut d'envoi, appui-long ──────
function Bulle({ m, moi, debut, fin, lu, surRepondre, surMenu, surOuvrir, surCopier, cible }) {
  const [url, setUrl] = useState(m.media ? mediaEnCache(m.media) : null)
  const minuteur = useRef(null)

  useEffect(() => {
    if (!m.media) return undefined
    const deja = mediaEnCache(m.media)
    if (deja) { setUrl(deja); return undefined }
    let vif = true
    resoudreMedia(m.media).then((u) => { if (vif) setUrl(u) })
    return () => { vif = false }
  }, [m.media])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={'Message de ' + (m.auteur || 'Membre') + ' — actions'}
      onContextMenu={(e) => { e.preventDefault(); surMenu({ m, moi }) }}
      onTouchStart={() => { minuteur.current = setTimeout(() => surMenu({ m, moi }), 380) }}
      onTouchEnd={() => clearTimeout(minuteur.current)}
      onTouchMove={() => clearTimeout(minuteur.current)}
      onMouseDown={() => { minuteur.current = setTimeout(() => surMenu({ m, moi }), 500) }}
      onMouseUp={() => clearTimeout(minuteur.current)}
      onMouseLeave={() => clearTimeout(minuteur.current)}
      className={`relative max-w-[82%] px-3 py-2 shadow-sm ${
        moi ? 'rounded-2xl rounded-br-lg bg-brand-600 text-white' : 'rounded-2xl rounded-bl-lg bg-surface text-gray-800'
      } ${fin ? '' : 'rounded-t-2xl'}`}
    >
      {!moi && debut && <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-600">{m.auteur}</p>}

      {cible && (
        <div className={`mb-1 rounded-lg border-l-[3px] px-2 py-1 ${moi ? 'border-white/70 bg-white/15' : 'border-brand-500 bg-brand-50'}`}>
          <p className={`text-[10px] font-extrabold ${moi ? 'text-white/85' : 'text-brand-700'}`}>{cible.auteur}</p>
          <p className={`truncate text-[11px] ${moi ? 'text-white/80' : 'text-gray-600'}`}>{cible.texte || 'Photo'}</p>
        </div>
      )}

      {m.media && (
        <button type="button" className="mb-1 block w-full" onClick={() => url && surOuvrir(m.media)} aria-label="Ouvrir la photo">
          {url ? (
            <img src={url} alt="" className="max-h-64 w-full rounded-xl object-cover" />
          ) : (
            <span className="flex h-32 w-full items-center justify-center rounded-xl bg-[rgb(var(--track))] text-gray-400"><ImageIcon size={22} /></span>
          )}
        </button>
      )}

      {m.texte && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.texte}</p>}

      <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${moi ? 'text-white/70' : 'text-gray-400'}`}>
        {m.modifieLe && <span className="italic">modifié</span>}
        <span>{heure(m.date)}</span>
        {m.epingle && <Pin size={11} className={moi ? 'text-white/85' : 'text-brand-600'} aria-label="Épinglé" />}
        {moi && <Statut m={m} lu={lu} />}
        <button
          type="button"
          className="ml-0.5 rounded p-0.5 opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); surCopier(m) }}
          aria-label="Copier le message"
        ><Copy size={11} /></button>
        <button
          type="button"
          className="rounded p-0.5 opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); surRepondre(m) }}
          aria-label="Répondre"
        ><Reply size={11} /></button>
      </p>
    </div>
  )
}

// ✓ posé · ✓✓ passé au groupe · ⚠ jamais parti. Le statut vient de la file
// d'envoi locale, jamais d'une supposition : un message que le responsable n'a
// pas encore intégré reste visiblement « en attente ».
function Statut({ m, lu }) {
  if (m.statut === 'echoue') return <AlertCircle size={12} className="text-warning-200" aria-label="Envoi échoué — appuyez pour reprendre" />
  if (m.enAttente && m.statut !== 'envoye') return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/70" title="En attente de transmission au responsable" aria-label="En attente" />
  if (lu) return <CheckCheck size={13} className="text-info-200" aria-label="Lu" />
  return <Check size={12} aria-label="Envoyé" />
}

function findCible(messages, m) {
  if (!m || !m.repondreA) return null
  return messages.find((x) => cleMessage(x) === String(m.repondreA)) || null
}

// ── Menu appui-long ──────────────────────────────────────────
function MenuMessage({ m, moi, invite, onClose, surRepondre, surCopier, surEditer, surEpingle, surTransfert, surSupprimer }) {
  const options = [{ Icone: Reply, lib: 'Répondre', sur: () => surRepondre(m) }]
  if (m.texte) {
    options.push({ Icone: Copy, lib: 'Copier', sur: () => surCopier(m) })
    options.push({ Icone: Send, lib: 'Transférer sur WhatsApp', sur: () => surTransfert(m) })
  }
  if (!invite) {
    options.push({ Icone: Pin, lib: m.epingle ? 'Désépingler' : 'Épingler', sur: () => surEpingle(m) })
    if (moi && m.texte) options.push({ Icone: Sparkles, lib: 'Modifier', sur: () => surEditer(m) })
    options.push({ Icone: Trash2, lib: 'Supprimer', sur: () => surSupprimer(m), danger: true })
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 pb-safe" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-[rgb(var(--surface))] p-1.5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto my-2 h-1 w-10 rounded-full bg-[rgb(var(--border-strong))]" />
        {m.texte && <p className="truncate px-3 pb-2 text-[11px] font-semibold text-gray-400">{m.texte}</p>}
        {options.map(({ Icone, lib, sur, danger }) => (
          <button
            key={lib}
            type="button"
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition active:bg-[rgb(var(--surface-muted))] ${danger ? 'text-danger-600' : 'text-gray-800'}`}
            onClick={sur}
          >
            <Icone size={16} className={danger ? 'text-danger-500' : 'text-brand-600'} />
            {lib}
          </button>
        ))}
        <button type="button" className="mt-1 w-full rounded-2xl px-3 py-2.5 text-center text-sm font-extrabold text-gray-500" onClick={onClose}>Annuler</button>
      </div>
    </div>,
    document.body
  )
}

// ── Visionneuse photo ────────────────────────────────────────
function Visionneuse({ chemin, onClose }) {
  const [url, setUrl] = useState(mediaEnCache(chemin))
  useEffect(() => {
    if (url) return
    let vif = true
    resoudreMedia(chemin).then((u) => { if (vif) setUrl(u) })
    return () => { vif = false }
  }, [chemin, url])
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4" onClick={onClose}>
      {url ? <img src={url} alt="" className="max-h-[80vh] max-w-full rounded-2xl object-contain" /> : <Eye size={28} className="animate-pulse text-white/60" />}
      <button type="button" className="mt-4 rounded-full bg-white/15 px-5 py-2 text-sm font-extrabold text-white" onClick={onClose}>Fermer</button>
    </div>,
    document.body
  )
}
