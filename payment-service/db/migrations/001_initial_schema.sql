-- 1. Base Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin')),
  passkey_credential JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Multi-Tenant Sites Table
CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Core Orders Table
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'CREATED',
  amount_usd NUMERIC(12, 2) NOT NULL,
  client_ip TEXT,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Gift Cards Assets Table
CREATE TABLE IF NOT EXISTS giftcards (
  giftcard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  face_value_usd NUMERIC(12, 2) NOT NULL,
  encrypted_code TEXT NOT NULL,
  photo_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Vouchers Assets Table
CREATE TABLE IF NOT EXISTS vouchers (
  voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  rail TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  order_id TEXT REFERENCES orders(order_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);