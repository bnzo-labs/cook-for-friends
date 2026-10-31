import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_courses_lifecycle_status" AS ENUM('draft', 'published', 'archived');
  CREATE TABLE "seat_holds_attendees" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"email" varchar NOT NULL
  );
  
  ALTER TABLE "courses" ALTER COLUMN "status" DROP DEFAULT;
  ALTER TABLE "courses" ALTER COLUMN "status" SET DATA TYPE "public"."enum_courses_lifecycle_status" USING "status"::text::"public"."enum_courses_lifecycle_status";
  ALTER TABLE "courses" ALTER COLUMN "status" SET DEFAULT 'draft';
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" DROP DEFAULT;
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" SET DATA TYPE "public"."enum_courses_lifecycle_status" USING "version_status"::text::"public"."enum_courses_lifecycle_status";
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" SET DEFAULT 'draft';
  ALTER TABLE "site_settings" ALTER COLUMN "max_seats_per_purchase" SET DEFAULT 4;
  -- Data step (CCR-W2-6): dev/staging rows were seeded with 1; production is not live.
  UPDATE "site_settings" SET "max_seats_per_purchase" = 4 WHERE "max_seats_per_purchase" = 1;
  ALTER TABLE "orders_refunds" ADD COLUMN "enrollment_id" integer;
  ALTER TABLE "enrollments" ADD COLUMN "seat_amount" numeric;
  ALTER TABLE "seat_holds_attendees" ADD CONSTRAINT "seat_holds_attendees_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."seat_holds"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "seat_holds_attendees_order_idx" ON "seat_holds_attendees" USING btree ("_order");
  CREATE INDEX "seat_holds_attendees_parent_id_idx" ON "seat_holds_attendees" USING btree ("_parent_id");
  ALTER TABLE "orders_refunds" ADD CONSTRAINT "orders_refunds_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_refunds_enrollment_idx" ON "orders_refunds" USING btree ("enrollment_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "seat_holds_attendees" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "seat_holds_attendees" CASCADE;
  ALTER TABLE "orders_refunds" DROP CONSTRAINT "orders_refunds_enrollment_id_enrollments_id_fk";
  
  DROP INDEX "orders_refunds_enrollment_idx";
  -- 'archived' does not exist in the legacy enum: fold it back to 'draft' (unpublished, safe).
  UPDATE "courses" SET "status" = 'draft' WHERE "status"::text = 'archived';
  UPDATE "_courses_v" SET "version_status" = 'draft' WHERE "version_status"::text = 'archived';
  ALTER TABLE "courses" ALTER COLUMN "status" DROP DEFAULT;
  ALTER TABLE "courses" ALTER COLUMN "status" SET DATA TYPE "public"."enum_courses_status" USING "status"::text::"public"."enum_courses_status";
  ALTER TABLE "courses" ALTER COLUMN "status" SET DEFAULT 'draft';
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" DROP DEFAULT;
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" SET DATA TYPE "public"."enum__courses_v_version_status" USING "version_status"::text::"public"."enum__courses_v_version_status";
  ALTER TABLE "_courses_v" ALTER COLUMN "version_status" SET DEFAULT 'draft';
  ALTER TABLE "site_settings" ALTER COLUMN "max_seats_per_purchase" SET DEFAULT 1;
  UPDATE "site_settings" SET "max_seats_per_purchase" = 1 WHERE "max_seats_per_purchase" = 4;
  ALTER TABLE "orders_refunds" DROP COLUMN "enrollment_id";
  ALTER TABLE "enrollments" DROP COLUMN "seat_amount";
  DROP TYPE "public"."enum_courses_lifecycle_status";`)
}
