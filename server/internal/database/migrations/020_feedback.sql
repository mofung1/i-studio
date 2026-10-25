CREATE TABLE feedback (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 content TEXT NOT NULL CHECK(char_length(content) BETWEEN 1 AND 2000),
 page_path TEXT NOT NULL DEFAULT '/',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','handled')),
 handled_by TEXT NOT NULL DEFAULT '',
 handled_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX feedback_queue ON feedback(status,created_at DESC,id);
CREATE INDEX feedback_owner_created ON feedback(user_id,created_at DESC);
CREATE TABLE feedback_images (
 feedback_id TEXT NOT NULL REFERENCES feedback(id),
 position INT NOT NULL CHECK(position BETWEEN 1 AND 3),
 storage_key TEXT NOT NULL,
 mime TEXT NOT NULL,
 size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 width INT NOT NULL CHECK(width>0),
 height INT NOT NULL CHECK(height>0),
 PRIMARY KEY(feedback_id,position)
);
