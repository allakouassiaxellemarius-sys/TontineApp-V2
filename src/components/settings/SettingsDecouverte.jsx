import { BookOpen, GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTutoriel } from '../../context/TutorielContext'
import SectionCard from './SectionCard'

export default function SettingsDecouverte() {
  const navigate = useNavigate()
  const { relancer } = useTutoriel()

  return (
    <SectionCard icon={GraduationCap} title="Découverte">
      <button className="btn btn-secondary w-full" onClick={() => navigate('/aide')}>
        <BookOpen size={15} /> Aide &amp; tutoriel
      </button>
      <button className="btn btn-ghost mt-2 w-full justify-start text-sm" onClick={relancer}>
        <GraduationCap size={15} /> Revoir le tutoriel
      </button>
    </SectionCard>
  )
}
