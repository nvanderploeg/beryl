CREATE TABLE "beryl_device_codes" (
	"code_hash" char(64) PRIMARY KEY NOT NULL,
	"user_code" varchar(16) NOT NULL,
	"label" varchar(64) NOT NULL,
	"uid" varchar(128),
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beryl_users" (
	"uid" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(320),
	"name" varchar(200),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "beryl_device_codes_user_code_idx" ON "beryl_device_codes" USING btree ("user_code");