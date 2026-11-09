import type { ProfileField, ProfileFieldError } from "./profile-validation"

export type ProfileActionState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; errors?: Partial<Record<ProfileField, ProfileFieldError>> }
