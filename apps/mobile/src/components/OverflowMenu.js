import { useState } from 'react'
import ActionSheet from './ActionSheet'

// Wraps an item so a long press (or its ⋮ button) opens its actions in a bottom sheet.
// children({ onLongPress, openMenu }) renders the item; `header` sits at the top of the sheet.
export default function HoldMenu({ items, header = null, children }) {
  const [open, setOpen] = useState(false)
  const openMenu = () => setOpen(true)

  return (
    <>
      {children({ onLongPress: openMenu, openMenu })}
      <ActionSheet open={open} onClose={() => setOpen(false)} header={header} items={items} />
    </>
  )
}
