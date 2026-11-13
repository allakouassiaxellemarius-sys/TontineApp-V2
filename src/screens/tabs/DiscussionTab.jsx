import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Pin, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { haptic } from '../../lib/haptique'
import { couleurAvatar, heure, initiale, resumeDiscussion } from '../../lib/discussion'

// L'onglet Discussion est une entrée de liste façon messagerie : avatar, nom
// du fil, dernier message, heure et compteur de non-lus. Le fil complet
// s'ouvre en plein écran.
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

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={ouvrir}
        className="card flex w-full items-center gap-3 p-3.5 text-left"
      >
        <span className={`flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full text-base font-extrabold text-white ${couleurAvatar(group.nom)}`}>
          {initiale(group.nom)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-extrabold text-gray-900">Discussion du groupe</span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold text-gray-400">
              {resume.dernier ? heure(resume.dernier.date) : ''}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={`min-w-0 flex-1 truncate text-xs ${resume.dernier ? 'font-semibold text-gray-500' : 'text-gray-400'}`}>
              {resume.apercu || 'Aucun message pour l\u2019instant'}
            </span>
            {resume.nonLus > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-extrabold text-white">
                {resume.nonLus > 9 ? '9+' : resume.nonLus}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-gray-400" />
      </button>

      {epingle && (
        <button
          type="button"
          onClick={ouvrir}
          className="flex w-full items-start gap-2 rounded-2xl bg-warning-50 p-3 text-left ring-1 ring-warning-200"
        >
          <Pin size={14} className="mt-0.5 shrink-0 text-warning-600" />
          <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-warning-900">
            <span className="font-extrabold">{epingle.auteur}</span> — {String(epingle.texte || 'Photo').slice(0, 120)}
          </p>
        </button>
      )}

      {!resume.dernier && (
        <button type="button" onClick={ouvrir} className="btn btn-primary w-full">
          <MessageCircle size={16} /> Ouvrir la discussion
        </button>
      )}
    </div>
  )
}
