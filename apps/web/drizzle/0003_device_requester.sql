ALTER TABLE "device_codes" ADD COLUMN "request_ip" varchar(64);--> statement-breakpoint
ALTER TABLE "device_codes" ADD COLUMN "request_agent" varchar(200);--> statement-breakpoint
ALTER TABLE "device_codes" ADD COLUMN "created_at" timestamp (3) with time zone DEFAULT now() NOT NULL;