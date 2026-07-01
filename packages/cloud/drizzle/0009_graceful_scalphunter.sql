CREATE TABLE "dj_playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" text NOT NULL,
	"url" text NOT NULL,
	"spotify_playlist_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_dj_playlist" UNIQUE("dj_user_id","spotify_playlist_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dj_playlists" ADD CONSTRAINT "dj_playlists_dj_user_id_user_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dj_playlists_dj_user_id" ON "dj_playlists" USING btree ("dj_user_id");