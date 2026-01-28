CREATE INDEX "idx_likes_session_id" ON "likes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_likes_client_id" ON "likes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_likes_played_track_id" ON "likes" USING btree ("played_track_id");--> statement-breakpoint
CREATE INDEX "idx_played_tracks_artist_title" ON "played_tracks" USING btree ("artist","title");--> statement-breakpoint
CREATE INDEX "idx_poll_votes_poll_id" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_polls_session_id" ON "polls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_session_events_session_id" ON "session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_user_id" ON "sessions" USING btree ("dj_user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_history" ON "sessions" USING btree ("dj_user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_tempo_votes_session_id" ON "tempo_votes" USING btree ("session_id");