import { createContext, useContext, useState } from 'react'

const TutorielContext = createContext({ relance: false, relancer: () => {}, resetRelance: () => {} })

export function useTutoriel() {
  return useContext(TutorielContext)
}

export function TutorielProvider({ children }) {
  const [relance, setRelance] = useState(false)
  return (
    <TutorielContext.Provider
      value={{
        relance,
        relancer: () => setRelance(true),
        resetRelance: () => setRelance(false),
      }}
    >
      {children}
    </TutorielContext.Provider>
  )
}
