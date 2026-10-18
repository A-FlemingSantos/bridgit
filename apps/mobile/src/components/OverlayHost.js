import { createContext, Fragment, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'

// Overlays (bottom sheets, the side panel) drawn above every screen in the app's own window.
// A React Native Modal opens a separate Android window, which brings its own white navigation bar
// and a first frame laid out before it is sized; drawing here avoids both.
function createOverlayStore() {
  let entries = []
  const listeners = new Set()
  const emit = () => listeners.forEach((listener) => listener())
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => entries,
    // Keeps an overlay's place in the stack when it re-renders; a new one goes on top.
    set(id, node) {
      const at = entries.findIndex(([key]) => key === id)
      entries = at < 0 ? [...entries, [id, node]] : entries.map((entry, index) => (index === at ? [id, node] : entry))
      emit()
    },
    remove(id) {
      if (!entries.some(([key]) => key === id)) return
      entries = entries.filter(([key]) => key !== id)
      emit()
    },
  }
}

const OverlayContext = createContext(null)
let sequence = 0

export function OverlayHost({ children }) {
  const [store] = useState(createOverlayStore)
  const entries = useSyncExternalStore(store.subscribe, store.get, store.get)

  return (
    <OverlayContext.Provider value={store}>
      {children}
      <View pointerEvents="box-none" style={styles.layer}>
        {entries.map(([id, node]) => <Fragment key={id}>{node}</Fragment>)}
      </View>
    </OverlayContext.Provider>
  )
}

// Renders `children` in the host instead of where it is declared. Context comes from the host's
// place in the tree (theme, session, hub), not from the declaring screen.
export function Overlay({ children }) {
  const store = useContext(OverlayContext)
  if (!store) throw new Error('Overlay must be used inside OverlayHost')
  const id = useRef(null)
  if (id.current === null) {
    sequence += 1
    id.current = sequence
  }

  useLayoutEffect(() => {
    store.set(id.current, children)
  })

  useLayoutEffect(() => {
    const key = id.current
    return () => store.remove(key)
  }, [store])

  return null
}

const styles = StyleSheet.create({
  // Above the navigator's screens, which stack with their own z-index.
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
})
