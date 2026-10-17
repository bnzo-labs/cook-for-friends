import type { CollectionConfig, PayloadRequest, Validate, Where } from "payload"

import { isAdmin, isCustomerUser, isStaff, isStaffField, isStaffOrAdmin } from "@/modules/identity"
import { learningGroup } from "../labels"

export const COMMENT_MAX_LENGTH = 2000

/** Replies are one level deep: a parent must not itself have a parent. */
export async function validateParent(
  value: unknown,
  { req }: { req: PayloadRequest },
): Promise<true | string> {
  if (value === null || value === undefined) return true
  const id = typeof value === "object" ? (value as { id: string | number }).id : (value as string | number)
  try {
    const parent = await req.payload.findByID({ collection: "comments", id, depth: 0, req, overrideAccess: true })
    if (parent?.parent) return "Une seule réponse de niveau / Replies are one level only"
    return true
  } catch (err) {
    req.payload.logger.warn({ err, parentId: id }, "comments.parent validation: lookup failed")
    return "Commentaire parent introuvable / Parent comment not found"
  }
}

/**
 * `comments` — lesson comments with staff moderation. CONTRACT §3.6.
 * Access §3.7: public reads approved; customer creates + reads approved and
 * own; staff moderate; admin CRUD.
 */
export const Comments: CollectionConfig = {
  slug: "comments",
  labels: {
    singular: { fr: "Commentaire", en: "Comment" },
    plural: { fr: "Commentaires", en: "Comments" },
  },
  admin: {
    defaultColumns: ["lesson", "customer", "status", "createdAt"],
    group: learningGroup,
  },
  access: {
    read: ({ req }) => {
      if (isStaff(req.user)) return true
      const approved: Where = { status: { equals: "approved" } }
      if (isCustomerUser(req.user) && req.user) {
        return { or: [approved, { customer: { equals: req.user.id } }] }
      }
      return approved
    },
    create: ({ req }) => isCustomerUser(req.user) || isStaff(req.user),
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      // A customer always posts as themselves; status is forced by field access.
      ({ data, req, operation }) => {
        if (operation === "create" && isCustomerUser(req.user) && req.user) {
          return { ...data, customer: req.user.id }
        }
        return data
      },
    ],
  },
  fields: [
    { name: "lesson", type: "relationship", relationTo: "lessons", required: true, index: true },
    { name: "customer", type: "relationship", relationTo: "customers", required: true, index: true },
    { name: "body", type: "textarea", required: true, maxLength: COMMENT_MAX_LENGTH },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      access: { create: isStaffField, update: isStaffField },
      options: [
        { value: "pending", label: { fr: "En attente", en: "Pending" } },
        { value: "approved", label: { fr: "Approuvé", en: "Approved" } },
        { value: "rejected", label: { fr: "Rejeté", en: "Rejected" } },
      ],
    },
    {
      name: "moderatedBy",
      type: "relationship",
      relationTo: "users",
      access: { create: isStaffField, update: isStaffField },
    },
    {
      name: "parent",
      type: "relationship",
      relationTo: "comments",
      validate: ((v, { req }) => validateParent(v, { req })) as Validate,
    },
  ],
}
