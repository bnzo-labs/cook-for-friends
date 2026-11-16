"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

type Lang = "fr" | "en"
type Outcome = "refund" | "credit" | "none"
type Mode = "full" | "policy"

export type StaffPreview = {
  allowed: boolean
  reason?: string
  policy: { outcome: Outcome; percent: number; amount: number; hoursBefore: number }
  full: { outcome: "refund" | "none"; amount: number }
  retry: boolean
}

const T = {
  fr: {
    open: "Annuler la place",
    loading: "Calcul en cours…",
    title: "Annuler la place de",
    full: "Remboursement complet",
    fullRefund: (a: string) => `Rembourse ${a} à l’acheteur, quelle que soit la date.`,
    fullNothing: "Rien à rembourser : cette place a déjà été remboursée (par exemple depuis Stripe).",
    policy: "Selon la politique d’annulation",
    policyRefund: (a: string, p: number) => `Remboursement de ${a} (${p} %).`,
    policyCredit: (a: string) => `Crédit de ${a} : un code personnel est envoyé par courriel à l’acheteur.`,
    policyNone: "Aucun remboursement ni crédit.",
    retry: (a: string) => `Cette place est déjà annulée avec un remboursement de ${a}. S’il n’apparaît pas dans la commande (échec Stripe), confirmer le relance, sans jamais rembourser deux fois.`,
    notice: "L’acheteur (et l’invité, s’il y a lieu) reçoit un courriel. La place est libérée. Action irréversible.",
    confirm: "Confirmer l’annulation",
    cancel: "Fermer",
    done: (o: Outcome, a: string) =>
      o === "refund" ? `Place annulée. Remboursement de ${a} demandé à Stripe.` : o === "credit" ? `Place annulée. Crédit de ${a} envoyé.` : "Place annulée, sans montant.",
    notAllowed: "Cette place ne peut plus être annulée (déjà annulée ou remboursée).",
    errors: {
      UPSTREAM: "La place est annulée, mais Stripe n’a pas répondu. Réessayez dans quelques minutes : le remboursement sera relancé sans doublon.",
      CONFLICT: "Cette place a changé entre-temps (déjà annulée ou remboursement en cours). Rechargez la page.",
      RATE_LIMITED: "Trop d’annulations en peu de temps. Réessayez dans une heure.",
      FORBIDDEN: "Action réservée au personnel.",
      default: "L’annulation a échoué. Réessayez.",
    },
  },
  en: {
    open: "Cancel seat",
    loading: "Calculating…",
    title: "Cancel the seat of",
    full: "Full refund",
    fullRefund: (a: string) => `Refunds ${a} to the buyer, whatever the date.`,
    fullNothing: "Nothing left to refund: this seat was already refunded (e.g. from Stripe).",
    policy: "Per the cancellation policy",
    policyRefund: (a: string, p: number) => `Refund of ${a} (${p}%).`,
    policyCredit: (a: string) => `Credit of ${a}: a personal code is emailed to the buyer.`,
    policyNone: "No refund or credit.",
    retry: (a: string) => `This seat is already cancelled with a refund of ${a}. If it does not show in the order (Stripe failure), confirming retries it, never twice.`,
    notice: "The buyer (and the guest, if any) gets an email. The seat is released. Cannot be undone.",
    confirm: "Confirm cancellation",
    cancel: "Close",
    done: (o: Outcome, a: string) =>
      o === "refund" ? `Seat cancelled. Refund of ${a} requested from Stripe.` : o === "credit" ? `Seat cancelled. Credit of ${a} sent.` : "Seat cancelled, no amount.",
    notAllowed: "This seat can no longer be cancelled (already cancelled or refunded).",
    errors: {
      UPSTREAM: "The seat is cancelled but Stripe did not answer. Retry in a few minutes: the refund is retried without duplicates.",
      CONFLICT: "This seat changed meanwhile (already cancelled or refund in progress). Reload the page.",
      RATE_LIMITED: "Too many cancellations in a short time. Try again in an hour.",
      FORBIDDEN: "Staff only.",
      default: "The cancellation failed. Try again.",
    },
  },
} as const

const money = (cents: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "en" ? "en-CA" : "fr-CA", { style: "currency", currency: "CAD" }).format(cents / 100)

type ErrorKey = keyof (typeof T)["fr"]["errors"]

async function readError(res: Response): Promise<ErrorKey> {
  try {
    const body = (await res.json()) as { error?: { code?: string } }
    const code = body?.error?.code
    if (code === "UPSTREAM" || code === "CONFLICT" || code === "RATE_LIMITED" || code === "FORBIDDEN") return code
  } catch {
    // non-JSON error body → generic message
  }
  return "default"
}

/**
 * W4-07: staff "Annuler la place". Loads the exact outcome of both options from the staff-only
 * `GET /api/enrollments/:id/cancel`, then posts the chosen `mode`. Same-origin admin session.
 */
export function CancelSeatControl({ enrollmentId, lang, name }: { enrollmentId: number | string; lang: Lang; name: string }) {
  const t = T[lang]
  const router = useRouter()
  const [preview, setPreview] = useState<StaffPreview | null>(null)
  const [mode, setMode] = useState<Mode>("full")
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const load = () =>
    startTransition(async () => {
      setMessage(null)
      try {
        const res = await fetch(`/api/enrollments/${enrollmentId}/cancel`, { credentials: "same-origin", cache: "no-store" })
        if (!res.ok) {
          setMessage({ kind: "error", text: t.errors[await readError(res)] })
          return
        }
        const body = (await res.json()) as { data: StaffPreview }
        setPreview(body.data)
        setMode(body.data.retry ? "policy" : "full")
      } catch {
        setMessage({ kind: "error", text: t.errors.default })
      }
    })

  const confirm = () =>
    startTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${enrollmentId}/cancel`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        })
        if (!res.ok) {
          setMessage({ kind: "error", text: t.errors[await readError(res)] })
          return
        }
        const body = (await res.json()) as { data: { outcome: Outcome; amount: number } }
        setPreview(null)
        setMessage({ kind: "ok", text: t.done(body.data.outcome, money(body.data.amount, lang)) })
        router.refresh()
      } catch {
        setMessage({ kind: "error", text: t.errors.default })
      }
    })

  const status = message && (
    <p role={message.kind === "error" ? "alert" : "status"} style={{ margin: "6px 0 0", fontSize: 13, color: message.kind === "error" ? "var(--theme-error-500)" : "inherit" }}>
      {message.text}
    </p>
  )

  if (!preview) {
    return (
      <div>
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={load} disabled={pending} data-testid="cancel-seat-open">
          {pending ? t.loading : t.open}
        </button>
        {status}
      </div>
    )
  }

  const p = preview.policy
  const policyText =
    p.outcome === "refund" ? t.policyRefund(money(p.amount, lang), p.percent) : p.outcome === "credit" ? t.policyCredit(money(p.amount, lang)) : t.policyNone
  const fullText = preview.full.amount > 0 ? t.fullRefund(money(preview.full.amount, lang)) : t.fullNothing
  const box = { border: "1px solid var(--theme-elevation-150)", borderRadius: 4, padding: 12, marginTop: 8, maxWidth: 520 } as const

  return (
    <div role="group" aria-label={`${t.title} ${name}`} style={box} data-testid="cancel-seat-panel">
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
        {t.title} {name}
      </p>
      {!preview.allowed ? (
        <p>{t.notAllowed}</p>
      ) : preview.retry ? (
        <p>{t.retry(money(p.amount, lang))}</p>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">{t.open}</legend>
          {(
            [
              ["full", t.full, fullText],
              ["policy", t.policy, policyText],
            ] as const
          ).map(([value, label, detail]) => (
            <label key={value} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, cursor: "pointer" }}>
              <input type="radio" name={`cancel-mode-${enrollmentId}`} value={value} checked={mode === value} onChange={() => setMode(value)} />
              <span>
                <strong>{label}</strong>
                <br />
                <span style={{ fontSize: 13 }}>{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {preview.allowed && <p style={{ fontSize: 13, margin: "8px 0" }}>{t.notice}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {preview.allowed && (
          <button type="button" className="btn btn--style-primary btn--size-small" onClick={confirm} disabled={pending} data-testid="cancel-seat-confirm">
            {t.confirm}
          </button>
        )}
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => setPreview(null)} disabled={pending}>
          {t.cancel}
        </button>
      </div>
      {status}
    </div>
  )
}
