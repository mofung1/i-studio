ALTER TABLE public_models
    ADD COLUMN usage_hint TEXT NOT NULL DEFAULT ''
    CHECK (char_length(usage_hint) <= 200);
