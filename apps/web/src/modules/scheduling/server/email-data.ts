import enMsg from "@/i18n/messages/en.json"
import frMsg from "@/i18n/messages/fr.json"
import type { Locale } from "@/modules/_shared"
import type { SessionView } from "@/modules/catalog"
import type { EmailData, IcsInput } from "@/modules/notifications"

import { courseUrl } from "./urls"

export type EmailLocation = EmailData["reminder"]["location"]

const MESSAGES = { fr: frMsg, en: enMsg } as const

export function emailLocation(view: SessionView): EmailLocation {
  const l = view.location
  return {
    name: l.name ?? "",
    address: l.address ?? "",
    city: l.city ?? "",
    ...(l.postalCode ? { postalCode: l.postalCode } : {}),
    ...(l.mapsUrl ? { mapsUrl: l.mapsUrl } : {}),
  }
}

/** `.ics` for a session, uid `session-<id>@cookforfriends` (same event for every attendee). */
export async function sessionIcs(view: SessionView, locale: Locale): Promise<IcsInput[]> {
  const loc = emailLocation(view)
  const description = MESSAGES[locale].scheduling.ics_description.replace("{course}", view.courseTitle)
  return [
    {
      uid: `session-${view.id}@cookforfriends`,
      title: view.courseTitle,
      description,
      location: [loc.name, loc.address, [loc.city, loc.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      startsAt: view.startsAt,
      endsAt: view.endsAt,
      url: await courseUrl(locale, view.courseSlug),
    },
  ]
}
