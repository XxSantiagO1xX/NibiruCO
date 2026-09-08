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

-- schema.js and the smoke runner execute this file inside a transaction. The
-- transaction-scoped lock serializes startup when several app replicas boot at
-- once, before any CREATE TABLE/INDEX statement can race.
SELECT pg_advisory_xact_lock(
  hashtext('mealops'),
  hashtext('operational-schema')
);

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

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- The legacy schema constrained these columns to the original English-only
-- mobile vocabulary. MealOps now stores the service in service_type and uses
-- type as a display label for table orders, so those single-column checks no
-- longer describe the data model.
DO $$
DECLARE
  legacy_constraint record;
BEGIN
  FOR legacy_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.orders'::regclass
      AND constraint_row.contype = 'c'
      AND constraint_row.conname IN (
        'orders_type_check',
        'orders_payment_method_check'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.orders DROP CONSTRAINT %I',
      legacy_constraint.conname
    );
  END LOOP;
END $$;

ALTER TABLE orders
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN payment_method DROP DEFAULT;

-- Preserve legacy orders while converging aliases on the vocabulary used by
-- the current API. Unknown values are left untouched so validation fails
-- visibly instead of silently changing business data.
UPDATE orders
SET service_type = CASE LOWER(COALESCE(NULLIF(service_type, ''), type))
  WHEN 'local' THEN 'local'
  WHEN 'pickup' THEN 'llevar'
  WHEN 'llevar' THEN 'llevar'
  WHEN 'recoger' THEN 'recoger'
  WHEN 'delivery' THEN 'domicilio'
  WHEN 'domicilio' THEN 'domicilio'
  WHEN 'mesa' THEN 'mesa'
END
WHERE LOWER(COALESCE(NULLIF(service_type, ''), type)) IN (
  'local', 'pickup', 'llevar', 'recoger', 'delivery', 'domicilio', 'mesa'
)
  AND (
    service_type IS NULL OR
    service_type = '' OR
    service_type <> LOWER(service_type) OR
    LOWER(service_type) IN ('pickup', 'delivery')
  );

UPDATE orders
SET type = CASE LOWER(type)
  WHEN 'pickup' THEN 'llevar'
  WHEN 'delivery' THEN 'domicilio'
  ELSE type
END
WHERE LOWER(type) IN ('pickup', 'delivery');

UPDATE orders
SET payment_method = CASE LOWER(payment_method)
  WHEN 'cash' THEN 'efectivo'
  WHEN 'card' THEN 'tarjeta'
  WHEN 'transfer' THEN 'transferencia'
  ELSE LOWER(payment_method)
END
WHERE payment_method IS NOT NULL
  AND (
    payment_method <> LOWER(payment_method) OR
    LOWER(payment_method) IN ('cash', 'card', 'transfer')
  );

UPDATE orders
SET payment_method = NULL
WHERE BTRIM(payment_method) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_service_type_mealops_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_service_type_mealops_check
      CHECK (
        service_type IS NULL OR
        service_type IN ('local', 'llevar', 'recoger', 'domicilio', 'mesa')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_payment_method_mealops_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_mealops_check
      CHECK (
        payment_method IS NULL OR
        payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'otro')
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE orders
  VALIDATE CONSTRAINT orders_service_type_mealops_check;

ALTER TABLE orders
  VALIDATE CONSTRAINT orders_payment_method_mealops_check;

-- Backfill only missing dates. A non-null value may have been corrected by an
-- operator and cannot be distinguished safely from an older faulty default.
UPDATE orders
SET service_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE service_date IS NULL;

ALTER TABLE orders
  ALTER COLUMN service_date SET DEFAULT CURRENT_DATE;

ALTER TABLE orders
  ALTER COLUMN service_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_session
  ON orders(table_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_service_date_status
  ON orders(service_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_daily_folio
  ON orders(service_date, folio)
  WHERE folio IS NOT NULL;

CREATE TABLE IF NOT EXISTS daily_folio_counters (
  day DATE PRIMARY KEY,
  last_folio INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT daily_folio_counters_last_folio_nonnegative
    CHECK (last_folio >= 0)
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
  CONSTRAINT combo_groups_selection_bounds
    CHECK (min_select <= max_select)
);

CREATE INDEX IF NOT EXISTS idx_combo_groups_product
  ON combo_groups(combo_product_id);

CREATE TABLE IF NOT EXISTS combo_group_options (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES combo_groups(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(group_id, option_product_id),
  CONSTRAINT combo_group_options_extra_price_nonnegative
    CHECK (extra_price >= 0)
);

CREATE TABLE IF NOT EXISTS order_item_combo_choices (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT order_item_combo_choices_extra_price_nonnegative
    CHECK (extra_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_combo_choices_item
  ON order_item_combo_choices(order_item_id);

-- CREATE TABLE IF NOT EXISTS does not repair constraints on tables created by
-- older releases. Add the invariants explicitly and validate existing data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_folio_counters'::regclass
      AND conname = 'daily_folio_counters_last_folio_nonnegative'
  ) THEN
    ALTER TABLE public.daily_folio_counters
      ADD CONSTRAINT daily_folio_counters_last_folio_nonnegative
      CHECK (last_folio >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.combo_groups'::regclass
      AND conname = 'combo_groups_selection_bounds'
  ) THEN
    ALTER TABLE public.combo_groups
      ADD CONSTRAINT combo_groups_selection_bounds
      CHECK (min_select <= max_select) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.combo_group_options'::regclass
      AND conname = 'combo_group_options_extra_price_nonnegative'
  ) THEN
    ALTER TABLE public.combo_group_options
      ADD CONSTRAINT combo_group_options_extra_price_nonnegative
      CHECK (extra_price >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_item_combo_choices'::regclass
      AND conname = 'order_item_combo_choices_extra_price_nonnegative'
  ) THEN
    ALTER TABLE public.order_item_combo_choices
      ADD CONSTRAINT order_item_combo_choices_extra_price_nonnegative
      CHECK (extra_price >= 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE daily_folio_counters
  VALIDATE CONSTRAINT daily_folio_counters_last_folio_nonnegative;

ALTER TABLE combo_groups
  VALIDATE CONSTRAINT combo_groups_selection_bounds;

ALTER TABLE combo_group_options
  VALIDATE CONSTRAINT combo_group_options_extra_price_nonnegative;

ALTER TABLE order_item_combo_choices
  VALIDATE CONSTRAINT order_item_combo_choices_extra_price_nonnegative;
