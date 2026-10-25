CREATE TABLE inspiration_submission_settings (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 enabled BOOLEAN NOT NULL DEFAULT true,
 daily_limit INT NOT NULL DEFAULT 5 CHECK(daily_limit BETWEEN 1 AND 100)
);
INSERT INTO inspiration_submission_settings(id) VALUES(true);

CREATE TABLE inspiration_submissions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 personal_prompt_id TEXT REFERENCES personal_prompts(id) ON DELETE SET NULL,
 request_key TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 current_version INT NOT NULL DEFAULT 1,
 published_version INT NOT NULL DEFAULT 0,
 publication_id TEXT NOT NULL UNIQUE,
 reward_minor BIGINT NOT NULL DEFAULT 0 CHECK(reward_minor>=0),
 rewarded_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX inspiration_submission_personal ON inspiration_submissions(user_id,personal_prompt_id) WHERE personal_prompt_id IS NOT NULL;
CREATE INDEX inspiration_submission_owner ON inspiration_submissions(user_id,updated_at DESC,id);

CREATE TABLE inspiration_submission_revisions (
 submission_id TEXT NOT NULL REFERENCES inspiration_submissions(id),
 version INT NOT NULL CHECK(version>0),
 user_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 title TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 category_id TEXT REFERENCES inspiration_categories(id) ON DELETE SET NULL,
 category TEXT NOT NULL,
 prompt TEXT NOT NULL,
 instructions TEXT NOT NULL DEFAULT '',
 requires_reference BOOLEAN NOT NULL DEFAULT false,
 cover_key TEXT NOT NULL,
 width INT NOT NULL,
 height INT NOT NULL,
 cover_bytes BIGINT NOT NULL CHECK(cover_bytes>0),
 storage_bytes BIGINT NOT NULL CHECK(storage_bytes>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
 review_reason TEXT NOT NULL DEFAULT '',
 review_hash TEXT NOT NULL DEFAULT '',
 reviewer_id TEXT NOT NULL DEFAULT '',
 reviewed_at TIMESTAMPTZ,
 review_reward_minor BIGINT NOT NULL DEFAULT 0,
 public_key TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(submission_id,version),
 UNIQUE(user_id,request_key)
);
CREATE INDEX inspiration_submission_queue ON inspiration_submission_revisions(status,created_at,submission_id);
CREATE INDEX inspiration_submission_daily ON inspiration_submission_revisions(user_id,created_at);
CREATE INDEX inspiration_submission_content ON inspiration_submission_revisions(user_id,content_hash);
ALTER TABLE inspiration_prompts ADD COLUMN submission_id TEXT UNIQUE REFERENCES inspiration_submissions(id);
ALTER TABLE inspiration_prompts ADD COLUMN requires_reference BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inspiration_prompts ADD COLUMN instructions TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION account_storage_bytes(owner_id TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT sum(size_bytes) FROM assets WHERE user_id=owner_id),0)::bigint
      + COALESCE((SELECT sum(storage_bytes) FROM prompt_reverse_tasks WHERE user_id=owner_id),0)::bigint
      + COALESCE((SELECT sum(storage_bytes) FROM inspiration_submission_revisions WHERE user_id=owner_id),0)::bigint
$$;
CREATE TRIGGER submission_storage_quota BEFORE INSERT OR UPDATE OF storage_bytes,user_id ON inspiration_submission_revisions FOR EACH ROW EXECUTE FUNCTION enforce_account_storage_quota();
