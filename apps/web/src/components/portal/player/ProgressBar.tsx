export interface ProgressBarProps {
  completed: number
  total: number
  label: string
  valueText: string
}

/** Course progress. Width is a CSS custom property so the fill animates via transform only. */
export function ProgressBar({ completed, total, label, valueText }: ProgressBarProps) {
  const ratio = total > 0 ? Math.min(1, completed / total) : 0
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-(--duration-normal) ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      <p className="text-sm text-fg-muted">{valueText}</p>
    </div>
  )
}
