CREATE TABLE "legacy_import_map" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"source_project" text NOT NULL,
	"collection" text NOT NULL,
	"legacy_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"imported_revision" integer,
	"baseline" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "kind" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_import_identity" ON "legacy_import_map" USING btree ("source_project","collection","legacy_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_kind_check" CHECK ("invitations"."kind" IN ('member','lead'));