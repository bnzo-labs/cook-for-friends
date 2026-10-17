import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

interface LogoProps {
  /** Accessible name of the link (localized). */
  label: string
  /** Visible wordmark text. */
  name: string
  className?: string
}

/** PLACEHOLDER logo: a mark + wordmark. Replace once the brand lands (D4). */
export function Logo({ label, name, className }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label={label}
      className={cn(
        "group inline-flex items-center gap-2.5 whitespace-nowrap rounded-sm font-display text-lg sm:text-xl font-semibold tracking-tight text-fg",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-7 sm:size-8 place-items-center rounded-full bg-primary text-sm text-primary-fg transition-transform duration-(--duration-normal) ease-out group-hover:-rotate-12"
      >
        C
      </span>
      <span aria-hidden="true">{name}</span>
    </Link>
  )
}
