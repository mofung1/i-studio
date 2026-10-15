
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS operation_settings (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 config JSONB NOT NULL DEFAULT '{"creditName":"积分","registrationEnabled":true,"signupGiftMinor":0,"maxConcurrentTasks":2,"generationRequestsPerHour":30,"auxiliaryRequestsPerHour":20}'::jsonb,
 models_migrated BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO operation_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS credit_accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 available BIGINT NOT NULL DEFAULT 0 CHECK(available>=0),
 held BIGINT NOT NULL DEFAULT 0 CHECK(held>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO credit_accounts(user_id) SELECT id FROM users ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public_models (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint_id TEXT NOT NULL,
 price_minor BIGINT NOT NULL CHECK(price_minor>=0 AND price_minor<=100000000),
 enabled BOOLEAN NOT NULL DEFAULT false, is_default BOOLEAN NOT NULL DEFAULT false,
 version BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS public_models_default ON public_models(is_default) WHERE is_default;
CREATE TABLE IF NOT EXISTS credit_ledger (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL, available_delta BIGINT NOT NULL, held_delta BIGINT NOT NULL,
 available_after BIGINT NOT NULL, held_after BIGINT NOT NULL,
 task_id TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_time ON credit_ledger(user_id,id DESC);
CREATE TABLE IF NOT EXISTS generation_charges (
 task_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL, input_hash TEXT NOT NULL, model_id TEXT NOT NULL,
 model_name TEXT NOT NULL, unit_price BIGINT NOT NULL, quantity INT NOT NULL CHECK(quantity BETWEEN 1 AND 16),
 charged BIGINT NOT NULL DEFAULT 0, refunded BIGINT NOT NULL DEFAULT 0,
 settled BOOLEAN NOT NULL DEFAULT false, provider_snapshot JSONB NOT NULL, prompts_snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,request_key)
);
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS admin_audit (
 id BIGSERIAL PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 target_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auxiliary_usage (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auxiliary_usage_user_time ON auxiliary_usage(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS auth_attempts (
 key TEXT PRIMARY KEY, count INT NOT NULL DEFAULT 1, window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);
