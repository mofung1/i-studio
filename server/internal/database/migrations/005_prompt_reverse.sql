CREATE TABLE IF NOT EXISTS prompt_reverse_settings(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),config JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS prompt_reverse_tasks(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,
 status TEXT NOT NULL,mode TEXT NOT NULL,requirements TEXT NOT NULL DEFAULT '',
 image_key TEXT NOT NULL,analysis_key TEXT NOT NULL DEFAULT '',image_mime TEXT NOT NULL,image_name TEXT NOT NULL,image_width INT NOT NULL,image_height INT NOT NULL,
 fingerprint TEXT NOT NULL,settings JSONB NOT NULL,system_prompt TEXT NOT NULL,template_version TEXT NOT NULL,
 result JSONB NULL,error_message TEXT NOT NULL DEFAULT '',run_token TEXT NOT NULL DEFAULT '',deadline TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL,
 UNIQUE(user_id,request_id));
ALTER TABLE prompt_reverse_tasks ADD COLUMN IF NOT EXISTS analysis_key TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_prompt_reverse_queue ON prompt_reverse_tasks(created_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS idx_prompt_reverse_owner ON prompt_reverse_tasks(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_reverse_expiry ON prompt_reverse_tasks(expires_at);