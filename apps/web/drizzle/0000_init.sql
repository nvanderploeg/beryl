CREATE TABLE `events` (
	`seq` serial AUTO_INCREMENT NOT NULL,
	`topic_id` varchar(36) NOT NULL,
	`path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin,
	`type` varchar(16) NOT NULL,
	`payload` json NOT NULL,
	`at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `events_seq` PRIMARY KEY(`seq`)
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`topic_id` varchar(36) NOT NULL,
	`path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`parent_path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin,
	`key` varchar(64) NOT NULL,
	`depth` int NOT NULL,
	`position` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL,
	`title` varchar(120) NOT NULL,
	`gist` varchar(400) NOT NULL,
	`body` mediumtext NOT NULL,
	`recommendation` text NOT NULL,
	`answer` text NOT NULL,
	`rank` int,
	`edges` json NOT NULL,
	`widgets` json NOT NULL,
	`sources` json NOT NULL,
	`gist_stale` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`status_since` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `nodes_topic_id_path_pk` PRIMARY KEY(`topic_id`,`path`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` varchar(36) NOT NULL,
	`topic_id` varchar(36) NOT NULL,
	`anchor` json NOT NULL,
	`intent` varchar(16) NOT NULL,
	`text` text NOT NULL,
	`author` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL,
	`sent_at` timestamp(3),
	`delivered_at` timestamp(3),
	`resolved_at` timestamp(3),
	`reply` text NOT NULL,
	`changed` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`write_key_hash` char(64) NOT NULL,
	`note_key_hash` char(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_write_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`destination` text NOT NULL,
	`summary` text NOT NULL,
	`status` varchar(16) NOT NULL,
	`current` varchar(512) CHARACTER SET ascii COLLATE ascii_bin,
	`agent` json,
	`repo` varchar(255),
	`branch` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`closed_at` timestamp(3),
	CONSTRAINT `topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nodes` ADD CONSTRAINT `nodes_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `topics` ADD CONSTRAINT `topics_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `events_topic_seq_idx` ON `events` (`topic_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_topic_path_seq_idx` ON `events` (`topic_id`,`path`,`seq`);--> statement-breakpoint
CREATE INDEX `nodes_topic_parent_idx` ON `nodes` (`topic_id`,`parent_path`);--> statement-breakpoint
CREATE INDEX `notes_topic_created_idx` ON `notes` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `topics_project_updated_idx` ON `topics` (`project_id`,`updated_at`);