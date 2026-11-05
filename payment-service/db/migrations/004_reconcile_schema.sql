ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lock_timeout_minutes INTEGER NOT NULL DEFAULT 3;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique
  ON admin_users (email)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_authenticators (
  authenticator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  credential_id BYTEA UNIQUE NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  trans TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_keys (
  site_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  callback_secret TEXT,
  callback_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_authenticators
  ADD COLUMN IF NOT EXISTS transports TEXT[];

CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_activities (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  username TEXT,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  sender_username TEXT NOT NULL,
  message TEXT NOT NULL,
  is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_body TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  order_id TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_paid_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_balance_usd NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS customer_ref TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rail_ref TEXT,
  ADD COLUMN IF NOT EXISTS paid_asset TEXT;

UPDATE orders
SET remaining_balance_usd = amount_usd
WHERE remaining_balance_usd IS NULL;

CREATE TABLE IF NOT EXISTS widget_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  event_id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  rail_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  rail_ref TEXT,
  address TEXT,
  expected_amount NUMERIC(24, 8),
  expected_asset TEXT,
  paid_amount NUMERIC(24, 8),
  quote JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_rail
  ON payments (order_id)
  WHERE paid_amount IS NULL;

CREATE TABLE IF NOT EXISTS callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  body JSONB NOT NULL,
  signature TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_review (
  order_id TEXT PRIMARY KEY REFERENCES orders(order_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  note TEXT
);