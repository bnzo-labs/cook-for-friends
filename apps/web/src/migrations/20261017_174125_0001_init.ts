import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_courses_format" AS ENUM('in_person', 'online');
  CREATE TYPE "public"."enum_courses_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum_courses_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_courses_stripe_sync_status" AS ENUM('pending', 'synced', 'error');
  CREATE TYPE "public"."enum__courses_v_version_format" AS ENUM('in_person', 'online');
  CREATE TYPE "public"."enum__courses_v_version_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum__courses_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__courses_v_version_stripe_sync_status" AS ENUM('pending', 'synced', 'error');
  CREATE TYPE "public"."enum__courses_v_published_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_sessions_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum_sessions_status" AS ENUM('scheduled', 'cancelled', 'completed');
  CREATE TYPE "public"."enum_lessons_video_provider" AS ENUM('mux', 'bunny');
  CREATE TYPE "public"."enum_materials_kind" AS ENUM('recipe', 'pdf', 'other');
  CREATE TYPE "public"."enum_materials_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'staff');
  CREATE TYPE "public"."enum_customers_preferred_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_entitlements_source" AS ENUM('purchase', 'gift', 'manual', 'membership');
  CREATE TYPE "public"."enum_orders_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('pending', 'paid', 'refunded', 'partially_refunded', 'cancelled');
  CREATE TYPE "public"."enum_orders_currency" AS ENUM('cad');
  CREATE TYPE "public"."enum_seat_holds_status" AS ENUM('active', 'converted', 'expired', 'released');
  CREATE TYPE "public"."enum_enrollments_status" AS ENUM('confirmed', 'cancelled', 'refunded');
  CREATE TYPE "public"."enum_enrollments_attendance" AS ENUM('unknown', 'present', 'absent');
  CREATE TYPE "public"."enum_enrollments_cancellation_outcome" AS ENUM('refund', 'credit', 'none');
  CREATE TYPE "public"."enum_discount_codes_kind" AS ENUM('percent', 'amount');
  CREATE TYPE "public"."enum_processed_stripe_events_outcome" AS ENUM('applied', 'skipped', 'refunded', 'error');
  CREATE TYPE "public"."enum_waitlist_entries_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_waitlist_entries_status" AS ENUM('waiting', 'notified', 'converted', 'expired', 'removed');
  CREATE TYPE "public"."enum_certificates_locale" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_cancellation_policy_tiers_outcome" AS ENUM('refund', 'credit', 'none');
  CREATE TABLE "courses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"format" "enum_courses_format",
  	"level" "enum_courses_level",
  	"duration_minutes" numeric,
  	"price" numeric,
  	"hero_image_id" integer,
  	"status" "enum_courses_status" DEFAULT 'draft',
  	"stripe_product_id" varchar,
  	"stripe_price_id" varchar,
  	"stripe_sync_status" "enum_courses_stripe_sync_status" DEFAULT 'pending',
  	"stripe_sync_error" varchar,
  	"seo_image_id" integer,
  	"certificate_enabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_courses_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "courses_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"summary" varchar,
  	"description" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "courses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"lessons_id" integer,
  	"materials_id" integer
  );
  
  CREATE TABLE "_courses_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_format" "enum__courses_v_version_format",
  	"version_level" "enum__courses_v_version_level",
  	"version_duration_minutes" numeric,
  	"version_price" numeric,
  	"version_hero_image_id" integer,
  	"version_status" "enum__courses_v_version_status" DEFAULT 'draft',
  	"version_stripe_product_id" varchar,
  	"version_stripe_price_id" varchar,
  	"version_stripe_sync_status" "enum__courses_v_version_stripe_sync_status" DEFAULT 'pending',
  	"version_stripe_sync_error" varchar,
  	"version_seo_image_id" integer,
  	"version_certificate_enabled" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__courses_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__courses_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_courses_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_summary" varchar,
  	"version_description" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_courses_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"lessons_id" integer,
  	"materials_id" integer
  );
  
  CREATE TABLE "sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"course_id" integer NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"location_address" varchar,
  	"location_city" varchar,
  	"location_postal_code" varchar,
  	"location_maps_url" varchar,
  	"level" "enum_sessions_level",
  	"capacity" numeric NOT NULL,
  	"status" "enum_sessions_status" DEFAULT 'scheduled' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sessions_locales" (
  	"location_name" varchar,
  	"notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"course_id" integer NOT NULL,
  	"order" numeric DEFAULT 0 NOT NULL,
  	"video_provider" "enum_lessons_video_provider",
  	"video_asset_id" varchar,
  	"video_playback_id" varchar,
  	"video_duration_sec" numeric,
  	"is_preview" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lessons_locales" (
  	"title" varchar NOT NULL,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lessons_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"materials_id" integer
  );
  
  CREATE TABLE "materials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_id" integer NOT NULL,
  	"kind" "enum_materials_kind" DEFAULT 'recipe' NOT NULL,
  	"locale" "enum_materials_locale",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "materials_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"external_url" varchar,
  	"status" "enum_products_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_locales" (
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"price_display" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"cta_href" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_hero_locales" (
  	"heading" varchar,
  	"subheading" varchar,
  	"cta_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author" varchar
  );
  
  CREATE TABLE "pages_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_testimonials_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"button_href" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_cta_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"button_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seo_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"cta_href" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_hero_locales" (
  	"heading" varchar,
  	"subheading" varchar,
  	"cta_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"author" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_testimonials_items_locales" (
  	"quote" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_testimonials_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"button_href" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_cta_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"button_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_rich_text_locales" (
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_seo_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__pages_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "customers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"phone" varchar,
  	"preferred_locale" "enum_customers_preferred_locale" DEFAULT 'fr' NOT NULL,
  	"stripe_customer_id" varchar,
  	"marketing_consent" boolean DEFAULT false,
  	"dietary_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "magic_link_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"request_ip" varchar NOT NULL,
  	"next" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "entitlements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"source" "enum_entitlements_source" NOT NULL,
  	"source_ref" varchar NOT NULL,
  	"valid_from" timestamp(3) with time zone NOT NULL,
  	"valid_until" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"revoked_reason" varchar,
  	"granted_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"course_id" integer NOT NULL,
  	"session_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_amount" numeric NOT NULL,
  	"description" varchar
  );
  
  CREATE TABLE "orders_refunds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"stripe_refund_id" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"reason" varchar,
  	"at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar NOT NULL,
  	"customer_id" integer,
  	"email" varchar NOT NULL,
  	"locale" "enum_orders_locale" DEFAULT 'fr' NOT NULL,
  	"status" "enum_orders_status" DEFAULT 'pending' NOT NULL,
  	"subtotal" numeric DEFAULT 0 NOT NULL,
  	"discount_total" numeric DEFAULT 0 NOT NULL,
  	"tax_gst" numeric DEFAULT 0 NOT NULL,
  	"tax_qst" numeric DEFAULT 0 NOT NULL,
  	"total" numeric DEFAULT 0 NOT NULL,
  	"currency" "enum_orders_currency" DEFAULT 'cad' NOT NULL,
  	"stripe_checkout_session_id" varchar,
  	"stripe_payment_intent_id" varchar,
  	"stripe_invoice_id" varchar,
  	"invoice_pdf_url" varchar,
  	"promotion_code" varchar,
  	"paid_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "seat_holds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" integer NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"cart_token" varchar NOT NULL,
  	"customer_email" varchar,
  	"stripe_checkout_session_id" varchar,
  	"status" "enum_seat_holds_status" DEFAULT 'active' NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enrollments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" integer NOT NULL,
  	"customer_id" integer NOT NULL,
  	"order_id" integer NOT NULL,
  	"attendee_index" numeric DEFAULT 0 NOT NULL,
  	"attendee_name" varchar,
  	"status" "enum_enrollments_status" DEFAULT 'confirmed' NOT NULL,
  	"attendance" "enum_enrollments_attendance" DEFAULT 'unknown' NOT NULL,
  	"cancelled_at" timestamp(3) with time zone,
  	"cancellation_outcome" "enum_enrollments_cancellation_outcome",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discount_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"kind" "enum_discount_codes_kind" NOT NULL,
  	"value" numeric NOT NULL,
  	"max_redemptions" numeric,
  	"expires_at" timestamp(3) with time zone,
  	"active" boolean DEFAULT true,
  	"stripe_coupon_id" varchar,
  	"stripe_promotion_code_id" varchar,
  	"personal_for_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discount_codes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"courses_id" integer
  );
  
  CREATE TABLE "processed_stripe_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"processed_at" timestamp(3) with time zone NOT NULL,
  	"outcome" "enum_processed_stripe_events_outcome" NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "waitlist_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" integer NOT NULL,
  	"customer_id" integer,
  	"email" varchar NOT NULL,
  	"locale" "enum_waitlist_entries_locale" DEFAULT 'fr' NOT NULL,
  	"status" "enum_waitlist_entries_status" DEFAULT 'waiting' NOT NULL,
  	"notified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lesson_progress" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer NOT NULL,
  	"lesson_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"completed" boolean DEFAULT false,
  	"completed_at" timestamp(3) with time zone,
  	"position_sec" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer NOT NULL,
  	"course_id" integer NOT NULL,
  	"verification_code" varchar NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"locale" "enum_certificates_locale" DEFAULT 'fr' NOT NULL,
  	"customer_name_snapshot" varchar NOT NULL,
  	"course_title_snapshot_fr" varchar NOT NULL,
  	"course_title_snapshot_en" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lesson_id" integer NOT NULL,
  	"customer_id" integer NOT NULL,
  	"body" varchar NOT NULL,
  	"status" "enum_comments_status" DEFAULT 'pending' NOT NULL,
  	"moderated_by_id" integer,
  	"parent_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"community_url" varchar,
  	"max_seats_per_purchase" numeric DEFAULT 1 NOT NULL,
  	"hold_minutes" numeric DEFAULT 15 NOT NULL,
  	"waitlist_notify_count" numeric DEFAULT 3 NOT NULL,
  	"contact_email" varchar,
  	"legal_terms_page_id" integer,
  	"legal_privacy_page_id" integer,
  	"legal_cancellation_page_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "site_settings_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "cancellation_policy_tiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"min_hours_before" numeric NOT NULL,
  	"outcome" "enum_cancellation_policy_tiers_outcome" NOT NULL,
  	"percent" numeric NOT NULL
  );
  
  CREATE TABLE "cancellation_policy" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_can_self_cancel" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users" ADD COLUMN "name" varchar;
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'staff' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "courses_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sessions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lessons_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "materials_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "magic_link_tokens_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "entitlements_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "seat_holds_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "enrollments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discount_codes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "processed_stripe_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "waitlist_entries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_progress_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "certificates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comments_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "customers_id" integer;
  ALTER TABLE "courses" ADD CONSTRAINT "courses_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "courses" ADD CONSTRAINT "courses_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "courses_locales" ADD CONSTRAINT "courses_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_materials_fk" FOREIGN KEY ("materials_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_courses_v" ADD CONSTRAINT "_courses_v_parent_id_courses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_courses_v" ADD CONSTRAINT "_courses_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_courses_v" ADD CONSTRAINT "_courses_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_courses_v_locales" ADD CONSTRAINT "_courses_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_courses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_courses_v_rels" ADD CONSTRAINT "_courses_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_courses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_courses_v_rels" ADD CONSTRAINT "_courses_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_courses_v_rels" ADD CONSTRAINT "_courses_v_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_courses_v_rels" ADD CONSTRAINT "_courses_v_rels_materials_fk" FOREIGN KEY ("materials_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessions_locales" ADD CONSTRAINT "sessions_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_locales" ADD CONSTRAINT "lessons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_materials_fk" FOREIGN KEY ("materials_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "materials" ADD CONSTRAINT "materials_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "materials_locales" ADD CONSTRAINT "materials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero_locales" ADD CONSTRAINT "pages_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_gallery" ADD CONSTRAINT "pages_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_gallery_locales" ADD CONSTRAINT "pages_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials_items_locales" ADD CONSTRAINT "pages_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials" ADD CONSTRAINT "pages_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials_locales" ADD CONSTRAINT "pages_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta_locales" ADD CONSTRAINT "pages_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_rich_text_locales" ADD CONSTRAINT "pages_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero_locales" ADD CONSTRAINT "_pages_v_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_gallery" ADD CONSTRAINT "_pages_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_gallery_locales" ADD CONSTRAINT "_pages_v_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials_items_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_testimonials_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials" ADD CONSTRAINT "_pages_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials_locales" ADD CONSTRAINT "_pages_v_blocks_testimonials_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta_locales" ADD CONSTRAINT "_pages_v_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_rich_text_locales" ADD CONSTRAINT "_pages_v_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_refunds" ADD CONSTRAINT "orders_refunds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_personal_for_id_customers_id_fk" FOREIGN KEY ("personal_for_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discount_codes_rels" ADD CONSTRAINT "discount_codes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discount_codes_rels" ADD CONSTRAINT "discount_codes_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_moderated_by_id_users_id_fk" FOREIGN KEY ("moderated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_legal_terms_page_id_pages_id_fk" FOREIGN KEY ("legal_terms_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_legal_privacy_page_id_pages_id_fk" FOREIGN KEY ("legal_privacy_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_legal_cancellation_page_id_pages_id_fk" FOREIGN KEY ("legal_cancellation_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings_numbers" ADD CONSTRAINT "site_settings_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cancellation_policy_tiers" ADD CONSTRAINT "cancellation_policy_tiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cancellation_policy"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "courses_hero_image_idx" ON "courses" USING btree ("hero_image_id");
  CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");
  CREATE INDEX "courses_stripe_product_id_idx" ON "courses" USING btree ("stripe_product_id");
  CREATE INDEX "courses_seo_seo_image_idx" ON "courses" USING btree ("seo_image_id");
  CREATE INDEX "courses_updated_at_idx" ON "courses" USING btree ("updated_at");
  CREATE INDEX "courses_created_at_idx" ON "courses" USING btree ("created_at");
  CREATE INDEX "courses__status_idx" ON "courses" USING btree ("_status");
  CREATE UNIQUE INDEX "courses_slug_idx" ON "courses_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "courses_locales_locale_parent_id_unique" ON "courses_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "courses_rels_order_idx" ON "courses_rels" USING btree ("order");
  CREATE INDEX "courses_rels_parent_idx" ON "courses_rels" USING btree ("parent_id");
  CREATE INDEX "courses_rels_path_idx" ON "courses_rels" USING btree ("path");
  CREATE INDEX "courses_rels_media_id_idx" ON "courses_rels" USING btree ("media_id");
  CREATE INDEX "courses_rels_lessons_id_idx" ON "courses_rels" USING btree ("lessons_id");
  CREATE INDEX "courses_rels_materials_id_idx" ON "courses_rels" USING btree ("materials_id");
  CREATE INDEX "_courses_v_parent_idx" ON "_courses_v" USING btree ("parent_id");
  CREATE INDEX "_courses_v_version_version_hero_image_idx" ON "_courses_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_courses_v_version_version_status_idx" ON "_courses_v" USING btree ("version_status");
  CREATE INDEX "_courses_v_version_version_stripe_product_id_idx" ON "_courses_v" USING btree ("version_stripe_product_id");
  CREATE INDEX "_courses_v_version_seo_version_seo_image_idx" ON "_courses_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_courses_v_version_version_updated_at_idx" ON "_courses_v" USING btree ("version_updated_at");
  CREATE INDEX "_courses_v_version_version_created_at_idx" ON "_courses_v" USING btree ("version_created_at");
  CREATE INDEX "_courses_v_version_version__status_idx" ON "_courses_v" USING btree ("version__status");
  CREATE INDEX "_courses_v_created_at_idx" ON "_courses_v" USING btree ("created_at");
  CREATE INDEX "_courses_v_updated_at_idx" ON "_courses_v" USING btree ("updated_at");
  CREATE INDEX "_courses_v_snapshot_idx" ON "_courses_v" USING btree ("snapshot");
  CREATE INDEX "_courses_v_published_locale_idx" ON "_courses_v" USING btree ("published_locale");
  CREATE INDEX "_courses_v_latest_idx" ON "_courses_v" USING btree ("latest");
  CREATE INDEX "_courses_v_version_version_slug_idx" ON "_courses_v_locales" USING btree ("version_slug","_locale");
  CREATE UNIQUE INDEX "_courses_v_locales_locale_parent_id_unique" ON "_courses_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_courses_v_rels_order_idx" ON "_courses_v_rels" USING btree ("order");
  CREATE INDEX "_courses_v_rels_parent_idx" ON "_courses_v_rels" USING btree ("parent_id");
  CREATE INDEX "_courses_v_rels_path_idx" ON "_courses_v_rels" USING btree ("path");
  CREATE INDEX "_courses_v_rels_media_id_idx" ON "_courses_v_rels" USING btree ("media_id");
  CREATE INDEX "_courses_v_rels_lessons_id_idx" ON "_courses_v_rels" USING btree ("lessons_id");
  CREATE INDEX "_courses_v_rels_materials_id_idx" ON "_courses_v_rels" USING btree ("materials_id");
  CREATE INDEX "sessions_course_idx" ON "sessions" USING btree ("course_id");
  CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");
  CREATE INDEX "sessions_updated_at_idx" ON "sessions" USING btree ("updated_at");
  CREATE INDEX "sessions_created_at_idx" ON "sessions" USING btree ("created_at");
  CREATE INDEX "course_startsAt_idx" ON "sessions" USING btree ("course_id","starts_at");
  CREATE UNIQUE INDEX "sessions_locales_locale_parent_id_unique" ON "sessions_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_id");
  CREATE INDEX "lessons_updated_at_idx" ON "lessons" USING btree ("updated_at");
  CREATE INDEX "lessons_created_at_idx" ON "lessons" USING btree ("created_at");
  CREATE UNIQUE INDEX "lessons_locales_locale_parent_id_unique" ON "lessons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lessons_rels_order_idx" ON "lessons_rels" USING btree ("order");
  CREATE INDEX "lessons_rels_parent_idx" ON "lessons_rels" USING btree ("parent_id");
  CREATE INDEX "lessons_rels_path_idx" ON "lessons_rels" USING btree ("path");
  CREATE INDEX "lessons_rels_materials_id_idx" ON "lessons_rels" USING btree ("materials_id");
  CREATE INDEX "materials_file_idx" ON "materials" USING btree ("file_id");
  CREATE INDEX "materials_updated_at_idx" ON "materials" USING btree ("updated_at");
  CREATE INDEX "materials_created_at_idx" ON "materials" USING btree ("created_at");
  CREATE UNIQUE INDEX "materials_locales_locale_parent_id_unique" ON "materials_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_status_idx" ON "products" USING btree ("status");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products_slug_idx" ON "products_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_media_id_idx" ON "products_rels" USING btree ("media_id");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_hero_image_idx" ON "pages_blocks_hero" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_hero_locales_locale_parent_id_unique" ON "pages_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_gallery_order_idx" ON "pages_blocks_gallery" USING btree ("_order");
  CREATE INDEX "pages_blocks_gallery_parent_id_idx" ON "pages_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_gallery_path_idx" ON "pages_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_gallery_locales_locale_parent_id_unique" ON "pages_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_testimonials_items_order_idx" ON "pages_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_items_parent_id_idx" ON "pages_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_items_locales_locale_parent_id_uni" ON "pages_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_testimonials_order_idx" ON "pages_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_parent_id_idx" ON "pages_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_path_idx" ON "pages_blocks_testimonials" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_testimonials_locales_locale_parent_id_unique" ON "pages_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "pages_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_cta_locales_locale_parent_id_unique" ON "pages_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "pages_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_rich_text_locales_locale_parent_id_unique" ON "pages_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_seo_seo_image_idx" ON "pages" USING btree ("seo_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "pages_slug_idx" ON "pages_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_media_id_idx" ON "pages_rels" USING btree ("media_id");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_image_idx" ON "_pages_v_blocks_hero" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_locales_locale_parent_id_unique" ON "_pages_v_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_order_idx" ON "_pages_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_gallery_parent_id_idx" ON "_pages_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_path_idx" ON "_pages_v_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_gallery_locales_locale_parent_id_unique" ON "_pages_v_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_order_idx" ON "_pages_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_items_parent_id_idx" ON "_pages_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_items_locales_locale_parent_id_" ON "_pages_v_blocks_testimonials_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_order_idx" ON "_pages_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_parent_id_idx" ON "_pages_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_path_idx" ON "_pages_v_blocks_testimonials" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonials_locales_locale_parent_id_unique" ON "_pages_v_blocks_testimonials_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_order_idx" ON "_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_parent_id_idx" ON "_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_path_idx" ON "_pages_v_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_cta_locales_locale_parent_id_unique" ON "_pages_v_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "_pages_v_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_rich_text_locales_locale_parent_id_unique" ON "_pages_v_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v_locales" USING btree ("version_slug","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_media_id_idx" ON "_pages_v_rels" USING btree ("media_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "customers_email_idx" ON "customers" USING btree ("email");
  CREATE INDEX "customers_stripe_customer_id_idx" ON "customers" USING btree ("stripe_customer_id");
  CREATE INDEX "customers_updated_at_idx" ON "customers" USING btree ("updated_at");
  CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at");
  CREATE INDEX "magic_link_tokens_customer_idx" ON "magic_link_tokens" USING btree ("customer_id");
  CREATE UNIQUE INDEX "magic_link_tokens_token_hash_idx" ON "magic_link_tokens" USING btree ("token_hash");
  CREATE INDEX "magic_link_tokens_expires_at_idx" ON "magic_link_tokens" USING btree ("expires_at");
  CREATE INDEX "magic_link_tokens_updated_at_idx" ON "magic_link_tokens" USING btree ("updated_at");
  CREATE INDEX "magic_link_tokens_created_at_idx" ON "magic_link_tokens" USING btree ("created_at");
  CREATE INDEX "entitlements_customer_idx" ON "entitlements" USING btree ("customer_id");
  CREATE INDEX "entitlements_course_idx" ON "entitlements" USING btree ("course_id");
  CREATE INDEX "entitlements_granted_by_idx" ON "entitlements" USING btree ("granted_by_id");
  CREATE INDEX "entitlements_updated_at_idx" ON "entitlements" USING btree ("updated_at");
  CREATE INDEX "entitlements_created_at_idx" ON "entitlements" USING btree ("created_at");
  CREATE UNIQUE INDEX "customer_course_source_sourceRef_idx" ON "entitlements" USING btree ("customer_id","course_id","source","source_ref");
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_course_idx" ON "orders_items" USING btree ("course_id");
  CREATE INDEX "orders_items_session_idx" ON "orders_items" USING btree ("session_id");
  CREATE INDEX "orders_refunds_order_idx" ON "orders_refunds" USING btree ("_order");
  CREATE INDEX "orders_refunds_parent_id_idx" ON "orders_refunds" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "orders_number_idx" ON "orders" USING btree ("number");
  CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
  CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");
  CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
  CREATE UNIQUE INDEX "orders_stripe_checkout_session_id_idx" ON "orders" USING btree ("stripe_checkout_session_id");
  CREATE INDEX "orders_stripe_payment_intent_id_idx" ON "orders" USING btree ("stripe_payment_intent_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "seat_holds_session_idx" ON "seat_holds" USING btree ("session_id");
  CREATE INDEX "seat_holds_cart_token_idx" ON "seat_holds" USING btree ("cart_token");
  CREATE INDEX "seat_holds_stripe_checkout_session_id_idx" ON "seat_holds" USING btree ("stripe_checkout_session_id");
  CREATE INDEX "seat_holds_updated_at_idx" ON "seat_holds" USING btree ("updated_at");
  CREATE INDEX "seat_holds_created_at_idx" ON "seat_holds" USING btree ("created_at");
  CREATE INDEX "session_status_expiresAt_idx" ON "seat_holds" USING btree ("session_id","status","expires_at");
  CREATE INDEX "enrollments_session_idx" ON "enrollments" USING btree ("session_id");
  CREATE INDEX "enrollments_customer_idx" ON "enrollments" USING btree ("customer_id");
  CREATE INDEX "enrollments_order_idx" ON "enrollments" USING btree ("order_id");
  CREATE INDEX "enrollments_status_idx" ON "enrollments" USING btree ("status");
  CREATE INDEX "enrollments_updated_at_idx" ON "enrollments" USING btree ("updated_at");
  CREATE INDEX "enrollments_created_at_idx" ON "enrollments" USING btree ("created_at");
  CREATE UNIQUE INDEX "order_session_attendeeIndex_idx" ON "enrollments" USING btree ("order_id","session_id","attendee_index");
  CREATE UNIQUE INDEX "discount_codes_code_idx" ON "discount_codes" USING btree ("code");
  CREATE INDEX "discount_codes_personal_for_idx" ON "discount_codes" USING btree ("personal_for_id");
  CREATE INDEX "discount_codes_updated_at_idx" ON "discount_codes" USING btree ("updated_at");
  CREATE INDEX "discount_codes_created_at_idx" ON "discount_codes" USING btree ("created_at");
  CREATE INDEX "discount_codes_rels_order_idx" ON "discount_codes_rels" USING btree ("order");
  CREATE INDEX "discount_codes_rels_parent_idx" ON "discount_codes_rels" USING btree ("parent_id");
  CREATE INDEX "discount_codes_rels_path_idx" ON "discount_codes_rels" USING btree ("path");
  CREATE INDEX "discount_codes_rels_courses_id_idx" ON "discount_codes_rels" USING btree ("courses_id");
  CREATE UNIQUE INDEX "processed_stripe_events_event_id_idx" ON "processed_stripe_events" USING btree ("event_id");
  CREATE INDEX "processed_stripe_events_updated_at_idx" ON "processed_stripe_events" USING btree ("updated_at");
  CREATE INDEX "processed_stripe_events_created_at_idx" ON "processed_stripe_events" USING btree ("created_at");
  CREATE INDEX "waitlist_entries_session_idx" ON "waitlist_entries" USING btree ("session_id");
  CREATE INDEX "waitlist_entries_customer_idx" ON "waitlist_entries" USING btree ("customer_id");
  CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries" USING btree ("status");
  CREATE INDEX "waitlist_entries_updated_at_idx" ON "waitlist_entries" USING btree ("updated_at");
  CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries" USING btree ("created_at");
  CREATE UNIQUE INDEX "session_email_idx" ON "waitlist_entries" USING btree ("session_id","email");
  CREATE INDEX "lesson_progress_customer_idx" ON "lesson_progress" USING btree ("customer_id");
  CREATE INDEX "lesson_progress_lesson_idx" ON "lesson_progress" USING btree ("lesson_id");
  CREATE INDEX "lesson_progress_course_idx" ON "lesson_progress" USING btree ("course_id");
  CREATE INDEX "lesson_progress_updated_at_idx" ON "lesson_progress" USING btree ("updated_at");
  CREATE INDEX "lesson_progress_created_at_idx" ON "lesson_progress" USING btree ("created_at");
  CREATE UNIQUE INDEX "customer_lesson_idx" ON "lesson_progress" USING btree ("customer_id","lesson_id");
  CREATE INDEX "certificates_customer_idx" ON "certificates" USING btree ("customer_id");
  CREATE INDEX "certificates_course_idx" ON "certificates" USING btree ("course_id");
  CREATE UNIQUE INDEX "certificates_verification_code_idx" ON "certificates" USING btree ("verification_code");
  CREATE INDEX "certificates_updated_at_idx" ON "certificates" USING btree ("updated_at");
  CREATE INDEX "certificates_created_at_idx" ON "certificates" USING btree ("created_at");
  CREATE UNIQUE INDEX "customer_course_idx" ON "certificates" USING btree ("customer_id","course_id");
  CREATE INDEX "comments_lesson_idx" ON "comments" USING btree ("lesson_id");
  CREATE INDEX "comments_customer_idx" ON "comments" USING btree ("customer_id");
  CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status");
  CREATE INDEX "comments_moderated_by_idx" ON "comments" USING btree ("moderated_by_id");
  CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX "site_settings_legal_legal_terms_page_idx" ON "site_settings" USING btree ("legal_terms_page_id");
  CREATE INDEX "site_settings_legal_legal_privacy_page_idx" ON "site_settings" USING btree ("legal_privacy_page_id");
  CREATE INDEX "site_settings_legal_legal_cancellation_page_idx" ON "site_settings" USING btree ("legal_cancellation_page_id");
  CREATE INDEX "site_settings_numbers_order_parent_idx" ON "site_settings_numbers" USING btree ("order","parent_id");
  CREATE INDEX "cancellation_policy_tiers_order_idx" ON "cancellation_policy_tiers" USING btree ("_order");
  CREATE INDEX "cancellation_policy_tiers_parent_id_idx" ON "cancellation_policy_tiers" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sessions_fk" FOREIGN KEY ("sessions_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_materials_fk" FOREIGN KEY ("materials_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_magic_link_tokens_fk" FOREIGN KEY ("magic_link_tokens_id") REFERENCES "public"."magic_link_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_entitlements_fk" FOREIGN KEY ("entitlements_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seat_holds_fk" FOREIGN KEY ("seat_holds_id") REFERENCES "public"."seat_holds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enrollments_fk" FOREIGN KEY ("enrollments_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discount_codes_fk" FOREIGN KEY ("discount_codes_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_processed_stripe_events_fk" FOREIGN KEY ("processed_stripe_events_id") REFERENCES "public"."processed_stripe_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_waitlist_entries_fk" FOREIGN KEY ("waitlist_entries_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_progress_fk" FOREIGN KEY ("lesson_progress_id") REFERENCES "public"."lesson_progress"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_certificates_fk" FOREIGN KEY ("certificates_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_courses_id_idx" ON "payload_locked_documents_rels" USING btree ("courses_id");
  CREATE INDEX "payload_locked_documents_rels_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("sessions_id");
  CREATE INDEX "payload_locked_documents_rels_lessons_id_idx" ON "payload_locked_documents_rels" USING btree ("lessons_id");
  CREATE INDEX "payload_locked_documents_rels_materials_id_idx" ON "payload_locked_documents_rels" USING btree ("materials_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_customers_id_idx" ON "payload_locked_documents_rels" USING btree ("customers_id");
  CREATE INDEX "payload_locked_documents_rels_magic_link_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("magic_link_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_entitlements_id_idx" ON "payload_locked_documents_rels" USING btree ("entitlements_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_seat_holds_id_idx" ON "payload_locked_documents_rels" USING btree ("seat_holds_id");
  CREATE INDEX "payload_locked_documents_rels_enrollments_id_idx" ON "payload_locked_documents_rels" USING btree ("enrollments_id");
  CREATE INDEX "payload_locked_documents_rels_discount_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("discount_codes_id");
  CREATE INDEX "payload_locked_documents_rels_processed_stripe_events_id_idx" ON "payload_locked_documents_rels" USING btree ("processed_stripe_events_id");
  CREATE INDEX "payload_locked_documents_rels_waitlist_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("waitlist_entries_id");
  CREATE INDEX "payload_locked_documents_rels_lesson_progress_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_progress_id");
  CREATE INDEX "payload_locked_documents_rels_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("certificates_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_preferences_rels_customers_id_idx" ON "payload_preferences_rels" USING btree ("customers_id");`)
}

// Hand-edited: DROP TABLE … CASCADE above already removes the FK constraints,
// so constraint/index drops use IF EXISTS (Payload generator emits them unguarded).
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "courses_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "courses_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_courses_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_courses_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_courses_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sessions_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lessons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lessons_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "materials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "materials_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_gallery_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_testimonials_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_testimonials_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_gallery_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_testimonials_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_testimonials_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "customers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "magic_link_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "entitlements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_refunds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "seat_holds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "enrollments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discount_codes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discount_codes_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "processed_stripe_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "waitlist_entries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_progress" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "certificates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "comments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_numbers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cancellation_policy_tiers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cancellation_policy" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "courses" CASCADE;
  DROP TABLE "courses_locales" CASCADE;
  DROP TABLE "courses_rels" CASCADE;
  DROP TABLE "_courses_v" CASCADE;
  DROP TABLE "_courses_v_locales" CASCADE;
  DROP TABLE "_courses_v_rels" CASCADE;
  DROP TABLE "sessions" CASCADE;
  DROP TABLE "sessions_locales" CASCADE;
  DROP TABLE "lessons" CASCADE;
  DROP TABLE "lessons_locales" CASCADE;
  DROP TABLE "lessons_rels" CASCADE;
  DROP TABLE "materials" CASCADE;
  DROP TABLE "materials_locales" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_locales" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "pages_blocks_hero" CASCADE;
  DROP TABLE "pages_blocks_hero_locales" CASCADE;
  DROP TABLE "pages_blocks_gallery" CASCADE;
  DROP TABLE "pages_blocks_gallery_locales" CASCADE;
  DROP TABLE "pages_blocks_testimonials_items" CASCADE;
  DROP TABLE "pages_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "pages_blocks_testimonials" CASCADE;
  DROP TABLE "pages_blocks_testimonials_locales" CASCADE;
  DROP TABLE "pages_blocks_cta" CASCADE;
  DROP TABLE "pages_blocks_cta_locales" CASCADE;
  DROP TABLE "pages_blocks_rich_text" CASCADE;
  DROP TABLE "pages_blocks_rich_text_locales" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_blocks_hero" CASCADE;
  DROP TABLE "_pages_v_blocks_hero_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_gallery" CASCADE;
  DROP TABLE "_pages_v_blocks_gallery_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "_pages_v_blocks_testimonials_items_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_testimonials" CASCADE;
  DROP TABLE "_pages_v_blocks_testimonials_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_cta" CASCADE;
  DROP TABLE "_pages_v_blocks_cta_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "_pages_v_blocks_rich_text_locales" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "customers" CASCADE;
  DROP TABLE "magic_link_tokens" CASCADE;
  DROP TABLE "entitlements" CASCADE;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders_refunds" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "seat_holds" CASCADE;
  DROP TABLE "enrollments" CASCADE;
  DROP TABLE "discount_codes" CASCADE;
  DROP TABLE "discount_codes_rels" CASCADE;
  DROP TABLE "processed_stripe_events" CASCADE;
  DROP TABLE "waitlist_entries" CASCADE;
  DROP TABLE "lesson_progress" CASCADE;
  DROP TABLE "certificates" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "site_settings_numbers" CASCADE;
  DROP TABLE "cancellation_policy_tiers" CASCADE;
  DROP TABLE "cancellation_policy" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_courses_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lessons_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_materials_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_pages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_customers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_magic_link_tokens_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_entitlements_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seat_holds_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_enrollments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_discount_codes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_processed_stripe_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_waitlist_entries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lesson_progress_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_certificates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_comments_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_customers_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_courses_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sessions_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_lessons_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_materials_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_products_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_pages_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_media_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_customers_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_magic_link_tokens_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_entitlements_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_seat_holds_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_enrollments_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_discount_codes_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_processed_stripe_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_waitlist_entries_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_lesson_progress_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_certificates_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_comments_id_idx";
  DROP INDEX IF EXISTS "payload_preferences_rels_customers_id_idx";
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "courses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lessons_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "materials_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "customers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "magic_link_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "entitlements_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "seat_holds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "enrollments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discount_codes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "processed_stripe_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "waitlist_entries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lesson_progress_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "certificates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comments_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "customers_id";
  DROP TYPE "public"."enum_courses_format";
  DROP TYPE "public"."enum_courses_level";
  DROP TYPE "public"."enum_courses_status";
  DROP TYPE "public"."enum_courses_stripe_sync_status";
  DROP TYPE "public"."enum__courses_v_version_format";
  DROP TYPE "public"."enum__courses_v_version_level";
  DROP TYPE "public"."enum__courses_v_version_status";
  DROP TYPE "public"."enum__courses_v_version_stripe_sync_status";
  DROP TYPE "public"."enum__courses_v_published_locale";
  DROP TYPE "public"."enum_sessions_level";
  DROP TYPE "public"."enum_sessions_status";
  DROP TYPE "public"."enum_lessons_video_provider";
  DROP TYPE "public"."enum_materials_kind";
  DROP TYPE "public"."enum_materials_locale";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_customers_preferred_locale";
  DROP TYPE "public"."enum_entitlements_source";
  DROP TYPE "public"."enum_orders_locale";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_orders_currency";
  DROP TYPE "public"."enum_seat_holds_status";
  DROP TYPE "public"."enum_enrollments_status";
  DROP TYPE "public"."enum_enrollments_attendance";
  DROP TYPE "public"."enum_enrollments_cancellation_outcome";
  DROP TYPE "public"."enum_discount_codes_kind";
  DROP TYPE "public"."enum_processed_stripe_events_outcome";
  DROP TYPE "public"."enum_waitlist_entries_locale";
  DROP TYPE "public"."enum_waitlist_entries_status";
  DROP TYPE "public"."enum_certificates_locale";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_cancellation_policy_tiers_outcome";`)
}
