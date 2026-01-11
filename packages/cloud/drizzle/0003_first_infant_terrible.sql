ALTER TABLE "likes" ALTER COLUMN "track_artist" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "likes" ALTER COLUMN "track_title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "polls" ALTER COLUMN "options" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "likes" ADD COLUMN "played_track_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_played_track_id_played_tracks_id_fk" FOREIGN KEY ("played_track_id") REFERENCES "public"."played_tracks"("id") ON DELETE cascade ON UPDATE no action;