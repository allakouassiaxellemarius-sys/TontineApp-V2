import { createContext, useContext } from 'react'

export const ActionsContext = createContext(null)

export const useActions = () => useContext(ActionsContext)
