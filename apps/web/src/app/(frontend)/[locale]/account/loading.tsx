import { useTranslations } from "next-intl"

import { Skeleton } from "@/components/ui/skeleton"

export default function AccountLoading() {
  const t = useTranslations("portal")
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
