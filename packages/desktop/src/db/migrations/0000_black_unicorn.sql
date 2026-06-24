CREATE TABLE `offline_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`track_id` integer NOT NULL,
	`played_at` integer NOT NULL,
	`duration` integer,
	`reaction` text DEFAULT 'neutral',
	`notes` text,
	`dancer_likes` integer DEFAULT 0,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plays_session_id` ON `plays` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_plays_track_id` ON `plays` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_plays_reaction` ON `plays` (`reaction`);--> statement-breakpoint
CREATE INDEX `idx_plays_played_at` ON `plays` (`played_at`);--> statement-breakpoint
CREATE INDEX `idx_plays_track_played` ON `plays` (`track_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `saved_set_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer NOT NULL,
	`track_id` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `saved_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_saved_set_tracks_set_id` ON `saved_set_tracks` (`set_id`);--> statement-breakpoint
CREATE INDEX `idx_saved_set_tracks_track_id` ON `saved_set_tracks` (`track_id`);--> statement-breakpoint
CREATE TABLE `saved_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`cloud_session_id` text,
	`dj_identity` text DEFAULT 'Default',
	`name` text,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_uuid_unique` ON `sessions` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_sessions_ended_at` ON `sessions` (`ended_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_active` ON `sessions` (`started_at`) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE TABLE `set_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`slots` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`artist` text,
	`title` text,
	`raw_artist` text,
	`raw_title` text,
	`bpm` real,
	`energy` real,
	`key` text,
	`danceability` real,
	`brightness` real,
	`acousticness` real,
	`groove` real,
	`duration` integer,
	`analyzed` integer DEFAULT false,
	`analysis_version` integer DEFAULT 0,
	`track_key` text,
	`tags` text DEFAULT '[]',
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_file_path_unique` ON `tracks` (`file_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_track_key` ON `tracks` (`track_key`);--> statement-breakpoint
CREATE INDEX `idx_tracks_analyzed` ON `tracks` (`analyzed`);