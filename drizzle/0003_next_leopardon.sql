CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`weekday` integer NOT NULL,
	`period` integer NOT NULL,
	`name` text NOT NULL,
	`teacher` text DEFAULT '' NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`end` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `courses_weekday_idx` ON `courses` (`weekday`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`date` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`off` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'snapshot' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
