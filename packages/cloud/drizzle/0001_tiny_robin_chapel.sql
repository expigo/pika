CREATE TABLE "service_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scope" text NOT NULL,
	"spotify_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_connections_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "track_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_key" text NOT NULL,
	"provider" text DEFAULT 'spotify' NOT NULL,
	"provider_id" text,
	"provider_url" text,
	"status" text DEFAULT 'matched' NOT NULL,
	"confidence" real,
	"source" text DEFAULT 'auto' NOT NULL,
	"resolved_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "track_links_match_key_unique" UNIQUE("match_key")
);
--> statement-breakpoint
CREATE INDEX "idx_track_links_provider_id" ON "track_links" USING btree ("provider_id");