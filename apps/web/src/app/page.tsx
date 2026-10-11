/**
 * Root page — redirects to /fr (handled by proxy.ts / next-intl middleware).
 * This file satisfies Next.js App Router requirements but should never render
 * because the middleware always redirects / to /{locale}/.
 */
import { redirect } from "next/navigation"

export default function RootPage() {
  redirect("/fr")
}
