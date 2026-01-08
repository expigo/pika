CREATE TABLE "dj_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" integer NOT NULL,
	"token" text NOT NULL,
	"name" text DEFAULT 'Default',
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "dj_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_users_email_unique" UNIQUE("email"),
	CONSTRAINT "dj_users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"voted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_client_id_unique" UNIQUE("poll_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"question" text NOT NULL,
	"options" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_track_artist" text,
	"current_track_title" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tempo_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"track_artist" text NOT NULL,
	"track_title" text NOT NULL,
	"slower_count" integer DEFAULT 0 NOT NULL,
	"perfect_count" integer DEFAULT 0 NOT NULL,
	"faster_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "bpm" integer;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "energy" integer;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "danceability" integer;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "brightness" integer;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "acousticness" integer;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD COLUMN "groove" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "dj_user_id" integer;--> statement-breakpoint
ALTER TABLE "dj_tokens" ADD CONSTRAINT "dj_tokens_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "tempo_votes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE no action ON UPDATE no action;