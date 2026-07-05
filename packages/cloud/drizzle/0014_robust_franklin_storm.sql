CREATE TABLE "dj_follows" (
	"user_id" text NOT NULL,
	"dj_user_id" text NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_follows_user_id_dj_user_id_pk" PRIMARY KEY("user_id","dj_user_id")
);
--> statement-breakpoint
CREATE TABLE "dj_gigs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" text NOT NULL,
	"gig_date" date NOT NULL,
	"title" text NOT NULL,
	"city" text,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"recap_opt_in_at" timestamp,
	"digest_opt_in_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_thanks" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"client_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_session_thanks" UNIQUE("session_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "recap_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "show_follower_count" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dj_follows" ADD CONSTRAINT "dj_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_follows" ADD CONSTRAINT "dj_follows_dj_user_id_user_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_gigs" ADD CONSTRAINT "dj_gigs_dj_user_id_user_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_thanks" ADD CONSTRAINT "session_thanks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dj_follows_dj_user_id" ON "dj_follows" USING btree ("dj_user_id");--> statement-breakpoint
CREATE INDEX "idx_dj_gigs_dj_date" ON "dj_gigs" USING btree ("dj_user_id","gig_date");--> statement-breakpoint
CREATE INDEX "idx_session_thanks_session_id" ON "session_thanks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_client_id" ON "push_subscriptions" USING btree ("client_id");