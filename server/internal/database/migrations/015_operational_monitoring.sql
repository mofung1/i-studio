CREATE TABLE storage_failures (
 id TEXT PRIMARY KEY,
 operation TEXT NOT NULL CHECK(operation IN ('save','open','read','delete','sign')),
 backend TEXT NOT NULL CHECK(backend IN ('local','cloud')),
 object_reference TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX storage_failures_time ON storage_failures(created_at DESC);
CREATE INDEX generation_tasks_monitor_queue ON generation_tasks(status,created_at) WHERE status IN ('queued','processing','waiting_provider');
CREATE INDEX generation_charges_monitor_pending ON generation_charges(user_id,created_at) WHERE NOT settled;
