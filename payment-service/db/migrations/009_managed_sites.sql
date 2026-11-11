CREATE TABLE IF NOT EXISTS managed_sites (
    site_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    site_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
