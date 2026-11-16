CREATE TABLE IF NOT EXISTS commerce_products (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    selling_points TEXT NOT NULL DEFAULT '',
    preserve_details TEXT NOT NULL DEFAULT '',
    product_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    reference_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commerce_products_owner_date ON commerce_products(user_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_commerce_product ON generation_tasks(user_id,(input->>'productId'),created_at DESC) WHERE input ? 'productId';

CREATE TABLE IF NOT EXISTS commerce_product_adoptions (
    product_id TEXT NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('main','scene','detail','selling-point')),
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id,purpose)
);
