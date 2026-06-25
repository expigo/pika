CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stage_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_id" text NOT NULL,
	"client_id" text NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_stage_client" UNIQUE("stage_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_dj_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."dj_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_subscriptions" ADD CONSTRAINT "stage_subscriptions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stage_subscriptions_stage_id" ON "stage_subscriptions" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_stage_subscriptions_client_id" ON "stage_subscriptions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_stages_event_id" ON "stages" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sessions_stage_id" ON "sessions" USING btree ("stage_id");