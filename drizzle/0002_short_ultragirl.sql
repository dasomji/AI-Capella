ALTER TABLE "ensembles" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "send_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_state" text DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "music_pieces" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "music_pieces" ADD COLUMN "format_defaults" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "piece_idempotency" ON "music_pieces" USING btree ("ensemble_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "ensembles" ADD CONSTRAINT "ensemble_kind_check" CHECK ("ensembles"."kind" IN ('choir','band','other'));