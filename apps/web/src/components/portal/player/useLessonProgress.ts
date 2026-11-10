"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { beaconProgress, postProgress, type ProgressResult } from "./progress-client"

export const POSITION_SAVE_INTERVAL_MS = 15_000

export interface UseLessonProgressOptions {
  lessonId: number
  initialCompleted: boolean
  errorMessage: string
}

export interface LessonProgressApi {
  completed: boolean
  saving: boolean
  /** Set once the last lesson completes (or on load when the course is already done). */
  courseResult: ProgressResult | null
  markComplete: () => Promise<void>
  /** Throttled by the caller (interval + pause/ended); fire-and-forget. */
  savePosition: (positionSec: number) => void
  /** Remember the latest known position for the `pagehide` beacon. */
  trackPosition: (positionSec: number) => void
}

/**
 * Lesson progress with optimistic completion: flip immediately, roll back and
 * toast when the API refuses. Position saves are best effort (never block UI).
 */
export function useLessonProgress({ lessonId, initialCompleted, errorMessage }: UseLessonProgressOptions): LessonProgressApi {
  const router = useRouter()
  const [completed, setCompleted] = useState(initialCompleted)
  const [saving, setSaving] = useState(false)
  const [courseResult, setCourseResult] = useState<ProgressResult | null>(null)
  const [, startTransition] = useTransition()
  const lastPosition = useRef<number | null>(null)

  useEffect(() => {
    const onHide = () => {
      if (lastPosition.current !== null) beaconProgress({ lessonId, positionSec: lastPosition.current })
    }
    window.addEventListener("pagehide", onHide)
    return () => window.removeEventListener("pagehide", onHide)
  }, [lessonId])

  const trackPosition = useCallback((positionSec: number) => {
    lastPosition.current = Math.max(0, Math.floor(positionSec))
  }, [])

  const savePosition = useCallback(
    (positionSec: number) => {
      const sec = Math.max(0, Math.floor(positionSec))
      lastPosition.current = sec
      void postProgress({ lessonId, positionSec: sec })
    },
    [lessonId],
  )

  const markComplete = useCallback(async () => {
    if (completed || saving) return
    setCompleted(true)
    setSaving(true)
    const res = await postProgress({ lessonId, completed: true, ...(lastPosition.current !== null ? { positionSec: lastPosition.current } : {}) })
    setSaving(false)
    if (!res.ok) {
      setCompleted(false)
      toast.error(errorMessage)
      return
    }
    if (res.data.courseCompleted) setCourseResult(res.data)
    startTransition(() => router.refresh())
  }, [completed, errorMessage, lessonId, router, saving])

  return { completed, saving, courseResult, markComplete, savePosition, trackPosition }
}
