import { useEffect, useState, type RefObject } from 'react'

/** Leaving is a little faster than entering (200ms in, 150ms out); see the motion section in app.css. */
export const EXIT_MS = 150

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Opens a native <dialog> as a modal while `open` is true, and on close plays the exit animation before calling
 * close(), so the content stays on screen while it fades. Returns whether to render the content and whether it is
 * leaving (the `is-closing` class).
 */
export function useModalDialog(open: boolean, ref: RefObject<HTMLDialogElement | null>) {
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)

  if (open && !present) setPresent(true)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      setClosing(false)
      if (!dialog.open) dialog.showModal()
      return
    }
    if (!dialog.open) return
    if (prefersReducedMotion()) {
      dialog.close()
      setPresent(false)
      return
    }
    setClosing(true)
    const id = window.setTimeout(() => {
      dialog.close()
      setClosing(false)
      setPresent(false)
    }, EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open, ref])

  return { present: open || present, closing }
}
