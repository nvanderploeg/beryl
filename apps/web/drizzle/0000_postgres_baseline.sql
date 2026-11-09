CREATE TABLE "beryl_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"topic_id" varchar(36) NOT NULL,
	"path" varchar(512) COLLATE "C",
	"type" varchar(16) NOT NULL,
	"payload" json NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beryl_nodes" (
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
	CONSTRAINT "beryl_nodes_topic_id_path_pk" PRIMARY KEY("topic_id","path")
);
--> statement-breakpoint
CREATE TABLE "beryl_notes" (
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
CREATE TABLE "beryl_pairings" (
	"code_hash" char(64) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beryl_projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(48),
	"name" varchar(200) NOT NULL,
	"write_key_hash" char(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_write_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beryl_sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"last_action_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beryl_topics" (
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
ALTER TABLE "beryl_events" ADD CONSTRAINT "beryl_events_topic_id_beryl_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."beryl_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beryl_nodes" ADD CONSTRAINT "beryl_nodes_topic_id_beryl_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."beryl_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beryl_notes" ADD CONSTRAINT "beryl_notes_topic_id_beryl_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."beryl_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beryl_pairings" ADD CONSTRAINT "beryl_pairings_project_id_beryl_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."beryl_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beryl_sessions" ADD CONSTRAINT "beryl_sessions_project_id_beryl_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."beryl_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beryl_topics" ADD CONSTRAINT "beryl_topics_project_id_beryl_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."beryl_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beryl_events_topic_seq_idx" ON "beryl_events" USING btree ("topic_id","seq");--> statement-breakpoint
CREATE INDEX "beryl_events_topic_path_seq_idx" ON "beryl_events" USING btree ("topic_id","path","seq");--> statement-breakpoint
CREATE INDEX "beryl_nodes_topic_parent_idx" ON "beryl_nodes" USING btree ("topic_id","parent_path");--> statement-breakpoint
CREATE INDEX "beryl_notes_topic_created_idx" ON "beryl_notes" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "beryl_projects_slug_idx" ON "beryl_projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "beryl_topics_project_updated_idx" ON "beryl_topics" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "beryl_topics_project_slug_idx" ON "beryl_topics" USING btree ("project_id","slug");