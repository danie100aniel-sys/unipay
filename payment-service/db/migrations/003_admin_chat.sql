-- Admin-to-admin communication channels and superadmin broadcasts
CREATE TABLE IF NOT EXISTS admin_chat_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_chat_recipient ON admin_chat_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_chat_broadcast ON admin_chat_messages(is_broadcast, created_at DESC);