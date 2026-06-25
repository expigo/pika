CREATE TABLE "admin_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" integer,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dj_users" ADD COLUMN "role" text DEFAULT 'dj' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_admin_user_id_dj_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."dj_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_audit_created_at" ON "admin_audit" USING btree ("created_at" DESC NULLS LAST);