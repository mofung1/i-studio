
ALTER TABLE assets ADD COLUMN IF NOT EXISTS thumbnail_key TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_assets_upload_hash ON assets(user_id,hash) WHERE task_id IS NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assets_owner_date ON assets(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_date ON generation_tasks(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING gin(tags);