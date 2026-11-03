CREATE TABLE "idempotency_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ensemble_id" text NOT NULL,
	"user_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_sends" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ensemble_id" text NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superseded_invitations" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope" ON "idempotency_records" USING btree ("ensemble_id","user_id","operation","request_key");--> statement-breakpoint
CREATE INDEX "invitation_send_window" ON "invitation_sends" USING btree ("ensemble_id","email","created_at");--> statement-breakpoint
CREATE INDEX "invitation_sender_window" ON "invitation_sends" USING btree ("inviter_id","created_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_delivery_state_check" CHECK ("invitations"."delivery_state" IN ('sent', 'not_sent'));--> statement-breakpoint
CREATE FUNCTION ensure_ensemble_lead() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected text;
BEGIN
  FOR affected IN SELECT DISTINCT id FROM (VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD.ensemble_id END),(CASE WHEN TG_OP <> 'DELETE' THEN NEW.ensemble_id END)) AS v(id) WHERE id IS NOT NULL LOOP
    PERFORM id FROM ensembles WHERE id=affected FOR UPDATE;
    IF EXISTS(SELECT 1 FROM ensembles WHERE id=affected) AND NOT EXISTS(SELECT 1 FROM memberships WHERE ensemble_id=affected AND is_lead) THEN
      RAISE EXCEPTION 'ensemble requires a lead' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ensemble_requires_lead AFTER INSERT OR UPDATE OR DELETE ON memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_ensemble_lead();
--> statement-breakpoint
CREATE FUNCTION ensure_new_ensemble_lead() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM ensembles WHERE id=NEW.id) AND NOT EXISTS(SELECT 1 FROM memberships WHERE ensemble_id=NEW.id AND is_lead) THEN
    RAISE EXCEPTION 'ensemble requires a lead' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER new_ensemble_requires_lead AFTER INSERT ON ensembles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_new_ensemble_lead();
--> statement-breakpoint
-- Backfill legacy invitation history
-- Old rows retain only the last send instant. Conservatively age their bounded
-- count from that instant so upgrading cannot reset a recipient's send budget.
INSERT INTO invitation_sends(ensemble_id,email,inviter_id,created_at)
SELECT i.ensemble_id,i.email,coalesce(i.inviter_id,'deleted-inviter'),i.last_sent_at
FROM invitations i CROSS JOIN LATERAL generate_series(1,least(i.send_count,5)) AS sends(n)
WHERE i.last_sent_at > now() - interval '24 hours'
AND NOT EXISTS (SELECT 1 FROM invitation_sends s WHERE s.ensemble_id=i.ensemble_id AND s.email=i.email);
