import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_video_status" AS ENUM('none', 'preparing', 'ready', 'errored');
  ALTER TYPE "public"."enum_lessons_video_provider" ADD VALUE 'fake';
  CREATE TABLE "reminder_deliveries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enrollment_id" integer NOT NULL,
  	"offset_hours" numeric NOT NULL,
  	"sent_at" timestamp(3) with time zone NOT NULL,
  	"job_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "lessons" ADD COLUMN "video_upload_id" varchar;
  ALTER TABLE "lessons" ADD COLUMN "video_status" "enum_lessons_video_status" DEFAULT 'none' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reminder_deliveries_id" integer;
  ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "reminder_deliveries_enrollment_idx" ON "reminder_deliveries" USING btree ("enrollment_id");
  CREATE INDEX "reminder_deliveries_updated_at_idx" ON "reminder_deliveries" USING btree ("updated_at");
  CREATE INDEX "reminder_deliveries_created_at_idx" ON "reminder_deliveries" USING btree ("created_at");
  CREATE UNIQUE INDEX "enrollment_offsetHours_idx" ON "reminder_deliveries" USING btree ("enrollment_id","offset_hours");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reminder_deliveries_fk" FOREIGN KEY ("reminder_deliveries_id") REFERENCES "public"."reminder_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reminder_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("reminder_deliveries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reminder_deliveries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reminder_deliveries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reminder_deliveries_fk";
  
  -- 'fake' (dev/test provider) does not exist in the legacy enum: clear it before the cast.
  UPDATE "lessons" SET "video_provider" = NULL WHERE "video_provider"::text = 'fake';
  ALTER TABLE "lessons" ALTER COLUMN "video_provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_lessons_video_provider";
  CREATE TYPE "public"."enum_lessons_video_provider" AS ENUM('mux', 'bunny');
  ALTER TABLE "lessons" ALTER COLUMN "video_provider" SET DATA TYPE "public"."enum_lessons_video_provider" USING "video_provider"::"public"."enum_lessons_video_provider";
  DROP INDEX "payload_locked_documents_rels_reminder_deliveries_id_idx";
  ALTER TABLE "lessons" DROP COLUMN "video_upload_id";
  ALTER TABLE "lessons" DROP COLUMN "video_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reminder_deliveries_id";
  DROP TYPE "public"."enum_lessons_video_status";`)
}
