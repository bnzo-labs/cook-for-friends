"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { NAV_ITEMS } from "./nav-items"

interface NavLinksProps {
  orientation?: "horizontal" | "vertical"
  /** Called after a link is activated (used to close the mobile sheet). */
  onNavigate?: () => void
  className?: string
}

export function NavLinks({ orientation = "horizontal", onNavigate, className }: NavLinksProps) {
  const t = useTranslations("layout.nav")
  const pathname = usePathname()

  return (
    <ul className={cn("flex", orientation === "horizontal" ? "items-center gap-8" : "flex-col gap-1", className)}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "group relative inline-block rounded-sm text-base font-medium transition-colors duration-(--duration-fast)",
                active ? "text-fg" : "text-fg-muted hover:text-fg",
                orientation === "vertical" && "w-full py-3 font-display text-2xl font-medium",
              )}
            >
              {t(item.labelKey)}
              {orientation === "horizontal" ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 -bottom-1 h-px origin-left bg-primary transition-transform duration-(--duration-normal) ease-out",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                  )}
                />
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
