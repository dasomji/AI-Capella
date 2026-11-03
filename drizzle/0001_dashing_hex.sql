CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_inviter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "job_pages" DROP CONSTRAINT "job_pages_job_id_transcription_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "job_pages" DROP CONSTRAINT "job_pages_object_id_stored_objects_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_roles" DROP CONSTRAINT "platform_roles_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "score_versions" DROP CONSTRAINT "score_versions_piece_id_music_pieces_id_fk";
--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transcription_jobs" DROP CONSTRAINT "transcription_jobs_imported_piece_id_music_pieces_id_fk";
--> statement-breakpoint
ALTER TABLE "transcription_jobs" DROP CONSTRAINT "transcription_jobs_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "ensembles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "inviter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_pages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "music_pieces" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "score_versions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "stored_objects" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "stored_objects" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accepted_by" text;--> statement-breakpoint
ALTER TABLE "job_pages" ADD COLUMN "ensemble_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "music_pieces" ADD COLUMN "current_version_id" text;--> statement-breakpoint
ALTER TABLE "score_versions" ADD COLUMN "ensemble_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "score_versions" ADD COLUMN "version_no" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "score_versions" ADD COLUMN "created_by" text;--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_email" ON "invitations" USING btree ("ensemble_id","email") WHERE "invitations"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "membership_leads_idx" ON "memberships" USING btree ("ensemble_id") WHERE "memberships"."is_lead";--> statement-breakpoint
CREATE UNIQUE INDEX "score_version_number" ON "score_versions" USING btree ("piece_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "score_scope_piece_id" ON "score_versions" USING btree ("ensemble_id","piece_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_scope_id" ON "stored_objects" USING btree ("ensemble_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_scope_id" ON "transcription_jobs" USING btree ("ensemble_id","id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_email_normalized" CHECK ("invitations"."email" = lower(trim("invitations"."email")));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_state_check" CHECK ("invitations"."state" IN ('pending', 'accepted', 'revoked', 'expired'));--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "page_state_check" CHECK ("job_pages"."state" IN ('queued','running','completed','failed','cancelled'));--> statement-breakpoint
ALTER TABLE "music_pieces" ADD CONSTRAINT "piece_format_check" CHECK ("music_pieces"."format" IN ('musicxml','score'));--> statement-breakpoint
ALTER TABLE "score_versions" ADD CONSTRAINT "score_version_positive" CHECK ("score_versions"."version_no" > 0);--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "object_state_check" CHECK ("stored_objects"."state" IN ('pending','ready','failed','deleted'));--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "job_state_check" CHECK ("transcription_jobs"."state" IN ('queued','running','completed','failed','cancelled'));
--> statement-breakpoint
ALTER TABLE music_pieces ALTER COLUMN sort_key TYPE text COLLATE "C";
--> statement-breakpoint
CREATE FUNCTION normalize_account_email() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.email = lower(trim(NEW.email)); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER user_email_normalized BEFORE INSERT OR UPDATE OF email ON "user" FOR EACH ROW EXECUTE FUNCTION normalize_account_email();
--> statement-breakpoint
CREATE TRIGGER invitation_email_normalized BEFORE INSERT OR UPDATE OF email ON invitations FOR EACH ROW EXECUTE FUNCTION normalize_account_email();
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "job_pages_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "job_pages_ensemble_id_job_id_transcription_jobs_ensemble_id_id_fk" FOREIGN KEY ("ensemble_id","job_id") REFERENCES "public"."transcription_jobs"("ensemble_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_pages" ADD CONSTRAINT "job_pages_ensemble_id_object_id_stored_objects_ensemble_id_id_fk" FOREIGN KEY ("ensemble_id","object_id") REFERENCES "public"."stored_objects"("ensemble_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_ensemble_id_ensembles_id_fk" FOREIGN KEY ("ensemble_id") REFERENCES "public"."ensembles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_versions" ADD CONSTRAINT "score_versions_ensemble_id_piece_id_music_pieces_ensemble_id_id_fk" FOREIGN KEY ("ensemble_id","piece_id") REFERENCES "public"."music_pieces"("ensemble_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_ensemble_id_imported_piece_id_music_pieces_ensemble_id_id_fk" FOREIGN KEY ("ensemble_id","imported_piece_id") REFERENCES "public"."music_pieces"("ensemble_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE music_pieces ADD CONSTRAINT piece_current_version_fk FOREIGN KEY (ensemble_id, id, current_version_id) REFERENCES score_versions (ensemble_id, piece_id, id) DEFERRABLE INITIALLY DEFERRED;

--> statement-breakpoint
CREATE FUNCTION maintain_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN FOREACH tab IN ARRAY ARRAY['user','session','account','verification','ensembles','music_pieces','rehearsal_sessions','transcription_jobs','job_pages'] LOOP EXECUTE format('CREATE TRIGGER maintain_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION maintain_updated_at()', tab); END LOOP; END $$;
