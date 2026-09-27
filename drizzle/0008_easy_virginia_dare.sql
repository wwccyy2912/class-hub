CREATE TABLE `chat_reads` (
	`user_id` text NOT NULL,
	`room` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `room`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_room_idx` ON `messages` (`room`,`created`);