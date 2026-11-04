ALTER TABLE "invitations" ADD COLUMN "migration_source_project" text;--> statement-breakpoint
UPDATE invitations i SET migration_source_project=m.source_project FROM legacy_import_map m WHERE i.kind='lead' AND m.collection='ensembles' AND m.entity_id=i.ensemble_id;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_lead_migration_check" CHECK ("invitations"."kind" <> 'lead' OR "invitations"."migration_source_project" IS NOT NULL);