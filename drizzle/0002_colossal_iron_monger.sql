CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
ALTER TABLE `documents` ADD `site_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `documents_site_idx` ON `documents` (`site_id`);
