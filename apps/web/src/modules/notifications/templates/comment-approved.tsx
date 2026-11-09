/**
 * notifications/templates/comment-approved.tsx (CCR-W3-3).
 * Does NOT echo the comment body (can be long).
 */
import { render, toPlainText } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText } from "./shared"
import { CtaButton } from "./blocks"
import { getTranslator, type Translate } from "./i18n"

type Data = EmailData["comment-approved"]

function CommentApprovedEmail({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  return (
    <EmailLayout
      locale={locale}
      preview={t("preview", { lessonTitle: data.lessonTitle })}
      footer={t("footer")}
    >
      <Heading>{t("heading")}</Heading>
      <BodyText>
        {data.customerFirstName
          ? t("greeting", { name: data.customerFirstName })
          : t("greetingAnon")}
      </BodyText>
      <BodyText>
        {t("intro", { lessonTitle: data.lessonTitle, courseTitle: data.courseTitle })}
      </BodyText>
      <CtaButton href={data.lessonUrl}>{t("cta")}</CtaButton>
    </EmailLayout>
  )
}

export async function renderCommentApproved(locale: Locale, data: Data) {
  const t = getTranslator(locale, "commentApproved")
  const html = await render(<CommentApprovedEmail locale={locale} data={data} t={t} />)
  return { subject: t("subject"), html, text: toPlainText(html) }
}

export default CommentApprovedEmail
