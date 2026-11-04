CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ensembles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"manage_members" boolean DEFAULT false NOT NULL,
	"edit_music_pieces" boolean DEFAULT false NOT NULL,
	"ai_transcription" boolean DEFAULT false NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "job_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"object_id" text NOT NULL,
	"page_number" integer NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provenance" jsonb,
	"result_xml" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"manage_members" boolean DEFAULT false NOT NULL,
	"edit_music_pieces" boolean DEFAULT false NOT NULL,
	"ai_transcription" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_pieces" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text NOT NULL,
	"title" text NOT NULL,
	"sort_key" text NOT NULL,
	"format" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"part_names" jsonb,
	"clef_overrides" jsonb,
	"removed_parts" jsonb,
	"split_parts" jsonb,
	"swing" boolean DEFAULT false NOT NULL,
	"saved_config" jsonb,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'sysadmin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_check" CHECK ("platform_roles"."role" = 'sysadmin')
);
--> statement-breakpoint
CREATE TABLE "rehearsal_sessions" (
	"ensemble_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"piece_id" text NOT NULL,
	"format" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"musicxml" text,
	"native_score" jsonb,
	"content_hash" text NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_body_format" CHECK (("score_versions"."format" = 'musicxml' AND "score_versions"."musicxml" IS NOT NULL AND "score_versions"."native_score" IS NULL) OR ("score_versions"."format" = 'score' AND "score_versions"."native_score" IS NOT NULL AND "score_versions"."musicxml" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text NOT NULL,
	"user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text NOT NULL,
	"sha256" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_objects_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "transcription_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"ensemble_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provenance" jsonb,
	"imported_piece_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "job_pages_job_id_transcription_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."transcription_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "job_pages_object_id_stored_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."stored_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_pieces" ADD CONSTRAINT "music_pieces_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsal_sessions" ADD CONSTRAINT "rehearsal_sessions_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_piece_id_music_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."music_pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_imported_piece_id_music_pieces_id_fk" FOREIGN KEY ("imported_piece_id") REFERENCES "public"."music_pieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_scope_time" ON "audit_events" USING btree ("ensemble_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_scope_idx" ON "invitations" USING btree ("ensemble_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "job_page_order" ON "job_pages" USING btree ("job_id","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_scope_user" ON "memberships" USING btree ("ensemble_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "piece_scope_order" ON "music_pieces" USING btree ("ensemble_id","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_scope_id" ON "music_pieces" USING btree ("ensemble_id","id");--> statement-breakpoint
CREATE INDEX "score_piece_idx" ON "score_versions" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "object_scope_idx" ON "stored_objects" USING btree ("ensemble_id");--> statement-breakpoint
CREATE INDEX "job_scope_idx" ON "transcription_jobs" USING btree ("ensemble_id","state");--> statement-breakpoint
CREATE INDEX "job_lease_idx" ON "transcription_jobs" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");