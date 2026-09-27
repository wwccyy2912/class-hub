ALTER TABLE `messages` ADD `attachment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `mentions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mute_group` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mute_direct` integer DEFAULT 0 NOT NULL;