CREATE TABLE installation_seeds (
 name TEXT PRIMARY KEY,
 checksum TEXT NOT NULL,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
