CREATE TABLE "journal_playlists" (
	"client_id" text PRIMARY KEY NOT NULL,
	"spotify_playlist_id" text NOT NULL,
	"spotify_playlist_url" text NOT NULL,
	"track_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"client_id" text,
	"session_id" text,
	"props" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_product_events_event_created" ON "product_events" USING btree ("event","created_at");