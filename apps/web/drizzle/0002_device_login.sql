CREATE TABLE "device_codes" (
	"code_hash" char(64) PRIMARY KEY NOT NULL,
	"user_code" varchar(16) NOT NULL,
	"label" varchar(64) NOT NULL,
	"uid" varchar(128),
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"token_hash" char(64) NOT NULL,
	"uid" varchar(128) NOT NULL,
	"label" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "device_codes_user_code_idx" ON "device_codes" USING btree ("user_code");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_idx" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_uid_idx" ON "login_tokens" USING btree ("uid");