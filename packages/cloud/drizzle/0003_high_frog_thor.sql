CREATE TABLE "curated_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" text NOT NULL,
	"spotify_id" text NOT NULL,
	"name" text NOT NULL,
	"artists" text NOT NULL,
	"duration_ms" integer,
	"album_art_url" text,
	"playlist_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_curated_dj_track" UNIQUE("dj_user_id","spotify_id")
);
--> statement-breakpoint
ALTER TABLE "track_links" ADD COLUMN "song_key" text;--> statement-breakpoint
ALTER TABLE "curated_tracks" ADD CONSTRAINT "curated_tracks_dj_user_id_user_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_curated_spotify_id" ON "curated_tracks" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "idx_track_links_song_key" ON "track_links" USING btree ("song_key");