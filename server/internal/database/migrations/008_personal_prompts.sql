
CREATE TABLE IF NOT EXISTS personal_prompts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('prompt','preset')), title TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '', tags JSONB NOT NULL DEFAULT '[]'::jsonb,
 favorite BOOLEAN NOT NULL DEFAULT false, config JSONB NOT NULL DEFAULT '{}'::jsonb,
 source TEXT NOT NULL DEFAULT '', version INT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_prompt_owner ON personal_prompts(user_id,kind,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS personal_prompt_versions (
 prompt_id TEXT NOT NULL REFERENCES personal_prompts(id) ON DELETE CASCADE, version INT NOT NULL,
 snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(prompt_id,version)
);