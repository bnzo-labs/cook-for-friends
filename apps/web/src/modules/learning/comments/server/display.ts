import type { Locale } from "@/modules/_shared"
import en from "@/i18n/messages/en.json"
import fr from "@/i18n/messages/fr.json"

type CommentMessages = { learning?: { comments?: { anonymousAuthor?: string } } }
const FALLBACK: Record<Locale, string> = {
  fr: (fr as CommentMessages).learning?.comments?.anonymousAuthor ?? "Participant·e",
  en: (en as CommentMessages).learning?.comments?.anonymousAuthor ?? "Participant",
}

/**
 * Q14: first name + last initial ("Marie D."). Only first name → first name.
 * Neither → localized "Participant·e" / "Participant". Never the email.
 */
export function authorDisplay(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  locale: Locale,
): string {
  const first = firstName?.trim()
  if (!first) return FALLBACK[locale]
  const initial = Array.from(lastName?.trim() ?? "")[0]
  return initial ? `${first} ${initial.toLocaleUpperCase(locale)}.` : first
}
