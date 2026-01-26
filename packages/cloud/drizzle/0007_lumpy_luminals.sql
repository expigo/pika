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
ALTER TABLE "likes" DROP CONSTRAINT "likes_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "played_tracks" DROP CONSTRAINT "played_tracks_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "poll_votes" DROP CONSTRAINT "poll_votes_poll_id_polls_id_fk";
--> statement-breakpoint
ALTER TABLE "polls" DROP CONSTRAINT "polls_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "session_events" DROP CONSTRAINT "session_events_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "tempo_votes" DROP CONSTRAINT "tempo_votes_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "likes" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_dj_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dj_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "played_tracks" ADD CONSTRAINT "played_tracks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_votes" ADD CONSTRAINT "tempo_votes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "played_tracks" DROP COLUMN "raw_artist";--> statement-breakpoint
ALTER TABLE "played_tracks" DROP COLUMN "raw_title";