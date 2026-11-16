import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, CollectionConfig } from "payload"

import { isStaffOrAdmin, publishedOrStaff } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"
import { applyDollarMirror, dollarsField, moneyField, validateInteger } from "../fields/money"
import { seoField } from "../fields/seo"

/** Fields whose change on a published course must reach Stripe. */
const SYNC_FIELDS = ["status", "price", "title", "summary", "slug"] as const

/**
 * Enqueue `stripe-sync-course` (W2-08) when the *published* version changes
 * price/title/status. Hook exception: catalog must not import commerce, so the
 * task is queued by slug. `req` joins the save transaction; the pending marker
 * is written through the DB adapter (no hooks, so no loop) in the same one.
 */
export const enqueueStripeSync: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  if (context?.skipStripeSync) return doc
  if (doc._status !== "published") return doc // draft-only saves never sync
  const published = previousDoc?._status === "published"
  if (published && !SYNC_FIELDS.some((k) => previousDoc?.[k] !== doc[k])) return doc

  await req.payload.db.updateOne({
    collection: "courses",
    id: doc.id,
    data: { stripeSyncStatus: "pending" },
    returning: false,
    req,
  })
  // jobs.tasks types are generated from the commerce tasks; slug string keeps catalog decoupled.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (req.payload.jobs.queue as any)({ task: "stripe-sync-course", input: { courseId: doc.id }, req })
  return doc
}

/** W4-07: the admin edits `priceDollars` (virtual); stored cents `price` are derived here. */
export const priceFromDollars: CollectionBeforeValidateHook = ({ data, originalDoc }) =>
  data ? applyDollarMirror(data, originalDoc, [["priceDollars", "price"]]) : data

/**
 * `courses` — CONTRACT §3.1. Drafts enabled. Stripe fields are written only by
 * the commerce sync job (W2-01), so they are read-only in the admin.
 */
export const Courses: CollectionConfig = {
  slug: "courses",
  labels: {
    singular: { fr: "Cours", en: "Course" },
    plural: { fr: "Cours", en: "Courses" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "format", "price", "status", "stripeSyncStatus"],
    group: catalogGroup,
  },
  versions: { drafts: true },
  hooks: { beforeValidate: [priceFromDollars], afterChange: [enqueueStripeSync] },
  access: {
    read: publishedOrStaff({ status: { equals: "published" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
    // W4-03b (W2-11 L-8): Payload's default is any signed-in user (customers could read drafts).
    readVersions: isStaffOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    {
      name: "slug",
      type: "text",
      required: true,
      localized: true,
      unique: true,
      index: true,
      label: { fr: "Adresse (slug)", en: "Slug" },
      admin: { description: { fr: "Fin de l’adresse de la page, ex. croissants-maison", en: "End of the page URL, e.g. homemade-croissants" } },
    },
    {
      name: "format",
      type: "select",
      required: true,
      label: { fr: "Format", en: "Format" },
      options: [
        { value: "in_person", label: { fr: "En personne", en: "In person" } },
        { value: "online", label: { fr: "En ligne", en: "Online" } },
      ],
    },
    { name: "summary", type: "textarea", localized: true, label: { fr: "Résumé", en: "Summary" } },
    { name: "description", type: "richText", localized: true, label: { fr: "Description", en: "Description" } },
    {
      name: "level",
      type: "select",
      label: { fr: "Niveau", en: "Level" },
      options: [
        { value: "beginner", label: { fr: "Débutant", en: "Beginner" } },
        { value: "intermediate", label: { fr: "Intermédiaire", en: "Intermediate" } },
        { value: "advanced", label: { fr: "Avancé", en: "Advanced" } },
      ],
    },
    {
      name: "durationMinutes",
      type: "number",
      min: 0,
      label: { fr: "Durée (minutes)", en: "Duration (minutes)" },
      validate: (v: unknown) => validateInteger(0)(v),
    },
    // W4-07: stored in cents (Stripe, checkout); staff type dollars in `priceDollars`.
    moneyField({
      name: "price",
      required: true,
      label: { fr: "Prix (taxes en sus)", en: "Price (tax-exclusive)" },
      admin: { condition: () => false },
    }),
    dollarsField({
      name: "priceDollars",
      cents: "price",
      required: true,
      label: { fr: "Prix en dollars (taxes en sus)", en: "Price in dollars (tax-exclusive)" },
      description: {
        fr: "En dollars canadiens, avant taxes. Ex. : 45 ou 45,50. La TPS et la TVQ sont ajoutées au paiement.",
        en: "In Canadian dollars, before tax. E.g. 45 or 45.50. GST and QST are added at checkout.",
      },
    }),
    { name: "heroImage", type: "upload", relationTo: "media", label: { fr: "Image principale", en: "Hero image" } },
    { name: "gallery", type: "upload", relationTo: "media", hasMany: true, label: { fr: "Galerie", en: "Gallery" } },
    {
      name: "lessons",
      type: "relationship",
      relationTo: "lessons",
      hasMany: true,
      label: { fr: "Leçons (ordonnées)", en: "Lessons (ordered)" },
      admin: { condition: (data) => data?.format === "online", isSortable: true },
    },
    { name: "materials", type: "relationship", relationTo: "materials", hasMany: true, label: { fr: "Matériel", en: "Materials" } },
    {
      name: "status",
      type: "select",
      // Own Postgres enum: the default `enum_courses_status` collides with the
      // drafts `_status` enum (draft|published only) and rejects 'archived'.
      enumName: "enum_courses_lifecycle_status",
      required: true,
      defaultValue: "draft",
      index: true,
      label: { fr: "Statut", en: "Status" },
      options: [
        { value: "draft", label: { fr: "Brouillon", en: "Draft" } },
        { value: "published", label: { fr: "Publié", en: "Published" } },
        { value: "archived", label: { fr: "Archivé", en: "Archived" } },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "stripeProductId",
      type: "text",
      index: true,
      label: { fr: "Stripe : produit", en: "Stripe product" },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripePriceId",
      type: "text",
      label: { fr: "Stripe : prix", en: "Stripe price" },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripeSyncStatus",
      type: "select",
      defaultValue: "pending",
      label: { fr: "Synchronisation Stripe", en: "Stripe sync" },
      options: [
        { value: "pending", label: { fr: "En attente", en: "Pending" } },
        { value: "synced", label: { fr: "Synchronisé", en: "Synced" } },
        { value: "error", label: { fr: "Erreur", en: "Error" } },
      ],
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripeSyncError",
      type: "textarea",
      label: { fr: "Erreur de synchronisation Stripe", en: "Stripe sync error" },
      admin: { readOnly: true, position: "sidebar" },
    },
    seoField,
    {
      name: "certificateEnabled",
      type: "checkbox",
      defaultValue: false,
      label: { fr: "Certificat de réussite", en: "Completion certificate" },
    },
  ],
}
