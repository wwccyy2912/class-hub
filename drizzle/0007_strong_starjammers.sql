CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` text DEFAULT '[]' NOT NULL;