"use client"

import { useRef, useState, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { GuestFields } from "./GuestFields"
import { submitCheckout } from "./booking-api"
import {
  EMPTY_GUEST,
  buildCheckoutBody,
  clampQuantity,
  fieldKeyToId,
  validateBooking,
  type FieldError,
  type FieldErrors,
  type GuestDraft,
} from "./booking-validation"

export interface BookingFormProps {
  locale: "fr" | "en"
  courseId: number
  /** null for online courses (quantity fixed at 1, no guests). */
  sessionId: number | null
  initialQuantity: number
  /** min(maxSeatsPerPurchase, available) computed server-side. */
  maxQuantity: number
  soldOut: boolean
  unitPriceCents: number
  holdMinutes: number
  /** Pre-formatted "{total}" is built client-side from this locale tag. */
  currencyLocale: string
  taxNote: string
}

type Banner = { text: string }

export function BookingForm(props: BookingFormProps) {
  const { locale, courseId, sessionId, unitPriceCents, holdMinutes } = props
  const t = useTranslations("storefront.booking")
  const te = useTranslations("errors")
  const isOnline = sessionId === null

  const [maxQty, setMaxQty] = useState(props.maxQuantity)
  const [soldOut, setSoldOut] = useState(props.soldOut)
  const [quantity, setQuantity] = useState(isOnline ? 1 : clampQuantity(props.initialQuantity, props.maxQuantity))
  const [buyerEmail, setBuyerEmail] = useState("")
  const [guests, setGuests] = useState<GuestDraft[]>(() => Array.from({ length: 9 }, () => EMPTY_GUEST))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  const total = new Intl.NumberFormat(props.currencyLocale, { style: "currency", currency: "CAD" }).format(
    (unitPriceCents * quantity) / 100,
  )
  const guestCount = quantity - 1
  const emailRequired = quantity > 1
  const hint = guestCount === 0 ? t("hint_solo") : guestCount === 1 ? t("hint_one") : t("hint_other", { guests: guestCount })

  const fieldMessage = (error: FieldError): string => {
    if (error.kind === "local") return t(`error_${error.code}`)
    return te.has(error.key) ? te(error.key) : te("VALIDATION")
  }
  const errorText = (key: string): string => (te.has(key) ? te(key) : te("UPSTREAM"))

  const focusAfterRender = (id: string | null) => {
    requestAnimationFrame(() => {
      const el = id ? document.getElementById(id) : null
      ;(el ?? bannerRef.current)?.focus()
    })
  }

  const onQuantity = (value: string) => {
    const next = clampQuantity(Number(value), maxQty)
    setQuantity(next)
    setErrors({})
    setBanner(null)
    const url = new URL(window.location.href)
    url.searchParams.set("qty", String(next))
    window.history.replaceState(window.history.state, "", url)
  }

  const onGuest = (index: number, field: keyof GuestDraft, value: string) =>
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)))

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || soldOut) return
    const found = validateBooking({ quantity, buyerEmail, guests })
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setBanner({ text: t("error_summary") })
      focusAfterRender(fieldKeyToId(Object.keys(found)[0] ?? ""))
      return
    }
    submitting.current = true
    setLoading(true)
    setErrors({})
    setBanner(null)
    const outcome = await submitCheckout(
      buildCheckoutBody({ courseId, sessionId, quantity, buyerEmail, guests, locale }),
    )
    if (outcome.kind === "redirect") {
      window.location.assign(outcome.url)
      return
    }
    submitting.current = false
    setLoading(false)
    if (outcome.kind === "sold_out") {
      const left = outcome.available ?? 0
      setMaxQty(Math.max(left, 0))
      if (left <= 0) {
        setSoldOut(true)
        setBanner({ text: t("sold_out_message") })
      } else {
        setQuantity((q) => clampQuantity(q, left))
        setBanner({ text: left === 1 ? t("seats_left_message_one") : t("seats_left_message_other", { count: left }) })
      }
      focusAfterRender(null)
    } else if (outcome.kind === "fields") {
      setErrors(outcome.fields)
      setBanner({ text: outcome.globalKey ? errorText(outcome.globalKey) : t("error_summary") })
      focusAfterRender(Object.keys(outcome.fields).length ? fieldKeyToId(Object.keys(outcome.fields)[0] ?? "") : null)
    } else {
      setBanner({ text: errorText(outcome.key) })
      focusAfterRender(null)
    }
  }

  const options = Array.from({ length: Math.max(1, maxQty) }, (_, i) => i + 1)
  const locked = loading || soldOut

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div id="booking-alert" ref={bannerRef} tabIndex={-1} role="alert" aria-live="assertive" className="focus:outline-none">
        {banner ? (
          <p className="rounded-control border border-danger bg-surface p-4 text-sm font-medium text-danger">
            {banner.text}
          </p>
        ) : soldOut ? (
          <p className="rounded-control border border-border bg-surface-muted p-4 text-sm font-medium text-fg">
            {t("sold_out_message")}
          </p>
        ) : null}
      </div>

      {isOnline ? null : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity">{t("quantity_label")}</Label>
          <select
            id="quantity"
            name="quantity"
            value={quantity}
            disabled={locked}
            onChange={(e) => onQuantity(e.target.value)}
            aria-describedby="quantity-hint"
            className={cn(
              "h-11 w-full max-w-40 rounded-control border border-border bg-surface px-3 text-base text-fg",
              "hover:border-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {options.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p id="quantity-hint" className="text-sm text-fg-muted">{hint}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="buyer-email">{t("email_label")}</Label>
        <Input
          id="buyer-email"
          name="email"
          type="email"
          autoComplete="email"
          value={buyerEmail}
          disabled={locked}
          required={emailRequired}
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "buyer-email-error" : "buyer-email-hint"}
          onChange={(e) => setBuyerEmail(e.target.value)}
        />
        <p id="buyer-email-hint" className="text-sm text-fg-muted">
          {emailRequired ? t("email_required") : t("email_optional")}
        </p>
        {errors.email ? (
          <p id="buyer-email-error" className="text-sm text-danger">{fieldMessage(errors.email)}</p>
        ) : null}
      </div>

      {guestCount > 0 ? (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-fg">{t("guests_heading")}</h2>
            <p className="text-sm text-fg-muted">{t("guests_intro")}</p>
          </div>
          {guests.slice(0, guestCount).map((guest, i) => (
            <GuestFields
              key={i}
              index={i}
              value={guest}
              errors={errors}
              disabled={locked}
              fieldMessage={fieldMessage}
              onChange={onGuest}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-border pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-base font-medium text-fg">{t("total")}</span>
          <span className="font-display text-2xl font-semibold text-fg" aria-live="polite">{total}</span>
        </div>
        <p className="text-sm text-fg-muted">{props.taxNote}</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" loading={loading} disabled={soldOut} className="w-full sm:w-auto sm:self-start">
          {loading ? t("paying") : t("pay_total", { total })}
        </Button>
        <p className="text-sm text-fg-muted">
          {isOnline ? t("redirect_note_online") : t("redirect_note", { minutes: holdMinutes })}
        </p>
      </div>
    </form>
  )
}
