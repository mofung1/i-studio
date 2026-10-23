ALTER TABLE site_settings
    ADD COLUMN contact_mode TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN contact_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN contact_qr_key TEXT NOT NULL DEFAULT '',
    ADD CONSTRAINT site_contact_valid CHECK (
        (contact_mode = 'none' AND contact_text = '' AND contact_qr_key = '') OR
        (contact_mode = 'text' AND char_length(contact_text) BETWEEN 1 AND 500 AND contact_qr_key = '') OR
        (contact_mode = 'qrcode' AND contact_text = '' AND contact_qr_key <> '')
    );
