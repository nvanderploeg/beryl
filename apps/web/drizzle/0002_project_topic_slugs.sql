ALTER TABLE `projects` ADD `slug` varchar(48);--> statement-breakpoint
ALTER TABLE `topics` ADD `slug` varchar(48);--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_slug_idx` UNIQUE(`slug`);--> statement-breakpoint
ALTER TABLE `topics` ADD CONSTRAINT `topics_project_slug_idx` UNIQUE(`project_id`,`slug`);