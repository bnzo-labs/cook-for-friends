import type { CollectionConfig } from "payload"

import { isAdmin, isAdminField, isAdminUser, isStaff } from "../access"

/**
 * `users` — staff accounts (admin panel). Local strategy (email + password).
 * CONTRACT §3.2. Access §3.7: staff read self, admin CRUD.
 */
export const Users: CollectionConfig = {
  slug: "users",
  // G-1 (W4-03c): Payload default cookies.secure=false → staff payload-token sent over plain
  // HTTP before HSTS is cached. Set secure when the site URL is HTTPS so the cookie is
  // HTTPS-only in production but not in CI/dev (NEXT_PUBLIC_SITE_URL=http://localhost:3000).
  auth: {
    cookies: {
      sameSite: "Lax",
      secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
    },
  },
  labels: {
    singular: { fr: "Membre du personnel", en: "Staff member" },
    plural: { fr: "Personnel", en: "Staff" },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role"],
    group: { fr: "Paramètres", en: "Settings" },
  },
  access: {
    // Only staff records may enter /admin (customers live in another collection).
    admin: ({ req }) => isStaff(req.user),
    read: ({ req }) => {
      if (isAdminUser(req.user)) return true
      if (isStaff(req.user) && req.user) return { id: { equals: req.user.id } }
      return false
    },
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    unlock: isAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      label: { fr: "Nom", en: "Name" },
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "staff",
      label: { fr: "Rôle", en: "Role" },
      options: [
        { value: "admin", label: { fr: "Administrateur", en: "Admin" } },
        { value: "staff", label: { fr: "Personnel", en: "Staff" } },
      ],
      saveToJWT: true,
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
  ],
}
