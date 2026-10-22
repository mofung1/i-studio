CREATE TABLE auxiliary_runs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_until TIMESTAMPTZ NOT NULL,
 finished_at TIMESTAMPTZ
);
CREATE INDEX auxiliary_runs_daily ON auxiliary_runs(started_at);
CREATE INDEX auxiliary_runs_active ON auxiliary_runs(lease_until) WHERE finished_at IS NULL;
CREATE INDEX credit_ledger_signup_budget ON credit_ledger(created_at) WHERE kind='signup';
CREATE TABLE registration_invite (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 code_hash TEXT NOT NULL
);

ALTER TABLE prompt_reverse_tasks ADD COLUMN storage_bytes BIGINT NOT NULL DEFAULT 0 CHECK(storage_bytes>=0);
ALTER TABLE prompt_reverse_tasks ADD COLUMN storage_estimated BOOLEAN NOT NULL DEFAULT false;
-- Existing temporary records have no byte lengths. Reserve the upload ceilings
-- until their normal expiry rather than undercounting or guessing exact bytes.
UPDATE prompt_reverse_tasks SET storage_bytes=10485760+CASE WHEN analysis_key<>'' THEN 5242880 ELSE 0 END,storage_estimated=true;

CREATE FUNCTION account_storage_bytes(owner_id TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT sum(size_bytes) FROM assets WHERE user_id=owner_id),0)::bigint
      + COALESCE((SELECT sum(storage_bytes) FROM prompt_reverse_tasks WHERE user_id=owner_id),0)::bigint
$$;

CREATE FUNCTION enforce_account_storage_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT; incoming BIGINT; used BIGINT; quota BIGINT;
BEGIN
 owner_id := NEW.user_id;
 PERFORM id FROM users WHERE id=owner_id FOR KEY SHARE;
 PERFORM pg_advisory_xact_lock(724091030,hashtext(owner_id));
 SELECT COALESCE((config->>'accountStorageLimitBytes')::bigint,1073741824) INTO quota FROM operation_settings WHERE id=true;
 used := account_storage_bytes(owner_id);
 IF TG_TABLE_NAME='assets' THEN
   incoming := NEW.size_bytes;
   IF TG_OP='UPDATE' AND OLD.user_id=owner_id THEN used := used-OLD.size_bytes; END IF;
 ELSE
   incoming := NEW.storage_bytes;
   IF TG_OP='UPDATE' AND OLD.user_id=owner_id THEN used := used-OLD.storage_bytes; END IF;
 END IF;
 IF incoming<0 OR used+incoming>quota THEN
   RAISE EXCEPTION 'account storage quota exceeded' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assets_storage_quota BEFORE INSERT OR UPDATE OF size_bytes,user_id ON assets FOR EACH ROW EXECUTE FUNCTION enforce_account_storage_quota();
CREATE TRIGGER reverse_storage_quota BEFORE INSERT OR UPDATE OF storage_bytes,user_id ON prompt_reverse_tasks FOR EACH ROW EXECUTE FUNCTION enforce_account_storage_quota();
