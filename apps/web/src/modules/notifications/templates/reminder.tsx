/**
 * notifications/templates/reminder.tsx — class reminder (CCR-W3-3).
 * Sent to every attendee (guests included) in their own locale. `.ics` comes
 * from enqueueEmail({ ics }). URLs are built by the sender.
 */
import { render, toPlainText } from "@react-email/components"
import { Link } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted, brandColors } from "./shared"
import { AccountBlock, Card, CardLine, CardTitle, LocationLine, MapsLink } from "./blocks"
import {
  formatDateTime,
  getTranslator,
  googleCalendarUrl,
  locationString,
  type Translate,
} from "./i18n"

type Data = EmailData["reminder"]

function ReminderEmail({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  const hours = { hoursBefore: data.hoursBefore }
  return (
    <EmailLayout locale={locale} preview={t("preview", hours)} footer={t("footer")}>
      <Heading>{t("heading")}</Heading>
      <BodyText>
        {data.attendeeFirstName
          ? t("greeting", { name: data.attendeeFirstName })
          : t("greetingAnon")}
      </BodyText>
      <BodyText>{t("intro", { courseTitle: data.courseTitle, ...hours })}</BodyText>

      <Card>
        <CardTitle>{data.courseTitle}</CardTitle>
        <CardLine>
          {t("dateLabel")} {formatDateTime(data.sessionStartsAt, locale)}
        </CardLine>
        <LocationLine location={data.location} label={t("locationLabel")} />
        <MapsLink location={data.location} label={t("mapsLink")} />
        <Link
          href={googleCalendarUrl(
            data.courseTitle,
            data.sessionStartsAt,
            data.sessionEndsAt,
            locationString(data.location),
          )}
          style={{
            display: "inline-block",
            marginTop: "8px",
            color: brandColors.accent,
            fontSize: "13px",
          }}
        >
          {t("addToCalendar")}
        </Link>
      </Card>

      <AccountBlock url={data.accountUrl} intro={t("accountIntro")} cta={t("accountCta")} />
      {data.contactEmail && <Muted>{t("contact", { email: data.contactEmail })}</Muted>}
    </EmailLayout>
  )
}

export async function renderReminder(locale: Locale, data: Data) {
  const t = getTranslator(locale, "reminder")
  const html = await render(<ReminderEmail locale={locale} data={data} t={t} />)
  return {
    subject: t("subject", { courseTitle: data.courseTitle, hoursBefore: data.hoursBefore }),
    html,
    text: toPlainText(html),
  }
}

export default ReminderEmail
