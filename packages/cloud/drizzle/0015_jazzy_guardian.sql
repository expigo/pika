ALTER TABLE "curated_playlists" ADD COLUMN "show_on_booth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "curated_playlists" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "curated_playlists" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "curated_playlists" ADD COLUMN "spotify_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "show_signature" boolean DEFAULT true NOT NULL;