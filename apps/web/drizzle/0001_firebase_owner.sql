ALTER TABLE "beryl_projects" ALTER COLUMN "write_key_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "beryl_projects" ADD COLUMN "owner_uid" varchar(128);--> statement-breakpoint
ALTER TABLE "beryl_topics" ADD COLUMN "public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "beryl_projects_owner_idx" ON "beryl_projects" USING btree ("owner_uid");