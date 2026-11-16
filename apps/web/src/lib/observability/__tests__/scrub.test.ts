import { describe, expect, it } from "vitest"

import { REDACTED, scrubEvent, scrubUrl } from "../scrub"

const dump = (v: unknown) => JSON.stringify(v)

describe("scrubEvent — magic-link verify request", () => {
  const event = {
    message: "Verify failed for marie.tremblay@example.com",
    user: { id: "cust_1", email: "marie.tremblay@example.com", ip_address: "1.2.3.4", username: "marie" },
    request: {
      url: "https://cookforfriends.ca/fr/auth/verify?token=abc123secret&next=/fr/account&locale=fr",
      method: "GET",
      cookies: { session: "s3cr3t" },
      query_string: "token=abc123secret&next=%2Ffr%2Faccount",
      headers: {
        Cookie: "cff_session=s3cr3t",
        Authorization: "Bearer xyz",
        "stripe-signature": "t=1,v1=deadbeef",
        "Mux-Signature": "t=1,v1=cafe",
        "x-vercel-protection-bypass": "bypass-token",
        "user-agent": "Mozilla/5.0",
        referer: "https://cookforfriends.ca/fr/auth/sign-in?code=9999&session_id=cs_test_1",
      },
      data: { email: "marie.tremblay@example.com" },
    },
  }
  const out = scrubEvent(event)

  it("drops cookies, secret headers, bodies and user pii", () => {
    const s = dump(out)
    expect(s).not.toContain("s3cr3t")
    expect(s).not.toContain("Bearer xyz")
    expect(s).not.toContain("deadbeef")
    expect(s).not.toContain("cafe")
    expect(s).not.toContain("bypass-token")
    expect(s).not.toContain("1.2.3.4")
    expect(out.request.data).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(out.request.query_string).toBeUndefined()
    expect(out.user).toEqual({ id: "cust_1" })
    expect(out.request.headers["user-agent"]).toBe("Mozilla/5.0")
  })

  it("redacts emails and strips token/next/code/session_id query params", () => {
    const s = dump(out)
    expect(s).not.toMatch(/marie|@example\.com/)
    expect(s).not.toMatch(/abc123secret|next=|code=|session_id=|cs_test_1|token=/)
    expect(out.request.url).toBe("https://cookforfriends.ca/fr/auth/verify?locale=fr")
  })

  it("does not mutate the input", () => {
    expect(event.request.cookies.session).toBe("s3cr3t")
  })
})

describe("scrubEvent — stripe webhook payload / checkout error", () => {
  it("drops Stripe metadata and customer_details, redacts emails/names", () => {
    const out = scrubEvent({
      extra: {
        event: {
          id: "evt_1",
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { enrollmentId: "e1", name: "Marie" },
              customer_details: { email: "marie@example.com", name: "Marie T", address: { city: "Montréal" } },
              customer_email: "marie@example.com",
              amount_total: 12000,
            },
          },
        },
        name: "Marie Tremblay",
      },
      exception: { values: [{ type: "StripeInvalidRequestError", value: "Invalid email: bob@example.org; card 4242424242424242" }] },
    })
    const s = dump(out)
    expect(s).not.toMatch(/marie|bob@|Montréal|enrollmentId|4242424242424242/i)
    expect(s).toContain("evt_1")
    expect(s).toContain("12000")
    expect(out.extra.name).toBe(REDACTED)
  })
})

describe("scrubUrl — signed URLs", () => {
  it("strips Mux token and R2/S3 signature params", () => {
    expect(scrubUrl("https://stream.mux.com/abc.m3u8?token=eyJhbGciOi.payload.sig")).toBe("https://stream.mux.com/abc.m3u8")
    const r2 = scrubUrl(
      "https://acct.r2.cloudflarestorage.com/bucket/f.pdf?X-Amz-Algorithm=AWS4&X-Amz-Credential=KEY%2F20260101&X-Amz-Signature=abcd&X-Amz-Expires=300&download=1",
    )
    expect(r2).toBe("https://acct.r2.cloudflarestorage.com/bucket/f.pdf?download=1")
    expect(r2).not.toMatch(/Amz|KEY|abcd/)
  })

  it("scrubs breadcrumbs and transactions", () => {
    const out = scrubEvent({
      transaction: "GET /fr/auth/verify?token=zzz",
      breadcrumbs: [
        { category: "fetch", message: "to a@b.co", data: { url: "https://x.test/p?token=zzz&a=1", request_body: "secret" } },
      ],
    })
    expect(dump(out)).not.toMatch(/zzz|a@b\.co|secret/)
  })
})
