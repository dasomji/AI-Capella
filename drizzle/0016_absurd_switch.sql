ALTER TABLE "ensembles" ADD COLUMN "awaiting_lead" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Only explicitly staged imported ensembles may temporarily have no lead.
CREATE OR REPLACE FUNCTION ensure_ensemble_lead() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected text;
BEGIN
  FOR affected IN SELECT DISTINCT id FROM (VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD.ensemble_id END),(CASE WHEN TG_OP <> 'DELETE' THEN NEW.ensemble_id END)) AS v(id) WHERE id IS NOT NULL LOOP
    PERFORM id FROM ensembles WHERE id=affected FOR UPDATE;
    IF EXISTS(SELECT 1 FROM ensembles WHERE id=affected AND NOT awaiting_lead) AND NOT EXISTS(SELECT 1 FROM memberships WHERE ensemble_id=affected AND is_lead) THEN
      RAISE EXCEPTION 'ensemble requires a lead' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_new_ensemble_lead() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM ensembles WHERE id=NEW.id AND NOT awaiting_lead) AND NOT EXISTS(SELECT 1 FROM memberships WHERE ensemble_id=NEW.id AND is_lead) THEN
    RAISE EXCEPTION 'ensemble requires a lead' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER updated_ensemble_requires_lead AFTER UPDATE ON ensembles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_new_ensemble_lead();
