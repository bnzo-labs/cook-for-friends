import { buildConfig, type CollectionConfig } from "payload"
import { postgresAdapter } from "@payloadcms/db-postgres"
import { resendAdapter } from "@payloadcms/email-resend"
import { s3Storage } from "@payloadcms/storage-s3"
import { lexicalEditor } from "@payloadcms/richtext-lexical"
import { fr } from "@payloadcms/translations/languages/fr"
import { en } from "@payloadcms/translations/languages/en"

import { locales, defaultLocale } from "./i18n/locales"
import { env } from "./lib/env"

// Module collections — W1-02 populates these
import { catalogCollections } from "./modules/catalog"
import { identityCollections } from "./modules/identity"
import { accessCollections } from "./modules/access"
import { commerceCollections } from "./modules/commerce"
import { schedulingCollections } from "./modules/scheduling"
import { learningCollections } from "./modules/learning"
import { videoCollections } from "./modules/video"
import { notificationsCollections } from "./modules/notifications"

/**
 * Temporary stub users collection.
 * MUST be deleted by W1-02 (identity agent owns the real `users` collection).
 * W1-03 (identity-auth) wires `admin.user` to the real `users` collection.
 */
const _tempUsersCollection: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
  },
  fields: [],
}

export default buildConfig({
  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------
  admin: {
    /**
     * Temporary: uses the stub users collection.
     * W1-02 will replace this with the real users collection.
     */
    user: "users",
    meta: {
      titleSuffix: "— Cook for Friends Admin",
    },
  },

  // -------------------------------------------------------------------------
  // Collections (all modules)
  // -------------------------------------------------------------------------
  collections: [
    _tempUsersCollection,
    ...catalogCollections,
    ...identityCollections,
    ...accessCollections,
    ...commerceCollections,
    ...schedulingCollections,
    ...learningCollections,
    ...videoCollections,
    ...notificationsCollections,
  ],

  // -------------------------------------------------------------------------
  // Editor
  // -------------------------------------------------------------------------
  editor: lexicalEditor(),

  // -------------------------------------------------------------------------
  // i18n — Admin UI languages
  // -------------------------------------------------------------------------
  i18n: {
    supportedLanguages: { fr, en },
    fallbackLanguage: "fr",
  },

  // -------------------------------------------------------------------------
  // Localization (content)
  // -------------------------------------------------------------------------
  localization: {
    locales: locales.map((code) => ({ code, label: code === "fr" ? "Français" : "English" })),
    defaultLocale,
    fallback: true,
  },

  // -------------------------------------------------------------------------
  // Database — Neon Postgres via @payloadcms/db-postgres
  // -------------------------------------------------------------------------
  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
    migrationDir: "./src/migrations",
    /**
     * push: false in staging and production.
     * Migrations must be committed and run via `pnpm payload migrate`.
     * push: true is allowed only in local development (NODE_ENV=development).
     */
    push: process.env.NODE_ENV === "development",
  }),

  // -------------------------------------------------------------------------
  // Email — Resend via @payloadcms/email-resend
  // -------------------------------------------------------------------------
  email: resendAdapter({
    defaultFromAddress: env.EMAIL_FROM,
    defaultFromName: "Cook for Friends",
    apiKey: env.RESEND_API_KEY,
  }),

  // -------------------------------------------------------------------------
  // Storage — Cloudflare R2 via @payloadcms/storage-s3
  // R2 bucket is PRIVATE. Media is served through Payload's access-controlled route.
  // -------------------------------------------------------------------------
  plugins: [
    s3Storage({
      collections: {
        // The media collection is added by the catalog module (W1-02).
        // The adapter config is ready here; just add the slug to this object
        // when the collection is defined.
        // Example:  media: { disableLocalStorage: true }
      },
      bucket: env.R2_BUCKET,
      config: {
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        // Force path-style for R2 compatibility
        forcePathStyle: false,
      },
    }),
  ],

  // -------------------------------------------------------------------------
  // Secret
  // -------------------------------------------------------------------------
  secret: env.PAYLOAD_SECRET,

  // -------------------------------------------------------------------------
  // TypeScript output path
  // -------------------------------------------------------------------------
  typescript: {
    outputFile: "./src/payload-types.ts",
  },

  // -------------------------------------------------------------------------
  // GraphQL — disabled until needed
  // -------------------------------------------------------------------------
  graphQL: {
    disable: true,
  },
})
