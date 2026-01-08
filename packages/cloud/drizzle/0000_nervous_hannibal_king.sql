-- Initial schema: sessions, played_tracks, likes
-- This migration was created retroactively since initial schema was pushed with db:push

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"dj_name" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "played_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"played_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text,
	"client_id" text,
	"track_artist" text NOT NULL,
	"track_title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "played_tracks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
