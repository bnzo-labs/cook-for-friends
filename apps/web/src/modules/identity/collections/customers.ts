import type { CollectionConfig } from "payload"

import { locales, defaultLocale } from "@/i18n/locales"
import { magicLinkStrategy } from "../strategies/magic-link"
import { isAdmin, isSelfCustomer, isStaffField, isStaffOrAdmin } from "../access"

/**
 * `customers` — storefront customers. Magic-link only (custom strategy, W1-03).
 * CONTRACT §3.2. Access §3.7: read/update self (no email change), staff read +
 * update, admin CRUD. Never allowed into /admin.
 */
export const Customers: CollectionConfig = {
  slug: "customers",
  auth: {
    disableLocalStrategy: true,
    strategies: [magicLinkStrategy],
    // With the local strategy disabled Payload omits the `sessions` field, so
    // revocation uses `sessionVersion` (a field on this collection) instead.
    useSessions: false,
    // Customer sessions last 7 days; the cookie is HttpOnly + SameSite=Lax.
    tokenExpiration: 60 * 60 * 24 * 7,
    cookies: { sameSite: "Lax", secure: process.env.NODE_ENV === "production" },
  },
  labels: {
    singular: { fr: "Client", en: "Customer" },
    plural: { fr: "Clients", en: "Customers" },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "firstName", "lastName", "preferredLocale"],
    group: { fr: "Clients", en: "Customers" },
  },
  access: {
    admin: () => false,
    read: isSelfCustomer,
    update: (args) => (isStaffOrAdmin(args) ? true : isSelfCustomer(args)),
    create: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
      label: { fr: "Courriel", en: "Email" },
      // MVP: customers cannot change their email.
      access: { update: isStaffField },
    },
    { name: "firstName", type: "text", label: { fr: "Prénom", en: "First name" } },
    { name: "lastName", type: "text", label: { fr: "Nom", en: "Last name" } },
    { name: "phone", type: "text", label: { fr: "Téléphone", en: "Phone" } },
    {
      name: "preferredLocale",
      type: "select",
      required: true,
      defaultValue: defaultLocale,
      label: { fr: "Langue préférée", en: "Preferred language" },
      options: locales.map((l) => ({ value: l, label: l === "fr" ? "Français" : "English" })),
    },
    {
      name: "stripeCustomerId",
      type: "text",
      index: true,
      label: { fr: "ID client Stripe", en: "Stripe customer ID" },
      admin: { readOnly: true },
      access: { update: isStaffField },
    },
    {
      name: "marketingConsent",
      type: "checkbox",
      defaultValue: false,
      label: { fr: "Consentement marketing (Loi 25)", en: "Marketing consent (Law 25)" },
    },
    {
      // Revocable sessions (CCR 2026-10-18). Carried in the JWT (`saveToJWT`);
      // the strategy rejects tokens whose version differs. Logout increments it
      // (all devices). Only the Local API with overrideAccess may write it.
      name: "sessionVersion",
      type: "number",
      defaultValue: 0,
      min: 0,
      saveToJWT: true,
      admin: { hidden: true },
      access: { create: () => false, update: () => false },
    },
    {
      name: "dietaryNotes",
      type: "textarea",
      label: { fr: "Notes alimentaires", en: "Dietary notes" },
    },
  ],
}
