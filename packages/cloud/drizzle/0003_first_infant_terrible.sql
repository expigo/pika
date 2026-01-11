-- 1. Add 'played_track_id' as NULLABLE initially to allow backfilling
ALTER TABLE "likes" ADD COLUMN "played_track_id" integer;

-- 2. Backfill: Link existing likes to played_tracks
-- We match on Artist, Title, and SessionID to be precise.
UPDATE "likes" l
SET "played_track_id" = pt.id
FROM "played_tracks" pt
WHERE l."track_artist" = pt."artist" 
  AND l."track_title" = pt."title"
  AND l."session_id" = pt."session_id";

-- 3. Cleanup: Delete orphaned likes that could not be matched
-- (This prevents 'column contains null values' error during NOT NULL enforcement)
DELETE FROM "likes" WHERE "played_track_id" IS NULL;

-- 4. Enforce NOT NULL and add Foreign Key
ALTER TABLE "likes" ALTER COLUMN "played_track_id" SET NOT NULL;
ALTER TABLE "likes" ADD CONSTRAINT "likes_played_track_id_played_tracks_id_fk" FOREIGN KEY ("played_track_id") REFERENCES "public"."played_tracks"("id") ON DELETE cascade ON UPDATE no action;

-- 5. Original Schema Changes (Polls & Nullable Columns)
ALTER TABLE "likes" ALTER COLUMN "track_artist" DROP NOT NULL;
ALTER TABLE "likes" ALTER COLUMN "track_title" DROP NOT NULL;
ALTER TABLE "polls" ALTER COLUMN "options" TYPE json USING options::json;