import * as React from "react"
import { cn } from "@/lib/utils"

type DivProps = React.ComponentProps<"div">

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-surface p-6 text-fg shadow-card",
        className,
      )}
      {...props}
    />
  )
}

/** Card that lifts on hover (transform + shadow only). Use for links / selectable cards. */
export function InteractiveCard({ className, ...props }: DivProps) {
  return (
    <Card
      className={cn(
        "transition-[transform,box-shadow] duration-(--duration-normal) ease-out",
        "hover:-translate-y-0.5 hover:shadow-raised",
        "focus-within:-translate-y-0.5 focus-within:shadow-raised",
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />
}

export function CardTitle({ className, ...props }: DivProps) {
  return <div className={cn("font-display text-xl font-semibold leading-tight", className)} {...props} />
}

export function CardDescription({ className, ...props }: DivProps) {
  return <div className={cn("text-sm text-fg-muted", className)} {...props} />
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />
}

export function CardFooter({ className, ...props }: DivProps) {
  return <div className={cn("mt-auto flex items-center gap-3", className)} {...props} />
}
