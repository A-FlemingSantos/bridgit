import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MENU_WIDTH,
  placeOverflowMenu,
  resolveOverflowHost,
} from '../OverflowMenu/placeOverflowMenu.js'
import SuspendedMenu from './SuspendedMenu.jsx'

export default function AnchoredSuspendedMenu({
  id,
  labelledBy,
  open,
  closing,
  items,
  triggerRef,
  hostRef = null,
  panelRef = null,
  prefer = 'beside',
}) {
  const [coords, setCoords] = useState(null)
  const visible = open || closing
  const hasDanger = items.some((item) => item.danger)

  useLayoutEffect(() => {
    if (!visible) return undefined

    function update() {
      const trigger = triggerRef.current
      if (!trigger) return
      const host = hostRef?.current ?? resolveOverflowHost(trigger)
      setCoords(
        placeOverflowMenu({
          trigger: trigger.getBoundingClientRect(),
          host: host.getBoundingClientRect(),
          itemCount: items.length,
          hasDanger,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          prefer,
        }),
      )
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [visible, items.length, hasDanger, triggerRef, hostRef, prefer])

  const panel = (
    <SuspendedMenu
      id={id}
      labelledBy={labelledBy}
      open={open}
      closing={closing}
      items={items}
      panelRef={panelRef}
      anchored
      style={coords ?? { top: -9999, left: -9999, width: MENU_WIDTH }}
    />
  )

  return typeof document === 'undefined' ? panel : createPortal(panel, document.body)
}
