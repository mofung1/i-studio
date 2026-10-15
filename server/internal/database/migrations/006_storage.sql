
CREATE TABLE IF NOT EXISTS storage_deletions(storage_key TEXT PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, next_attempt TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS storage_profiles(id TEXT PRIMARY KEY, config JSONB NOT NULL, secrets_encrypted TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS storage_settings(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id), active_profile TEXT NOT NULL DEFAULT 'local');
INSERT INTO storage_settings(id) VALUES(true) ON CONFLICT DO NOTHING;