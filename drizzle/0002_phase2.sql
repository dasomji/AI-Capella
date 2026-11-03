ALTER TABLE ensembles ADD COLUMN kind text CHECK (kind IN ('choir','band','other'));
ALTER TABLE invitations ADD COLUMN send_count integer NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN last_sent_at timestamptz;
ALTER TABLE invitations ADD COLUMN delivery_state text NOT NULL DEFAULT 'not_sent';
ALTER TABLE invitations ADD COLUMN language text NOT NULL DEFAULT 'en';
ALTER TABLE invitations ADD COLUMN request_key text;
ALTER TABLE music_pieces ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX piece_idempotency ON music_pieces(ensemble_id,idempotency_key);
ALTER TABLE music_pieces ADD COLUMN format_defaults jsonb;
