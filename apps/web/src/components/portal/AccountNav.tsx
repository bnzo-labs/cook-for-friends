"use client"

import { Link, usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

type NavHref = "/account" | "/account/sessions" | "/account/history" | "/account/receipts" | "/account/profile"

export interface AccountNavProps {
  label: string
  items: { href: NavHref; label: string }[]
  coursesLabel: string
  logoutLabel: string
}

const linkClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium",
    "transition-[background-color,color] duration-(--duration-fast) ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    active ? "bg-fg text-bg" : "text-fg hover:bg-surface-muted",
  )

/**
 * Account menu. "Mes cours" is a section of the dashboard (`#courses`), so it
 * shares the `/account` route and is never marked current on its own.
 * Logout is a plain form POST (works without JS; the route checks Origin).
 */
export function AccountNav({ label, items, coursesLabel, logoutLabel }: AccountNavProps) {
  const pathname = usePathname()
  const [dashboard, ...rest] = items
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
        {dashboard ? (
          <li>
            <Link href={dashboard.href} aria-current={pathname === dashboard.href ? "page" : undefined} className={linkClass(pathname === dashboard.href)}>
              {dashboard.label}
            </Link>
          </li>
        ) : null}
        <li>
          <Link href={{ pathname: "/account", hash: "courses" }} className={linkClass(false)}>
            {coursesLabel}
          </Link>
        </li>
        {rest.map((item) => {
          const active = pathname === item.href
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                {item.label}
              </Link>
            </li>
          )
        })}
        <li>
          <form method="post" action="/api/auth/logout">
            <button type="submit" className={cn(linkClass(false), "cursor-pointer text-fg-muted hover:text-fg")}>
              {logoutLabel}
            </button>
          </form>
        </li>
      </ul>
    </nav>
  )
}
