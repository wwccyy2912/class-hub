ALTER TABLE `documents` ADD `entries` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `meta` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `kind` text DEFAULT 'files' NOT NULL;