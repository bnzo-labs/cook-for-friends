import { Link } from "@/i18n/navigation"
import type { CourseFormat } from "@/modules/_shared"

export interface CourseFormatFilterProps {
  current: CourseFormat | undefined
  labels: {
    all: string
    in_person: string
    online: string
  }
}

type Option = { value: CourseFormat | undefined; label: string }

/**
 * Course format filter.
 * Server-rendered links that update the `format` search param.
 * No client component needed — selection state driven by current prop.
 */
export function CourseFormatFilter({ current, labels }: CourseFormatFilterProps) {
  const options: Option[] = [
    { value: undefined, label: labels.all },
    { value: "in_person", label: labels.in_person },
    { value: "online", label: labels.online },
  ]

  return (
    <nav aria-label="Filter by format" className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = opt.value === current
        const href =
          opt.value === undefined
            ? ({ pathname: "/courses" as const } as never)
            : ({ pathname: "/courses" as const, query: { format: opt.value } } as never)

        return (
          <Link
            key={opt.value ?? "all"}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "rounded-control border px-4 py-1.5 text-sm font-medium",
              "transition-colors duration-[var(--duration-fast)] ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              isActive
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-surface text-fg-muted hover:border-fg/30 hover:text-fg",
            ].join(" ")}
          >
            {opt.label}
          </Link>
        )
      })}
    </nav>
  )
}
