CREATE TABLE "live_pollers" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"lease_owner" text,
	"heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_live_poller_session" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "spotify_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" integer NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scope" text NOT NULL,
	"spotify_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_connections_dj_user_id_unique" UNIQUE("dj_user_id")
);
--> statement-breakpoint
ALTER TABLE "dj_users" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_pollers" ADD CONSTRAINT "live_pollers_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_pollers" ADD CONSTRAINT "live_pollers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_connections" ADD CONSTRAINT "spotify_connections_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_live_pollers_dj_user_id" ON "live_pollers" USING btree ("dj_user_id");--> statement-breakpoint
CREATE INDEX "idx_live_pollers_status" ON "live_pollers" USING btree ("status");