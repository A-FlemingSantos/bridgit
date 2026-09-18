import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { loadState, reducer, saveState } from './hubStore.js'

const HubContext = createContext(null)

export function HubProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  const api = useMemo(
    () => ({
      state,
      dispatch,
      openOverlay: (overlay) => dispatch({ type: 'openOverlay', overlay }),
      closeOverlay: () => dispatch({ type: 'closeOverlay' }),
    }),
    [state],
  )

  return <HubContext.Provider value={api}>{children}</HubContext.Provider>
}

export function useHub() {
  const value = useContext(HubContext)
  if (!value) {
    throw new Error('useHub must be used within HubProvider')
  }
  return value
}
