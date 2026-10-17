"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { List } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { LocaleSwitcher } from "./LocaleSwitcher"
import { NavLinks } from "./NavLinks"

/** Mobile navigation drawer. Hidden from `md` up, where the inline nav shows. */
export function MobileNav() {
  const t = useTranslations("layout")
  const tui = useTranslations("ui")
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="size-11 px-0 md:hidden" aria-label={t("open_menu")}>
          <List className="size-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel={tui("close")} aria-label={t("mobile_nav_label")}>
        <SheetHeader>
          <SheetTitle>{t("menu_title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("menu_description")}</SheetDescription>
        </SheetHeader>
        <nav aria-label={t("mobile_nav_label")} className="mt-4">
          <NavLinks orientation="vertical" onNavigate={() => setOpen(false)} />
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <LocaleSwitcher />
        </div>
      </SheetContent>
    </Sheet>
  )
}
