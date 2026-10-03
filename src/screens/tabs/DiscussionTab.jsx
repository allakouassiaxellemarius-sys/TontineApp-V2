import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Pin, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { haptic } from '../../lib/haptique'
import { couleurAvatar, heure, initiale, resumeDiscussion } from '../../lib/discussion'
import EmptyState from '../../components/EmptyState'

// L'onglet Groupe n'est qu'une vitrine : le fil se lit dans DiscussionScreen,
// plein écran. Cette carte donne l'état (dernier message, non-lus, épingle)
// et un accès direct.
export default function DiscussionTab({ group }) {
  const navigate = useNavigate()
  const { utilisateur } = useAuth()
  const { version } = useData()

  const resume = useMemo(() => resumeDiscussion(group, utilisateur), [group, utilisateur, version])
  const epingle = useMemo(
    () => [...(group.messages || [])].filter((m) => m.epingle).slice(-1)[0] || null,
    [group.messages, version]
  )

  const ouvrir = () => {
    haptic.tap()
    navigate('/groupe/' + group.id + '/discussion')
  }

  const recents = useMemo(
    () =>
      [...(group.messages || []), ...(group.pendingMessages || [])]
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-3),
    [group.messages, group.pendingMessages]
  )

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={ouvrir}
        className="card flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.99]"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
          <MessageCircle size={20} />
          {resume.nonLus > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-extrabold leading-none text-white">
              {resume.nonLus > 9 ? '9+' : resume.nonLus}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-extrabold text-gray-900">Discussion du groupe</span>
            {resume.nonLus > 0 && (
              <span className="shrink-0 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-danger-600">
                non lu
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">
            {resume.apercu || 'Aucun message pour l\u2019instant'}
          </span>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            {resume.total} message{resume.total > 1 ? 's' : ''}
            {resume.dernier ? ' · ' + heure(resume.dernier.date) : ''}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-gray-400" />
      </button>

      {epingle && (
        <div className="flex items-start gap-2 rounded-2xl bg-warning-50 p-3 ring-1 ring-warning-200">
          <Pin size={14} className="mt-0.5 shrink-0 text-warning-600" />
          <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-warning-900">
            <span className="font-extrabold">{epingle.auteur}</span> — {String(epingle.texte || 'Photo').slice(0, 120)}
          </p>
        </div>
      )}

      {recents.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Discussion vide"
          description="Lancez la conversation : les membres pourront répondre, épingler les accords et partager des photos."
          action={
            <button
              type="button"
              onClick={ouvrir}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_0_rgb(46_125_50)] active:translate-y-[2px] active:shadow-none"
            >
              Ouvrir la discussion
            </button>
          }
        />
      ) : (
        <div className="card space-y-2 p-3">
          {recents.map((m) => {
            const moi = utilisateur && (m.uid === utilisateur.uid || m.auteur === utilisateur.email)
            return (
              <div key={String(m.cle || m.id)} className="flex items-start gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-extrabold text-white ${
                    couleurAvatar(m.auteur)
                  }`}
                >
                  {initiale(m.auteur)}
                </span>
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-600">
                  <span className="font-extrabold text-gray-900">{moi ? 'Vous' : m.auteur}</span>{' '}
                  <span className="break-words">{String(m.texte || (m.media ? 'Photo' : ''))}</span>
                  {m.media && !m.texte ? <img src={m.media} alt="" className="mt-1 max-h-20 rounded-lg object-cover" /> : null}
                  {m.statut === 'echoue' && (
                    <span className="ml-1 font-extrabold text-danger-500">(échec d\u2019envoi)</span>
                  )}
                  <span className="ml-1 text-[10px] text-gray-400">{heure(m.date)}</span>
                </p>
              </div>
            )
          })}
          <button
            type="button"
            onClick={ouvrir}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500/10 py-2.5 text-xs font-extrabold text-brand-700 transition active:scale-[0.99]"
          >
            Voir toute la discussion
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <p className="text-center text-[11px] text-gray-400">
        {group.rejoint
          ? 'Vos messages partent vers le responsable, puis sont partagés au groupe.'
          : 'Vous pouvez écrire, répondre, épingler un accord et partager une photo.'}
      </p>
    </div>
  )
}
