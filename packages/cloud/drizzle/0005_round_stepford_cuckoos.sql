CREATE TABLE "curated_playlist_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer NOT NULL,
	"spotify_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_curated_playlist_track" UNIQUE("playlist_id","spotify_id")
);
--> statement-breakpoint
CREATE TABLE "curated_playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'csv' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_curated_playlist_dj_name" UNIQUE("dj_user_id","name")
);
--> statement-breakpoint
ALTER TABLE "curated_playlist_tracks" ADD CONSTRAINT "curated_playlist_tracks_playlist_id_curated_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."curated_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_playlists" ADD CONSTRAINT "curated_playlists_dj_user_id_user_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_curated_playlist_tracks_spotify_id" ON "curated_playlist_tracks" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "idx_curated_playlists_dj_user_id" ON "curated_playlists" USING btree ("dj_user_id");