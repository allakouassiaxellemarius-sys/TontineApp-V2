import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, Trash2 } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { envoyerMessage, envoyerMessageInvite, supprimerMessage } from '../../lib/db'
import { publierMessageInvite } from '../../lib/sync'
import EmptyState from '../../components/EmptyState'

// ── Helpers de date façon WhatsApp ──────────────────────────────
function heure(iso) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function cleJour(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return String(iso || '')
  }
}

function libelleJour(iso) {
  try {
    const d = new Date(iso)
    const aujourd = new Date()
    aujourd.setHours(0, 0, 0, 0)
    const hier = new Date(aujourd)
    hier.setDate(aujourd.getDate() - 1)
    const deb = new Date(d)
    deb.setHours(0, 0, 0, 0)
    if (+deb === +aujourd) return "Aujourd'hui"
    if (+deb === +hier) return 'Hier'
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return String(iso || '')
  }
}

// Couleur d'avatar stable pour un auteur donné (pastel du thème).
const COULEURS_AVATAR = [
  'bg-info-400', 'bg-success-500', 'bg-warning-500', 'bg-brand-500',
  'bg-danger-400', 'bg-gray-400', 'bg-brand-400', 'bg-info-500',
]
function initiale(nom) {
  const n = String(nom || '').trim()
  return n ? n.charAt(0).toUpperCase() : '?'
}
function couleurAvatar(nom) {
  let h = 0
  const n = String(nom || '')
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return COULEURS_AVATAR[h % COULEURS_AVATAR.length]
}

// Séparer les messages consécutifs du même auteur en « groupes » :
// même façon que WhatsApp, les bulles d'une même personne sont collées.
const FENETRE_GROUPE_MS = 10 * 60 * 1000

export default function DiscussionTab({ group, readOnly }) {
  const { refresh } = useData()
  const { utilisateur } = useAuth()
  const toast = useToast()
  const [texte, setTexte] = useState('')
  const basRef = useRef(null)

  // Un invité peut écrire : ses messages partent par le canal du responsable et
  // s'affichent en local (en attente) tant qu'ils ne sont pas confirmés.
  const estInvite = !!group.rejoint

  const messages = useMemo(
    () =>
      [...(group.messages || []), ...(group.pendingMessages || [])]
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [group.messages, group.pendingMessages]
  )
  const estMoi = (m) =>
    (utilisateur && m.uid && m.uid === utilisateur.uid) ||
    (utilisateur && (m.auteur === utilisateur.email || m.auteur === (utilisateur.displayName || '')))
  const monAuteur = utilisateur ? utilisateur.displayName || utilisateur.email : ''

  // Lignes de rendu : séparateurs de jour + messages annotés début/fin de groupe.
  const lignes = useMemo(() => {
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
      const memeAuteur = (a, b) => !!a && !!b && a.auteur === b.auteur
      let fenetreOk = true
      if (prec) {
        const ecart = new Date(m.date).getTime() - new Date(prec.date).getTime()
        fenetreOk = ecart >= 0 && ecart <= FENETRE_GROUPE_MS
      }
      const debut = !(memeAuteur(prec, m) && fenetreOk)
      const fin = !(memeAuteur(m, suiv) && fenetreOk)
      rows.push({ type: 'message', m, debut, fin, cle: m.id })
    })
    return rows
  }, [messages])

  useEffect(() => {
    basRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length])

  const poster = () => {
    if (!texte.trim()) return
    const invite = !!group.rejoint
    const m = invite
      ? envoyerMessageInvite(
          group.id,
          texte.trim(),
          monAuteur || 'Membre',
          utilisateur ? utilisateur.uid : null,
          utilisateur ? utilisateur.email : null
        )
      : envoyerMessage(
          group.id,
          texte.trim(),
          monAuteur || 'Membre',
          utilisateur ? utilisateur.uid : null,
          utilisateur ? utilisateur.email : null
        )
    if (!m) {
      toast.error('Envoi impossible hors connexion')
      return
    }
    setTexte('')
    if (invite && m.enAttente && group.codeUnique) {
      publierMessageInvite(group.codeUnique, m).catch(() => {})
    }
    refresh()
    haptic.tap()
  }

  return (
    <div className="space-y-4">
      <div className="card flex max-h-[62vh] min-h-72 flex-col overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageCircle}
              title="Discussion vide"
              description="Écrivez le premier message. Tout le monde peut participer, les messages sont partagés avec le groupe."
            />
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto bg-[rgb(var(--surface-muted))] p-3">
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
              const { m, debut, fin } = row
              const moi = estMoi(m)
              const nom = moi ? 'Vous' : m.auteur
              return (
                <div
                  key={row.cle}
                  className={`flex items-end gap-1.5 ${moi ? 'justify-end' : 'justify-start'} ${
                    debut ? 'mt-2.5' : 'mt-0.5'
                  }`}
                >
                  {!moi && (
                    <span
                      className={`mb-1 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-extrabold text-white ${
                        couleurAvatar(m.auteur)
                      }`}
                    >
                      {initiale(m.auteur)}
                    </span>
                  )}
                  <div
                    className={`group relative max-w-[82%] px-3.5 py-2 shadow-sm ${
                      moi
                        ? 'rounded-2xl rounded-br-lg bg-brand-600 text-white'
                        : 'rounded-2xl rounded-bl-lg bg-surface text-gray-800'
                    } ${fin ? '' : 'rounded-t-2xl'}`}
                  >
                    {!moi && debut && (
                      <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-600">
                        {m.auteur}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{m.texte}</p>
                    <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${moi ? 'text-white/70' : 'text-gray-400'}`}>
                      <span>{heure(m.date)}</span>
                      {moi && m.enAttente ? (
                        <span className="font-bold" title="En attente de transmission par le responsable">envoi…</span>
                      ) : moi ? (
                        <svg viewBox="0 0 16 12" className="h-3 w-3.5 fill-current" aria-label="Envoyé">
                          <path d="M13.7 2.3 6 10 2.3 6.3 3.7 4.9 6 7.2l9-9z" />
                        </svg>
                      ) : null}
                      {!readOnly && !estInvite && (
                        <button
                          className={`ml-0.5 rounded p-0.5 ${moi ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-danger-500'}`}
                          onClick={() => { supprimerMessage(group.id, m.id); refresh(); haptic.tap(); toast.info('Message supprimé') }}
                          aria-label="Supprimer le message"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={basRef} />
          </div>
        )}
        <div className="flex items-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5">
          <textarea
            className="min-h-0 flex-1 resize-none rounded-3xl border-2 border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-muted))] px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none transition placeholder:font-normal placeholder:text-gray-400 focus:border-brand-500"
            rows={1}
            placeholder={readOnly
              ? 'Lecture seule — les messages sont gérés par le groupe'
              : estInvite
                ? 'Écrivez au groupe (transmis par le responsable)…'
                : 'Votre message…'}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); poster() } }}
            disabled={readOnly}
          />
          <button
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition ${
              readOnly || !texte.trim()
                ? 'cursor-not-allowed bg-gray-300'
                : 'bg-brand-600 shadow-[0_3px_0_rgb(46_125_50)] active:translate-y-[2px] active:shadow-none'
            }`}
            onClick={poster}
            disabled={readOnly || !texte.trim()}
            aria-label="Envoyer"
          >
            <Send size={16} className="ml-0.5" />
          </button>
        </div>
      </div>
      {!readOnly && (
        <p className="text-center text-[11px] text-gray-400">
          {estInvite
            ? 'Votre message est transmis au responsable puis partagé avec le groupe.'
            : 'Le responsable partage la discussion avec les membres synchronisés.'}
        </p>
      )}
    </div>
  )
}
