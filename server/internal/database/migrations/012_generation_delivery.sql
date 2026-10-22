ALTER TABLE generation_tasks ADD COLUMN lease_token TEXT NOT NULL DEFAULT '';

-- One durable submission and delivery record per requested image. Provider IDs
-- and encrypted temporary results remain private to the worker.
CREATE TABLE generation_deliveries (
 task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
 position INT NOT NULL CHECK(position BETWEEN 1 AND 16),
 request_key TEXT NOT NULL,
 module_key TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('submitting','waiting_provider','saving','saved','failed')),
 provider_task_id TEXT NOT NULL DEFAULT '',
 result_source_encrypted TEXT NOT NULL DEFAULT '',
 asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
 error_message TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,position),
 UNIQUE(task_id,request_key)
);
