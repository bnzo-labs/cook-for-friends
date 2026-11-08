import {
  issuePathToFieldKey,
  type CheckoutBody,
  type FieldErrors,
} from "./booking-validation"

export type CheckoutOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "sold_out"; available: number | null }
  | { kind: "fields"; fields: FieldErrors; globalKey: string | null }
  | { kind: "error"; key: string }

type Envelope = {
  ok?: boolean
  data?: { checkoutUrl?: unknown }
  error?: {
    code?: unknown
    messageKey?: unknown
    details?: { available?: unknown; issues?: unknown }
    issues?: unknown
  }
}

type Issue = { path: string; message: string }

const stripNs = (key: string): string => key.replace(/^errors\./, "")

function readIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (i): i is Issue =>
      typeof i === "object" && i !== null &&
      typeof (i as Issue).path === "string" && typeof (i as Issue).message === "string",
  )
}

/** POST /api/checkout and normalise the CONTRACT §2 envelope. */
export async function submitCheckout(body: CheckoutBody): Promise<CheckoutOutcome> {
  let res: Response
  try {
    res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { kind: "error", key: "UPSTREAM" }
  }
  const json = (await res.json().catch(() => null)) as Envelope | null

  if (res.ok && json?.ok && typeof json.data?.checkoutUrl === "string") {
    return { kind: "redirect", url: json.data.checkoutUrl }
  }
  const err = json?.error
  const code = typeof err?.code === "string" ? err.code : "UPSTREAM"

  if (code === "SOLD_OUT") {
    const a = err?.details?.available
    return { kind: "sold_out", available: typeof a === "number" ? a : null }
  }
  if (code === "VALIDATION") {
    const issues = readIssues(err?.details?.issues ?? err?.issues)
    const fields: FieldErrors = {}
    let globalKey: string | null = null
    for (const issue of issues) {
      const fieldKey = issuePathToFieldKey(issue.path)
      const isKey = issue.message.startsWith("errors.")
      if (fieldKey) {
        fields[fieldKey] = isKey
          ? { kind: "server", key: stripNs(issue.message) }
          : { kind: "local", code: fieldKey.endsWith("email") || fieldKey === "email" ? "email_invalid" : "required" }
      } else if (isKey && globalKey === null) {
        globalKey = stripNs(issue.message)
      }
    }
    return { kind: "fields", fields, globalKey: Object.keys(fields).length ? globalKey : (globalKey ?? "VALIDATION") }
  }
  const messageKey = typeof err?.messageKey === "string" ? stripNs(err.messageKey) : code
  return { kind: "error", key: messageKey }
}
