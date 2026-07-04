CREATE TABLE "client_identities" (
	"client_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_playlists" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "client_identities" ADD CONSTRAINT "client_identities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_identities_user_id" ON "client_identities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "journal_playlists" ADD CONSTRAINT "journal_playlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_journal_playlists_user" ON "journal_playlists" USING btree ("user_id") WHERE user_id IS NOT NULL;