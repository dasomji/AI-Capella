CREATE TABLE "object_deletions" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcription_control" (
	"id" integer PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_pages" ADD COLUMN "source_page" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_pages" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "job_pages" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "job_pages" ADD COLUMN "metrics" jsonb;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD COLUMN "kind" text DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "result_xml" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD COLUMN "metrics" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "original_dedupe" ON "stored_objects" USING btree ("ensemble_id","sha256") WHERE "stored_objects"."kind" = 'original' AND "stored_objects"."state" = 'ready';--> statement-breakpoint
CREATE UNIQUE INDEX "job_request_key" ON "transcription_jobs" USING btree ("ensemble_id","user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "job_import_once" ON "transcription_jobs" USING btree ("imported_piece_id");--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "object_kind_check" CHECK ("stored_objects"."kind" IN ('original','derived'));