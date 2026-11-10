import type { getTranslations } from "next-intl/server"

type Translator = Awaited<ReturnType<typeof getTranslations>>

/** Server-side label bundles for LessonList / MaterialsList / progress text. */
export function lessonListLabels(t: Translator) {
  return {
    nav: t("lessons_nav_label"),
    lessonNumber: (n: number) => t("lesson_number", { n }),
    done: t("lesson_done"),
    todo: t("lesson_todo"),
    preview: t("preview_badge"),
  }
}

export function materialsLabels(t: Translator) {
  return {
    kind: { recipe: t("material_kind_recipe"), pdf: t("material_kind_pdf"), other: t("material_kind_other") },
    language: (language: string) => t("material_language", { language }),
    download: (title: string) => t("material_download", { title }),
  }
}
