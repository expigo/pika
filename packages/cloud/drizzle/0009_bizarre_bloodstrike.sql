DROP INDEX "idx_sessions_dj_history";--> statement-breakpoint
CREATE INDEX "idx_played_tracks_session_played_at" ON "played_tracks" USING btree ("session_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sessions_active" ON "sessions" USING btree ("ended_at") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_history" ON "sessions" USING btree ("dj_user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_energy_range" CHECK (energy IS NULL OR (energy >= 0 AND energy <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_danceability_range" CHECK (danceability IS NULL OR (danceability >= 0 AND danceability <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_brightness_range" CHECK (brightness IS NULL OR (brightness >= 0 AND brightness <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_acousticness_range" CHECK (acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_groove_range" CHECK (groove IS NULL OR (groove >= 0 AND groove <= 100));--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "chk_bpm_range" CHECK (bpm IS NULL OR (bpm >= 20 AND bpm <= 300));--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "chk_option_index_positive" CHECK (option_index >= 0);--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_slower_count_positive" CHECK (slower_count >= 0);--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_perfect_count_positive" CHECK (perfect_count >= 0);--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "chk_faster_count_positive" CHECK (faster_count >= 0);