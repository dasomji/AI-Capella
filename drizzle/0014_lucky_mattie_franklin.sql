CREATE INDEX "admin_audit_action_id" ON "audit_events" USING btree ("action","id");--> statement-breakpoint
CREATE INDEX "admin_membership_created" ON "memberships" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX admin_job_search ON transcription_jobs USING gin (id gin_trgm_ops);
