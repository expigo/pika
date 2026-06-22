CREATE TABLE "dj_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"dj_user_id" integer NOT NULL,
	"token" text NOT NULL,
	"name" text DEFAULT 'Default',
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "dj_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dj_users_email_unique" UNIQUE("email"),
	CONSTRAINT "dj_users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"client_id" text,
	"played_track_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_like_idempotency" UNIQUE("session_id","client_id","played_track_id")
);
--> statement-breakpoint
CREATE TABLE "played_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"bpm" integer,
	"key" text,
	"energy" integer,
	"danceability" integer,
	"brightness" integer,
	"acousticness" integer,
	"groove" integer,
	"played_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_energy_range" CHECK (energy IS NULL OR (energy >= 0 AND energy <= 100)),
	CONSTRAINT "chk_danceability_range" CHECK (danceability IS NULL OR (danceability >= 0 AND danceability <= 100)),
	CONSTRAINT "chk_brightness_range" CHECK (brightness IS NULL OR (brightness >= 0 AND brightness <= 100)),
	CONSTRAINT "chk_acousticness_range" CHECK (acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100)),
	CONSTRAINT "chk_groove_range" CHECK (groove IS NULL OR (groove >= 0 AND groove <= 100)),
	CONSTRAINT "chk_bpm_range" CHECK (bpm IS NULL OR (bpm >= 20 AND bpm <= 300))
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"voted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_client_id_unique" UNIQUE("poll_id","client_id"),
	CONSTRAINT "chk_option_index_positive" CHECK (option_index >= 0)
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"question" text NOT NULL,
	"options" json NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_track_artist" text,
	"current_track_title" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"client_id" text,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"dj_user_id" integer,
	"dj_name" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tempo_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"track_artist" text NOT NULL,
	"track_title" text NOT NULL,
	"slower_count" integer DEFAULT 0 NOT NULL,
	"perfect_count" integer DEFAULT 0 NOT NULL,
	"faster_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_slower_count_positive" CHECK (slower_count >= 0),
	CONSTRAINT "chk_perfect_count_positive" CHECK (perfect_count >= 0),
	CONSTRAINT "chk_faster_count_positive" CHECK (faster_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "dj_tokens" ADD CONSTRAINT "dj_tokens_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_played_track_id_played_tracks_id_fk" FOREIGN KEY ("played_track_id") REFERENCES "public"."played_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "played_tracks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_dj_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dj_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_dj_user_id_dj_users_id_fk" FOREIGN KEY ("dj_user_id") REFERENCES "public"."dj_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "tempo_votes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_likes_session_id" ON "likes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_likes_client_id" ON "likes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_likes_played_track_id" ON "likes" USING btree ("played_track_id");--> statement-breakpoint
CREATE INDEX "idx_played_tracks_artist_title" ON "played_tracks" USING btree ("artist","title");--> statement-breakpoint
CREATE INDEX "idx_played_tracks_session_played_at" ON "played_tracks" USING btree ("session_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_poll_votes_poll_id" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_polls_session_id" ON "polls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_session_events_session_id" ON "session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_user_id" ON "sessions" USING btree ("dj_user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_dj_history" ON "sessions" USING btree ("dj_user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sessions_active" ON "sessions" USING btree ("ended_at") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tempo_votes_session_id" ON "tempo_votes" USING btree ("session_id");