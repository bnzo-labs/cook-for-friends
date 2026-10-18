import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_auth_rate_limits_scope" AS ENUM('email', 'ip');
  CREATE TABLE "auth_rate_limits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"scope" "enum_auth_rate_limits_scope" NOT NULL,
  	"key_hash" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "auth_rate_limits_id" integer;
  CREATE INDEX "auth_rate_limits_updated_at_idx" ON "auth_rate_limits" USING btree ("updated_at");
  CREATE INDEX "auth_rate_limits_created_at_idx" ON "auth_rate_limits" USING btree ("created_at");
  CREATE INDEX "scope_keyHash_createdAt_idx" ON "auth_rate_limits" USING btree ("scope","key_hash","created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_rate_limits_fk" FOREIGN KEY ("auth_rate_limits_id") REFERENCES "public"."auth_rate_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_auth_rate_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_rate_limits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "auth_rate_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "auth_rate_limits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_rate_limits_fk";
  
  DROP INDEX "payload_locked_documents_rels_auth_rate_limits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "auth_rate_limits_id";
  DROP TYPE "public"."enum_auth_rate_limits_scope";`)
}
