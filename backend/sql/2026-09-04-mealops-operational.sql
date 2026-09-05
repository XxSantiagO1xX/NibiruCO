-- MealOps operational extension
-- Only objects introduced by the SaaS/operations redesign live here.
-- Existing/base tables are intentionally not recreated.

DO $$
DECLARE
  missing_tables text;
BEGIN
  SELECT string_agg(required_name, ', ' ORDER BY required_name)
  INTO missing_tables
  FROM (
    SELECT required_name
    FROM unnest(ARRAY[
      'users',
      'products',
      'orders',
      'order_items',
      'menu',
      'user_addresses',
      'password_resets'
    ]) AS required(required_name)
    WHERE to_regclass('public.' || required_name) IS NULL
  ) missing;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'MealOps base schema incompleto. Faltan tablas existentes: %', missing_tables;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  zone VARCHAR(80),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id BIGSERIAL PRIMARY KEY,
  table_id BIGINT NOT NULL REFERENCES restaurant_tables(id),
  opened_by BIGINT REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'account_requested', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_requested_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_active_session
  ON table_sessions(table_id)
  WHERE status IN ('open', 'account_requested');

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS kitchen_required BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_kind VARCHAR(20) NOT NULL DEFAULT 'regular';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_session_id BIGINT REFERENCES table_sessions(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(30);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS folio INTEGER;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_date DATE;

UPDATE orders
SET service_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE service_date IS NULL;

ALTER TABLE orders
  ALTER COLUMN service_date SET DEFAULT CURRENT_DATE;

ALTER TABLE orders
  ALTER COLUMN service_date SET NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_table_session
  ON orders(table_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_service_date_status
  ON orders(service_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_daily_folio
  ON orders(service_date, folio)
  WHERE folio IS NOT NULL;

CREATE TABLE IF NOT EXISTS daily_folio_counters (
  day DATE PRIMARY KEY,
  last_folio INTEGER NOT NULL DEFAULT 0 CHECK (last_folio >= 0)
);

CREATE TABLE IF NOT EXISTS table_payments (
  id BIGSERIAL PRIMARY KEY,
  table_session_id BIGINT NOT NULL REFERENCES table_sessions(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(30) NOT NULL
    CHECK (method IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  registered_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_payments_session
  ON table_payments(table_session_id);

CREATE TABLE IF NOT EXISTS combo_groups (
  id BIGSERIAL PRIMARY KEY,
  combo_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 1 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (min_select <= max_select)
);

CREATE INDEX IF NOT EXISTS idx_combo_groups_product
  ON combo_groups(combo_product_id);

CREATE TABLE IF NOT EXISTS combo_group_options (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES combo_groups(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(group_id, option_product_id)
);

CREATE TABLE IF NOT EXISTS order_item_combo_choices (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_combo_choices_item
  ON order_item_combo_choices(order_item_id);
