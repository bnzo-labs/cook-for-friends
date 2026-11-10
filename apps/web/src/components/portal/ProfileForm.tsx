"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { FormField } from "./FormField"
import type { ProfileActionState } from "./profile-state"
import type { ProfileField, ProfileFieldError } from "./profile-validation"

export type ProfileFormValues = {
  email: string
  firstName: string
  lastName: string
  phone: string
  dietaryNotes: string
  preferredLocale: "fr" | "en"
  marketingConsent: boolean
}

export interface ProfileFormProps {
  values: ProfileFormValues
  /** True right after a locale-switch redirect, so the confirmation survives the navigation. */
  savedFlash: boolean
  action: (prev: ProfileActionState, data: FormData) => Promise<ProfileActionState>
}

const areaClass = cn(
  "min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-fg",
  "transition-[border-color,box-shadow] duration-(--duration-fast) ease-out hover:border-fg-subtle",
  "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
)
const selectClass = cn(
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-fg",
  "hover:border-fg-subtle focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
)

export function ProfileForm({ values, savedFlash, action }: ProfileFormProps) {
  const t = useTranslations("portal.profile")
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(action, { status: "idle" })
  const errors = state.status === "error" ? (state.errors ?? {}) : {}

  const err = (field: ProfileField): string | undefined => {
    const e: ProfileFieldError | undefined = errors[field]
    if (!e) return undefined
    return e.code === "too_long" ? t("errors.too_long", { max: e.max }) : t(`errors.${e.code}`)
  }
  const saved = state.status === "saved" || (state.status === "idle" && savedFlash)

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-5">
      <FormField id="profile-email" label={t("email_label")} help={t("email_help")}>
        {(c) => <Input {...c} name="email" type="email" value={values.email} readOnly className="bg-surface-muted" />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="profile-first" label={t("first_name")} error={err("firstName")}>
          {(c) => <Input {...c} name="firstName" autoComplete="given-name" defaultValue={values.firstName} />}
        </FormField>
        <FormField id="profile-last" label={t("last_name")} error={err("lastName")}>
          {(c) => <Input {...c} name="lastName" autoComplete="family-name" defaultValue={values.lastName} />}
        </FormField>
      </div>
      <FormField id="profile-phone" label={t("phone")} help={t("phone_help")} error={err("phone")}>
        {(c) => <Input {...c} name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={values.phone} />}
      </FormField>
      <FormField id="profile-dietary" label={t("dietary")} help={t("dietary_help")} error={err("dietaryNotes")}>
        {(c) => <textarea {...c} name="dietaryNotes" rows={3} defaultValue={values.dietaryNotes} className={areaClass} />}
      </FormField>
      <FormField id="profile-language" label={t("language")} help={t("language_help")} error={err("preferredLocale")}>
        {(c) => (
          <select {...c} name="preferredLocale" defaultValue={values.preferredLocale} className={selectClass}>
            <option value="fr">{t("lang_fr")}</option>
            <option value="en">{t("lang_en")}</option>
          </select>
        )}
      </FormField>
      <div className="flex items-start gap-3">
        <input
          id="profile-consent"
          type="checkbox"
          name="marketingConsent"
          defaultChecked={values.marketingConsent}
          aria-describedby="profile-consent-help"
          className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="profile-consent" className="text-fg">
            {t("consent")}
          </label>
          <p id="profile-consent-help" className="text-sm text-fg-muted">
            {t("consent_help")}
          </p>
        </div>
      </div>
      <div aria-live="polite" className="min-h-6">
        {state.status === "error" && !state.errors ? <p className="font-medium text-danger">{t("error_generic")}</p> : null}
        {state.status === "error" && state.errors ? <p className="font-medium text-danger">{t("error_summary")}</p> : null}
        {saved ? <p data-profile-saved className="font-medium text-fg">{t("saved")}</p> : null}
      </div>
      <Button type="submit" loading={pending} className="self-start">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  )
}
