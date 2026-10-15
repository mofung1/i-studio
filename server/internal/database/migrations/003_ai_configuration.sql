CREATE TABLE IF NOT EXISTS ai_endpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('prompt', 'image')),
    protocol TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    model TEXT NOT NULL,
    timeout_seconds INT NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 600),
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT is_default OR enabled)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_endpoints_default ON ai_endpoints(purpose) WHERE is_default;
CREATE TABLE IF NOT EXISTS prompt_templates (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    default_content TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schema_migrations (
    key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
