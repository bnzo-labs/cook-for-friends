import { BookOpenText, FilePdf, FileText } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@/components/ui/badge"
import type { CoursePlayerView } from "@/modules/learning"

type Material = CoursePlayerView["lessons"][number]["materials"][number]

export interface MaterialsListProps {
  materials: Material[]
  heading: string
  labels: {
    kind: Record<Material["kind"], string>
    language: (language: string) => string
    download: (title: string) => string
  }
}

const ICON = { recipe: BookOpenText, pdf: FilePdf, other: FileText } as const

/** Downloads of a lesson. Each link hits `/api/materials/:id` (entitlement check, then 302 to a signed URL). */
export function MaterialsList({ materials, heading, labels }: MaterialsListProps) {
  if (materials.length === 0) return null
  return (
    <section aria-labelledby="lesson-materials-heading" data-materials className="flex flex-col gap-3">
      <h2 id="lesson-materials-heading" className="font-display text-xl font-semibold text-fg">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2">
        {materials.map((m) => {
          const Icon = ICON[m.kind]
          return (
            <li key={String(m.id)}>
              <a
                href={`/api/materials/${encodeURIComponent(String(m.id))}`}
                download
                data-material-id={m.id}
                aria-label={labels.download(m.title)}
                className={[
                  "flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3 text-fg",
                  "transition-[transform,box-shadow] duration-(--duration-fast) ease-out",
                  "hover:-translate-y-0.5 hover:shadow-card",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                ].join(" ")}
              >
                <Icon aria-hidden="true" size={24} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                <Badge variant="neutral">{labels.kind[m.kind]}</Badge>
                {m.locale ? (
                  <Badge variant="outline" aria-label={labels.language(m.locale.toUpperCase())}>
                    {m.locale.toUpperCase()}
                  </Badge>
                ) : null}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
