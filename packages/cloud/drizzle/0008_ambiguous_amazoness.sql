CREATE INDEX "idx_likes_session_id" ON "likes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_likes_client_id" ON "likes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_likes_played_track_id" ON "likes" USING btree ("played_track_id");--> statement-breakpoint
CREATE INDEX "idx_played_tracks_artist_title" ON "played_tracks" USING btree ("artist","title");--> statement-breakpoint
CREATE INDEX "idx_poll_votes_poll_id" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_polls_session_id" ON "polls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_session_events_session_id" ON "session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_user_id" ON "sessions" USING btree ("dj_user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_history" ON "sessions" USING btree ("dj_user_id","started_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_tempo_votes_session_id" ON "tempo_votes" USING btree ("session_id");--> statement-breakpoint

-- Special Performance Indexes
CREATE INDEX "idx_sessions_active" ON "sessions" ("ended_at") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_played_tracks_session_played_at" ON "played_tracks" ("session_id", "played_at" DESC);--> statement-breakpoint

-- Data Integrity: Metric Ranges (0-100)
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_energy_range" CHECK (energy IS NULL OR (energy >= 0 AND energy <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_danceability_range" CHECK (danceability IS NULL OR (danceability >= 0 AND danceability <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_brightness_range" CHECK (brightness IS NULL OR (brightness >= 0 AND brightness <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_acousticness_range" CHECK (acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_groove_range" CHECK (groove IS NULL OR (groove >= 0 AND groove <= 100));--> statement-breakpoint

-- Data Integrity: BPM Range (20-300)
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_bpm_range" CHECK (bpm IS NULL OR (bpm >= 20 AND bpm <= 300));--> statement-breakpoint

-- Data Integrity: Positive Vote Counts
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_slower_count_positive" CHECK (slower_count >= 0);--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_perfect_count_positive" CHECK (perfect_count >= 0);--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_faster_count_positive" CHECK (faster_count >= 0);--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "chk_option_index_positive" CHECK (option_index >= 0);