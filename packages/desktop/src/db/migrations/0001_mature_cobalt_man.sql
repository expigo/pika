ALTER TABLE `tracks` ADD `spotify_id` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `spotify_url` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `spotify_match_confidence` real;--> statement-breakpoint
ALTER TABLE `tracks` ADD `spotify_match_source` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `spotify_matched_at` integer;