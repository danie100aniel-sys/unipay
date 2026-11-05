DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'orders'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_record.table_name, constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS admin_review
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;
ALTER TABLE IF EXISTS order_events
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;
ALTER TABLE IF EXISTS payer_data
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;
ALTER TABLE IF EXISTS payments
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;
ALTER TABLE IF EXISTS webhook_log
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;
ALTER TABLE IF EXISTS widget_sessions
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;

DELETE FROM admin_review r WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = r.order_id);
DELETE FROM order_events e WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = e.order_id);
DELETE FROM payer_data p WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = p.order_id);
DELETE FROM payments p WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = p.order_id);
DELETE FROM webhook_log w WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = w.order_id);
DELETE FROM widget_sessions s WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_id = s.order_id);

ALTER TABLE IF EXISTS admin_review
  ADD CONSTRAINT admin_review_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS order_events
  ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS payer_data
  ADD CONSTRAINT payer_data_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS payments
  ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS webhook_log
  ADD CONSTRAINT webhook_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS widget_sessions
  ADD CONSTRAINT widget_sessions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;