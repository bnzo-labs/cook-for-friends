"use client"

import { useEffect, useRef } from "react"

/**
 * The lesson `h1`. Focus moves here whenever a lesson mounts (DESIGN_SPEC §5:
 * route change in the player lands on the lesson title). Lessons share one
 * route segment, so the parent keys this by lesson id.
 */
export function LessonHeading({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: false })
  }, [])
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      data-lesson-heading
      className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg focus:outline-none"
    >
      {children}
    </h1>
  )
}
