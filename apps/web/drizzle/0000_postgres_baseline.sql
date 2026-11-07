CREATE TABLE "events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"topic_id" varchar(36) NOT NULL,
	"path" varchar(512) COLLATE "C",
	"type" varchar(16) NOT NULL,
	"payload" json NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"topic_id" varchar(36) NOT NULL,
	"path" varchar(512) COLLATE "C" NOT NULL,
	"parent_path" varchar(512) COLLATE "C",
	"key" varchar(64) NOT NULL,
	"depth" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"title" varchar(120) NOT NULL,
	"gist" varchar(400) NOT NULL,
	"body" text NOT NULL,
	"recommendation" text NOT NULL,
	"answer" text NOT NULL,
	"rank" integer,
	"edges" json NOT NULL,
	"widgets" json NOT NULL,
	"sources" json NOT NULL,
	"gist_stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"status_since" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nodes_topic_id_path_pk" PRIMARY KEY("topic_id","path")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"topic_id" varchar(36) NOT NULL,
	"anchor" json NOT NULL,
	"intent" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"author" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"sent_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"resolved_at" timestamp (3) with time zone,
	"reply" text NOT NULL,
	"changed" json NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairings" (
	"code_hash" char(64) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(48),
	"name" varchar(200) NOT NULL,
	"write_key_hash" char(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_write_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"last_action_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"slug" varchar(48),
	"title" varchar(200) NOT NULL,
	"destination" text NOT NULL,
	"summary" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"current" varchar(512) COLLATE "C",
	"agent" json,
	"repo" varchar(255),
	"branch" varchar(255),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_topic_seq_idx" ON "events" USING btree ("topic_id","seq");--> statement-breakpoint
CREATE INDEX "events_topic_path_seq_idx" ON "events" USING btree ("topic_id","path","seq");--> statement-breakpoint
CREATE INDEX "nodes_topic_parent_idx" ON "nodes" USING btree ("topic_id","parent_path");--> statement-breakpoint
CREATE INDEX "notes_topic_created_idx" ON "notes" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "topics_project_updated_idx" ON "topics" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_project_slug_idx" ON "topics" USING btree ("project_id","slug");