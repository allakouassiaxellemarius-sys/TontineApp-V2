import { useEffect } from 'react'
import { useData } from '../context/DataContext'
import { programmerRappelsLocaux } from '../lib/rappelLocal'

// Reprogramme les rappels locaux (échéances de tours) dès que les données
// changent (groupe créé, membre payé, tour avancé…).
export function useRappelsLocaux() {
  const { groups } = useData()
  useEffect(() => {
    programmerRappelsLocaux()
  }, [groups])
}
