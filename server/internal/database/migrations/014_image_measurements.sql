ALTER TABLE generation_deliveries ADD COLUMN elapsed_ms BIGINT CHECK(elapsed_ms>=0);
CREATE TABLE ai_image_measurements (
 id TEXT PRIMARY KEY,
 endpoint_id TEXT NOT NULL,
 upstream_model_id TEXT NOT NULL,
 aspect_ratio TEXT NOT NULL,
 resolution TEXT NOT NULL,
 width INT NOT NULL DEFAULT 0,
 height INT NOT NULL DEFAULT 0,
 size_bytes BIGINT NOT NULL DEFAULT 0,
 elapsed_ms BIGINT NOT NULL,
 success BOOLEAN NOT NULL,
 error_message TEXT NOT NULL DEFAULT '',
 estimated_cost_micros BIGINT CHECK(estimated_cost_micros>=0),
 actual_cost_micros BIGINT CHECK(actual_cost_micros>=0),
 currency TEXT NOT NULL DEFAULT 'CNY',
 cost_note TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_image_measurements_channel ON ai_image_measurements(endpoint_id,upstream_model_id,created_at DESC);
