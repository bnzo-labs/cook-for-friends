"use client"

import { useState, useTransition } from "react"

type Attendance = "unknown" | "present" | "absent"

const LABELS = {
  fr: { label: "Présence", unknown: "À confirmer", present: "Présent", absent: "Absent", error: "Échec de l'enregistrement.", disabled: "Disponible le jour du cours" },
  en: { label: "Attendance", unknown: "Unknown", present: "Present", absent: "Absent", error: "Could not save.", disabled: "Available on the day of the class" },
} as const

/**
 * Present / absent / unknown control for one seat. Posts to the staff-only
 * `/api/enrollments/:id/attendance`. Disabled until the session day (Toronto).
 */
export function AttendanceControl({
  enrollmentId,
  initial,
  lang,
  disabled,
  name,
}: {
  enrollmentId: number | string
  initial: Attendance
  lang: "fr" | "en"
  disabled: boolean
  name: string
}) {
  const t = LABELS[lang]
  const [value, setValue] = useState<Attendance>(initial)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const save = (next: Attendance) => {
    const previous = value
    setValue(next)
    setFailed(false)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${enrollmentId}/attendance`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ attendance: next }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } catch {
        setValue(previous)
        setFailed(true)
      }
    })
  }

  return (
    <div>
      <select
        data-testid="attendance-select"
        aria-label={`${t.label} — ${name}`}
        value={value}
        disabled={disabled || pending}
        title={disabled ? t.disabled : undefined}
        onChange={(e) => save(e.target.value as Attendance)}
        style={{ minWidth: 120 }}
      >
        <option value="unknown">{t.unknown}</option>
        <option value="present">{t.present}</option>
        <option value="absent">{t.absent}</option>
      </select>
      {failed && (
        <span role="alert" style={{ marginLeft: 6, fontSize: 12, color: "var(--theme-error-500)" }}>
          {t.error}
        </span>
      )}
    </div>
  )
}
