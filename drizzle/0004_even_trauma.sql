ALTER TABLE `courses` ADD `span` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `weeks` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `holidays` ADD `follow` integer DEFAULT 0 NOT NULL;