ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_site_id_fkey;

ALTER TABLE orders
  ADD CONSTRAINT orders_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES merchant_keys(site_id) ON DELETE CASCADE;