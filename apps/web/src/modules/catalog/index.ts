import type { CollectionConfig, GlobalConfig } from "payload"

import { Courses } from "./collections/courses"
import { Lessons } from "./collections/lessons"
import { Materials } from "./collections/materials"
import { Media } from "./collections/media"
import { Pages } from "./collections/pages"
import { Products } from "./collections/products"
import { Sessions } from "./collections/sessions"
import { CancellationPolicy } from "./globals/cancellation-policy"
import { SiteSettings } from "./globals/site-settings"

export const catalogCollections: CollectionConfig[] = [
  Courses,
  Sessions,
  Lessons,
  Materials,
  Products,
  Pages,
  Media,
]

export const catalogGlobals: GlobalConfig[] = [SiteSettings, CancellationPolicy]
