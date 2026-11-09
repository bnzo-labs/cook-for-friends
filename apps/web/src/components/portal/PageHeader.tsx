export interface PageHeaderProps {
  title: string
  intro?: string
  id?: string
}

/** One h1 per portal page. Focus lands here on route change via main's tabIndex. */
export function PageHeader({ title, intro, id = "portal-heading" }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      <h1 id={id} className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg">
        {title}
      </h1>
      {intro ? <p className="max-w-prose text-fg-muted">{intro}</p> : null}
    </header>
  )
}
