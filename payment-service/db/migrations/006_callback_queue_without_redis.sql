ALTER TABLE callbacks
  ALTER COLUMN order_id TYPE TEXT USING order_id::text,
  ADD COLUMN IF NOT EXISTS body JSONB,
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS callback_ts TEXT;

UPDATE callbacks
SET body = COALESCE(body, payload),
    body_text = COALESCE(body_text, payload::text),
    callback_ts = COALESCE(callback_ts, EXTRACT(EPOCH FROM created_at)::bigint::text)
WHERE body IS NULL OR body_text IS NULL OR callback_ts IS NULL;

ALTER TABLE callbacks
  ALTER COLUMN body SET NOT NULL;

ALTER TABLE callbacks
  DROP COLUMN IF EXISTS payload;

ALTER TABLE giftcards
  ADD COLUMN IF NOT EXISTS code_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS photo_ref TEXT,
  ADD COLUMN IF NOT EXISTS photo_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS escrow_state TEXT,
  ADD COLUMN IF NOT EXISTS photo_deleted_at TIMESTAMPTZ;

UPDATE giftcards
SET code_encrypted = COALESCE(code_encrypted, encrypted_code),
    photo_sha256 = COALESCE(photo_sha256, photo_hash)
WHERE code_encrypted IS NULL OR photo_sha256 IS NULL;

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS pin_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS redemption_ref TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE vouchers
SET redemption_ref = COALESCE(redemption_ref, reference),
    status = COALESCE(status, 'PENDING_REVIEW')
WHERE redemption_ref IS NULL OR status IS NULL;