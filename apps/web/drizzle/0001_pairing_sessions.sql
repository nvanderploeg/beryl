CREATE TABLE `pairings` (
	`code_hash` char(64) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	CONSTRAINT `pairings_code_hash` PRIMARY KEY(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` char(64) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`last_action_at` timestamp(3) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `pairings` ADD CONSTRAINT `pairings_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `note_key_hash`;