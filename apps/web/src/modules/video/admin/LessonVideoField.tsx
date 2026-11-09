"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Lang = "fr" | "en"
type Status = "none" | "preparing" | "ready" | "errored"

const T = {
  fr: {
    title: "Vidéo",
    status: { none: "Aucune vidéo", preparing: "En préparation", ready: "Prête", errored: "En erreur" },
    duration: "Durée",
    upload: "Téléverser",
    replace: "Remplacer",
    preview: "Prévisualiser",
    saveFirst: "Enregistrez la leçon avant de téléverser une vidéo.",
    uploading: "Téléversement",
    processing: "Traitement en cours, la page se met à jour automatiquement.",
    failed: "Échec de l’opération. Réessayez.",
    previewOk: "Lien de lecture signé généré. Expire à",
    open: "Ouvrir",
    notConfigured: "Aucun fournisseur vidéo n’est configuré.",
  },
  en: {
    title: "Video",
    status: { none: "No video", preparing: "Preparing", ready: "Ready", errored: "Errored" },
    duration: "Duration",
    upload: "Upload",
    replace: "Replace",
    preview: "Preview",
    saveFirst: "Save the lesson before uploading a video.",
    uploading: "Uploading",
    processing: "Processing, this updates automatically.",
    failed: "The operation failed. Try again.",
    previewOk: "Signed playback link generated. Expires at",
    open: "Open",
    notConfigured: "No video provider is configured.",
  },
} as const

const POLL_MS = 5000

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Admin field for `lessons.video`: status, upload (XHR PUT with progress), replace, poll, preview. */
export function LessonVideoField() {
  // @payloadcms/ui is not a direct dependency (pnpm strict), so the lesson id and
  // language come from the admin URL / <html lang> and state from the REST API.
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>("fr")
  const [status, setStatus] = useState<Status>("none")
  const [duration, setDuration] = useState<number | undefined>()
  const [uploadId, setUploadId] = useState<string | undefined>()
  const t = T[lang]

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; expiresAt: string; fake: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const m = /\/collections\/lessons\/(\d+)/.exec(window.location.pathname)
    setLessonId(m?.[1] ?? null)
    setLang(document.documentElement.lang.startsWith("en") ? "en" : "fr")
  }, [])

  /** Read the server-recorded video group. Returns the status read. */
  const syncFromServer = useCallback(async (): Promise<Status | null> => {
    if (!lessonId) return null
    const res = await fetch(`/api/lessons/${lessonId}?depth=0`, { credentials: "include" })
    if (!res.ok) return null
    const doc = (await res.json()) as { video?: { status?: Status; durationSec?: number | null; uploadId?: string | null } }
    const next = doc.video?.status ?? "none"
    setStatus(next)
    setDuration(doc.video?.durationSec ?? undefined)
    setUploadId(doc.video?.uploadId ?? undefined)
    return next
  }, [lessonId])

  useEffect(() => {
    void syncFromServer()
  }, [syncFromServer])

  /**
   * The lesson form holds the video group as loaded; saving it later would write
   * those stale values over what the upload recorded. Reloading resets the form
   * from the database once a state change is final.
   */
  const reloadForm = () => window.location.reload()

  useEffect(() => {
    if (!lessonId || status !== "preparing" || !uploadId || progress !== null) return
    const tick = async () => {
      try {
        const res = await fetch(`/api/video/uploads/${encodeURIComponent(uploadId)}?lessonId=${lessonId}`, {
          credentials: "include",
        })
        if (res.ok && (await syncFromServer()) === "ready") reloadForm()
      } catch {
        // Transient network error: the next tick retries.
      }
    }
    const timer = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => clearInterval(timer)
  }, [lessonId, status, uploadId, progress, syncFromServer])

  const upload = useCallback(
    async (file: File) => {
      if (!lessonId) return
      setError(null)
      setPreview(null)
      setProgress(0)
      try {
        const created = await fetch("/api/video/uploads", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lessonId: Number(lessonId) }),
        })
        const body = (await created.json()) as { ok: boolean; data?: { uploadUrl: string } }
        if (!created.ok || !body.ok || !body.data) throw new Error("create")
        await syncFromServer()
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("PUT", body.data!.uploadUrl)
          xhr.withCredentials = body.data!.uploadUrl.startsWith(window.location.origin)
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
          }
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("put")))
          xhr.onerror = () => reject(new Error("put"))
          xhr.send(file)
        })
        reloadForm()
      } catch {
        setError(t.failed)
      } finally {
        setProgress(null)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [lessonId, syncFromServer, t.failed],
  )

  const runPreview = useCallback(async () => {
    if (!lessonId) return
    setError(null)
    try {
      const res = await fetch(`/api/video/playback?lessonId=${lessonId}`, { credentials: "include" })
      const body = (await res.json()) as { ok: boolean; data?: { url: string; expiresAt: string } }
      if (res.status === 503) return setError(t.notConfigured)
      if (!res.ok || !body.ok || !body.data) throw new Error("preview")
      const fake = new URL(body.data.url, window.location.origin).pathname === "/api/video/fake"
      setPreview({ url: body.data.url, expiresAt: body.data.expiresAt, fake })
    } catch {
      setError(t.failed)
    }
  }, [lessonId, t.failed, t.notConfigured])

  const hasVideo = status !== "none"
  const busy = progress !== null

  return (
    <div className="field-type" data-testid="lesson-video-field" style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 8px" }}>{t.title}</h3>
      {!lessonId ? (
        <p>{t.saveFirst}</p>
      ) : (
        <>
          <p data-testid="lesson-video-status" style={{ margin: "0 0 8px" }}>
            {t.status[status]}
            {status === "ready" && typeof duration === "number" ? ` · ${t.duration} ${formatDuration(duration)}` : ""}
          </p>
          {status === "preparing" && !busy ? <p>{t.processing}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            data-testid="lesson-video-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn--style-secondary btn--size-small" disabled={busy} onClick={() => inputRef.current?.click()}>
              {hasVideo ? t.replace : t.upload}
            </button>
            {status === "ready" ? (
              <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => void runPreview()}>
                {t.preview}
              </button>
            ) : null}
            {busy ? (
              <progress value={progress ?? 0} max={100} aria-label={t.uploading} style={{ width: 160 }}>
                {progress}%
              </progress>
            ) : null}
          </div>
          {error ? (
            <p role="alert" style={{ color: "var(--theme-error-500)" }}>
              {error}
            </p>
          ) : null}
          {preview ? (
            <div data-testid="lesson-video-preview" style={{ marginTop: 12 }}>
              <p>
                {t.previewOk} {new Date(preview.expiresAt).toLocaleTimeString(lang, { timeZone: "America/Toronto" })}.{" "}
                <a href={preview.url} target="_blank" rel="noreferrer">
                  {t.open}
                </a>
              </p>
              {preview.fake ? null : <video src={preview.url} controls style={{ maxWidth: "100%" }} />}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export default LessonVideoField
