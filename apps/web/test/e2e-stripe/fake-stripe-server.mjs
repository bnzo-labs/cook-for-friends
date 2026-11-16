/**
 * W4-01 (signed-events mode only): a tiny Stripe API stand-in so the REAL app
 * (`/api/checkout`, webhook line-item reads, refunds, session expiry) runs
 * unmodified when no Stripe sandbox key exists in CI. Test-only, never shipped.
 *
 *   - HTTPS :12111  Stripe wire (the app's Stripe SDK is redirected here by
 *                   `stripe-redirect.cjs`; self-signed cert generated at start).
 *   - HTTP  :12112  control plane for specs (`/__e2e/...`), same in-memory state.
 *
 * Price convention (set by the fixtures): `price_e2e_<unitCents>_<suffix>`.
 * No dependencies. Never logs headers (no keys), only method + path.
 */
import { execFileSync } from "node:child_process"
import { createServer as createHttp } from "node:http"
import { createServer as createHttps } from "node:https"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const WIRE_PORT = Number(process.env.E2E_FAKE_STRIPE_PORT ?? 12111)
const CONTROL_PORT = Number(process.env.E2E_FAKE_STRIPE_CONTROL_PORT ?? 12112)

/** @type {Map<string, any>} */
const sessions = new Map()
/** @type {any[]} */
const refunds = []
/** @type {Map<string, any>} idempotency key -> stored JSON response */
const idempotent = new Map()
let counter = 0
const next = () => (counter += 1)

function parseForm(body) {
  const out = {}
  for (const [key, value] of new URLSearchParams(body)) {
    const path = [...key.matchAll(/[^[\]]+/g)].map((m) => m[0])
    let cur = out
    path.forEach((part, i) => {
      if (i === path.length - 1) {
        cur[part] = value
        return
      }
      if (cur[part] === undefined) cur[part] = /^\d+$/.test(path[i + 1]) ? [] : {}
      cur = cur[part]
    })
  }
  return out
}

function unitAmountOf(priceId) {
  const m = /^price_e2e_(\d+)_/.exec(String(priceId ?? ""))
  return m ? Number(m[1]) : 0
}

function lineOf(session) {
  const li = session.params.line_items?.[0] ?? {}
  const unit = unitAmountOf(li.price)
  const quantity = Number(li.quantity ?? 1)
  return { priceId: li.price ?? null, unit, quantity, subtotal: unit * quantity }
}

function sessionJson(session) {
  const line = lineOf(session)
  return {
    id: session.id,
    object: "checkout.session",
    livemode: false,
    status: session.status,
    payment_status: session.status === "complete" ? "paid" : "unpaid",
    url: session.status === "open" ? `https://checkout.stripe.test/c/pay/${session.id}` : null,
    expires_at: Number(session.params.expires_at ?? 0),
    metadata: session.params.metadata ?? {},
    success_url: session.params.success_url ?? null,
    cancel_url: session.params.cancel_url ?? null,
    customer_email: session.params.customer_email ?? null,
    amount_subtotal: line.subtotal,
    amount_total: line.subtotal,
    currency: "cad",
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "request-id": `req_e2e_${next()}` })
  res.end(JSON.stringify(body))
}

const stripeError = (res, status, message, type = "invalid_request_error") =>
  json(res, status, { error: { type, message } })

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString("utf8")
}

async function wire(req, res) {
  const url = new URL(req.url ?? "/", "https://api.stripe.com")
  const path = url.pathname
  const method = req.method ?? "GET"
  console.log(`[fake-stripe] ${method} ${path}`)
  const body = method === "POST" ? parseForm(await readBody(req)) : {}
  const key = req.headers["idempotency-key"]

  if (method === "POST" && key && idempotent.has(`${path}:${key}`)) {
    return json(res, 200, idempotent.get(`${path}:${key}`))
  }
  const remember = (payload) => {
    if (key) idempotent.set(`${path}:${key}`, payload)
    return json(res, 200, payload)
  }

  if (method === "POST" && path === "/v1/checkout/sessions") {
    const id = `cs_test_e2e_${Date.now().toString(36)}${next()}`
    const session = { id, status: "open", params: body, createdAt: Date.now() }
    sessions.set(id, session)
    return remember(sessionJson(session))
  }
  let m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(path)
  if (method === "POST" && m) {
    const session = sessions.get(m[1])
    if (!session) return stripeError(res, 404, `No such checkout.session: ${m[1]}`)
    if (session.status !== "open") {
      return stripeError(res, 400, "Only Checkout Sessions with a status of `open` can be expired.")
    }
    session.status = "expired"
    return json(res, 200, sessionJson(session))
  }
  m = /^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/.exec(path)
  if (method === "GET" && m) {
    const session = sessions.get(m[1])
    if (!session) return stripeError(res, 404, `No such checkout.session: ${m[1]}`)
    const line = lineOf(session)
    return json(res, 200, {
      object: "list",
      url: path,
      has_more: false,
      data: [
        {
          id: `li_e2e_${session.id}`,
          object: "item",
          description: "[E2E] line",
          quantity: line.quantity,
          amount_subtotal: line.subtotal,
          amount_total: line.subtotal,
          currency: "cad",
          price: { id: line.priceId, object: "price", unit_amount: line.unit, currency: "cad" },
        },
      ],
    })
  }
  m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path)
  if (method === "GET" && m) {
    const session = sessions.get(m[1])
    return session ? json(res, 200, sessionJson(session)) : stripeError(res, 404, `No such checkout.session: ${m[1]}`)
  }
  if (method === "POST" && path === "/v1/refunds") {
    const refund = {
      id: `re_e2e_${next()}`,
      object: "refund",
      amount: Number(body.amount ?? 0),
      currency: "cad",
      status: "succeeded",
      payment_intent: body.payment_intent ?? null,
      metadata: body.metadata ?? {},
    }
    refunds.push(refund)
    return remember(refund)
  }
  if (method === "GET" && path === "/v1/refunds") {
    const pi = url.searchParams.get("payment_intent")
    return json(res, 200, {
      object: "list",
      url: path,
      has_more: false,
      data: refunds.filter((r) => !pi || r.payment_intent === pi),
    })
  }
  m = /^\/v1\/payment_intents\/([^/]+)$/.exec(path)
  if (method === "GET" && m) return json(res, 200, { id: m[1], object: "payment_intent", metadata: { cartToken: "sha256:e2e" } })
  m = /^\/v1\/invoices\/([^/]+)$/.exec(path)
  if (method === "GET" && m) return json(res, 200, { id: m[1], object: "invoice", invoice_pdf: null })

  return stripeError(res, 404, `e2e fake Stripe: no route for ${method} ${path}`)
}

async function control(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  const method = req.method ?? "GET"
  if (url.pathname === "/__e2e/health") return json(res, 200, { ok: true })
  let m = /^\/__e2e\/sessions\/([^/]+)$/.exec(url.pathname)
  if (method === "GET" && m) {
    const session = sessions.get(m[1])
    if (!session) return json(res, 404, { ok: false })
    const line = lineOf(session)
    return json(res, 200, { ...sessionJson(session), quantity: line.quantity, unitAmount: line.unit })
  }
  m = /^\/__e2e\/sessions\/([^/]+)\/status$/.exec(url.pathname)
  if (method === "POST" && m) {
    const session = sessions.get(m[1])
    if (!session) return json(res, 404, { ok: false })
    const { status } = JSON.parse(await readBody(req))
    session.status = status
    return json(res, 200, { ok: true, status })
  }
  if (method === "GET" && url.pathname === "/__e2e/refunds") {
    const pi = url.searchParams.get("payment_intent")
    return json(res, 200, { data: refunds.filter((r) => !pi || r.payment_intent === pi) })
  }
  return json(res, 404, { ok: false })
}

const dir = mkdtempSync(join(tmpdir(), "e2e-fake-stripe-"))
execFileSync(
  "openssl",
  ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-subj", "/CN=api.stripe.com", "-days", "1"],
  { stdio: "ignore" },
)
const tls = { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }

const guard = (fn) => (req, res) => {
  fn(req, res).catch((error) => {
    console.error("[fake-stripe] handler failed", error instanceof Error ? error.message : error)
    if (!res.headersSent) stripeError(res, 500, "e2e fake Stripe internal error", "api_error")
  })
}

createHttps(tls, guard(wire)).listen(WIRE_PORT, "127.0.0.1", () => console.log(`[fake-stripe] wire https :${WIRE_PORT}`))
createHttp(guard(control)).listen(CONTROL_PORT, "127.0.0.1", () => console.log(`[fake-stripe] control http :${CONTROL_PORT}`))
