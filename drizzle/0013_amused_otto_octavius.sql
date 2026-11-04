CREATE INDEX "admin_audit_created" ON "audit_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_actor" ON "audit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_target" ON "audit_events" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_action" ON "audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_ensemble_name" ON "ensembles" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "admin_ensemble_created" ON "ensembles" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_piece_updated" ON "music_pieces" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "admin_piece_title" ON "music_pieces" USING btree ("title","id");--> statement-breakpoint
CREATE INDEX "admin_job_created" ON "transcription_jobs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_user_created" ON "user" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_user_name" ON "user" USING btree ("name","id");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX admin_user_search ON "user" USING gin ((email || ' ' || name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX admin_ensemble_search ON ensembles USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX admin_piece_search ON music_pieces USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX admin_invitation_search ON invitations USING gin (email gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX admin_user_email_search ON "user" USING gin (email gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX admin_audit_search ON audit_events USING gin (action gin_trgm_ops);
