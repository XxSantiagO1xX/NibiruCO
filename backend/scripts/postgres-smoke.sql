\set ON_ERROR_STOP on

-- This smoke test runs inside a transaction and leaves the target database
-- unchanged. Run it only against an otherwise empty disposable database.
BEGIN;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'cliente',
  allow_push BOOLEAN DEFAULT TRUE,
  expo_push_token VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(100),
  address TEXT NOT NULL,
  details TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  image TEXT,
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE menu (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  day VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, day)
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('local', 'pickup', 'delivery')),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'card')),
  address_id INTEGER REFERENCES user_addresses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT orders_type_nonempty_custom CHECK (BTRIM(type) <> '')
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(50) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, phone, password)
VALUES ('Legacy user', '4420000000', 'not-a-real-password');

INSERT INTO products (name, price)
VALUES ('Legacy product', 100);

INSERT INTO orders (user_id, type, total, payment_method, created_at)
VALUES (1, 'pickup', 100, 'cash', '2025-01-15 12:00:00-06');

-- Reproduce a partially installed operational extension: the columns and
-- tables exist, but the date backfill and several later invariants are absent.
CREATE TABLE restaurant_tables (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  zone VARCHAR(80),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE table_sessions (
  id BIGSERIAL PRIMARY KEY,
  table_id BIGINT NOT NULL REFERENCES restaurant_tables(id),
  opened_by BIGINT REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'account_requested', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_requested_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

ALTER TABLE products
  ADD COLUMN kitchen_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN product_kind VARCHAR(20) NOT NULL DEFAULT 'regular';

ALTER TABLE orders
  ADD COLUMN table_session_id BIGINT REFERENCES table_sessions(id),
  ADD COLUMN service_type VARCHAR(30),
  ADD COLUMN customer_name VARCHAR(120),
  ADD COLUMN pickup_at TIMESTAMPTZ,
  ADD COLUMN folio INTEGER,
  ADD COLUMN service_date DATE,
  ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN paid_at TIMESTAMPTZ;

CREATE TABLE daily_folio_counters (
  day DATE PRIMARY KEY,
  last_folio INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE table_payments (
  id BIGSERIAL PRIMARY KEY,
  table_session_id BIGINT NOT NULL REFERENCES table_sessions(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(30) NOT NULL
    CHECK (method IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  registered_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE combo_groups (
  id BIGSERIAL PRIMARY KEY,
  combo_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 1 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select > 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE combo_group_options (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES combo_groups(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (group_id, option_product_id)
);

CREATE TABLE order_item_combo_choices (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

INSERT INTO restaurant_tables (name, zone, capacity, sort_order)
VALUES ('Legacy table', 'Salón', 4, 1);

INSERT INTO table_sessions (table_id, opened_by)
VALUES (1, 1);

INSERT INTO orders (
  user_id, type, total, payment_method, created_at, table_session_id,
  service_type, service_date
)
VALUES (
  1, 'local', 75, 'card', '2025-02-01 12:00:00-06', 1,
  'mesa', DATE '2025-02-02'
);

\ir ../sql/2026-09-04-mealops-operational.sql
\ir ../sql/2026-09-04-mealops-operational.sql

DO $$
DECLARE
  migrated_order orders%ROWTYPE;
  table_order orders%ROWTYPE;
  expected_constraint_count integer;
  invalid_constraints integer;
  custom_constraint_count integer;
  payment_is_required boolean;
BEGIN
  SELECT * INTO STRICT migrated_order FROM orders WHERE id = 1;
  SELECT * INTO STRICT table_order FROM orders WHERE id = 2;

  IF migrated_order.type <> 'llevar' OR migrated_order.service_type <> 'llevar' THEN
    RAISE EXCEPTION 'Legacy pickup order was not migrated to llevar';
  END IF;

  IF migrated_order.payment_method <> 'efectivo' THEN
    RAISE EXCEPTION 'Legacy cash payment was not migrated to efectivo';
  END IF;

  IF migrated_order.service_date <> DATE '2025-01-15' THEN
    RAISE EXCEPTION 'Historical service date was not restored from created_at';
  END IF;

  IF table_order.service_date <> DATE '2025-02-02' THEN
    RAISE EXCEPTION 'An existing table-order service date was overwritten';
  END IF;

  SELECT COUNT(*) INTO custom_constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_type_nonempty_custom';

  IF custom_constraint_count <> 1 THEN
    RAISE EXCEPTION 'A non-legacy orders.type constraint was removed';
  END IF;

  SELECT attnotnull INTO STRICT payment_is_required
  FROM pg_attribute
  WHERE attrelid = 'public.orders'::regclass
    AND attname = 'payment_method';

  IF payment_is_required THEN
    RAISE EXCEPTION 'orders.payment_method still rejects pending payments';
  END IF;

  SELECT COUNT(*) INTO expected_constraint_count
  FROM pg_constraint
  WHERE conname IN (
    'orders_service_type_mealops_check',
    'orders_payment_method_mealops_check',
    'daily_folio_counters_last_folio_nonnegative',
    'combo_groups_selection_bounds',
    'combo_group_options_extra_price_nonnegative',
    'order_item_combo_choices_extra_price_nonnegative'
  );

  IF expected_constraint_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 MealOps constraints, found %', expected_constraint_count;
  END IF;

  SELECT COUNT(*) INTO invalid_constraints
  FROM pg_constraint
  WHERE conname IN (
    'orders_service_type_mealops_check',
    'orders_payment_method_mealops_check',
    'daily_folio_counters_last_folio_nonnegative',
    'combo_groups_selection_bounds',
    'combo_group_options_extra_price_nonnegative',
    'order_item_combo_choices_extra_price_nonnegative'
  )
    AND NOT convalidated;

  IF invalid_constraints <> 0 THEN
    RAISE EXCEPTION 'One or more MealOps constraints were not validated';
  END IF;
END $$;

INSERT INTO orders (
  user_id, type, total, status, service_type, service_date
)
VALUES (1, 'Mesa 01', 100, 'pendiente', 'mesa', CURRENT_DATE);

DO $$
DECLARE
  valid_group_id bigint;
  valid_order_item_id bigint;
BEGIN
  BEGIN
    INSERT INTO orders (
      user_id, type, total, status, service_type, service_date
    ) VALUES (1, 'local', 100, 'pendiente', 'dron', CURRENT_DATE);
    RAISE EXCEPTION 'Invalid service_type was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO orders (
      user_id, type, total, status, payment_method, service_type, service_date
    ) VALUES (1, 'local', 100, 'pendiente', 'bitcoin', 'local', CURRENT_DATE);
    RAISE EXCEPTION 'Invalid payment_method was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO daily_folio_counters (day, last_folio)
    VALUES (DATE '2025-01-16', -1);
    RAISE EXCEPTION 'Negative folio counter was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO combo_groups (combo_product_id, name, min_select, max_select)
    VALUES (1, 'Invalid group', 2, 1);
    RAISE EXCEPTION 'Invalid combo selection bounds were accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO combo_groups (combo_product_id, name, min_select, max_select)
  VALUES (1, 'Valid group', 0, 1)
  RETURNING id INTO valid_group_id;

  BEGIN
    INSERT INTO combo_group_options (group_id, option_product_id, extra_price)
    VALUES (valid_group_id, 1, -0.01);
    RAISE EXCEPTION 'Negative combo option price was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO order_items (order_id, product_id, quantity)
  VALUES (1, 1, 1)
  RETURNING id INTO valid_order_item_id;

  BEGIN
    INSERT INTO order_item_combo_choices (
      order_item_id, option_product_id, quantity, extra_price
    ) VALUES (valid_order_item_id, 1, 1, -0.01);
    RAISE EXCEPTION 'Negative order combo choice price was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;

\echo 'MealOps PostgreSQL smoke: OK'
