ALTER TABLE "played_tracks" ADD COLUMN "match_key" text;--> statement-breakpoint
CREATE INDEX "idx_played_tracks_match_key" ON "played_tracks" USING btree ("match_key");