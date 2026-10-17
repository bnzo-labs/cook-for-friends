import * as React from "react"
import { cn } from "@/lib/utils"

type ContainerProps<T extends React.ElementType> = {
  as?: T
  /** `prose` uses the narrow reading width instead of the page width. */
  width?: "page" | "prose"
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">

/** Centered content column with a gutter of at least 16px at every width. */
export function Container<T extends React.ElementType = "div">({
  as,
  width = "page",
  className,
  ...props
}: ContainerProps<T>) {
  const Comp: React.ElementType = as ?? "div"
  return (
    <Comp
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        width === "page" ? "max-w-(--container-max)" : "max-w-(--container-prose)",
        className,
      )}
      {...props}
    />
  )
}
