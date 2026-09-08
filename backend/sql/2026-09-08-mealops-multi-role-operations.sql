-- MealOps Multi-Role Operations Migration
-- Supports: Mesero Table Assignments, Delivery Dispatching, PIN verification, Cash settlement & Zones

-- 1. Actualizar roles permitidos en users si existe restricción
DO $$
DECLARE
  role_constraint record;
BEGIN
  FOR role_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND conname LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', role_constraint.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_role_mealops_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_mealops_check
      CHECK (role IN ('cliente', 'mesero', 'cocina', 'repartidor', 'admin')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.users VALIDATE CONSTRAINT users_role_mealops_check;

-- 2. Tabla de asignaciones de mesas a meseros por turno
CREATE TABLE IF NOT EXISTS waiter_table_assignments (
  id BIGSERIAL PRIMARY KEY,
  waiter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_id BIGINT NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assigned_by BIGINT REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(waiter_user_id, table_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_waiter_assignments_date
  ON waiter_table_assignments(shift_date, waiter_user_id);

-- 3. Zonas de reparto
CREATE TABLE IF NOT EXISTS delivery_zones (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  min_order NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  estimated_min_minutes INTEGER NOT NULL DEFAULT 25 CHECK (estimated_min_minutes > 0),
  estimated_max_minutes INTEGER NOT NULL DEFAULT 45 CHECK (estimated_max_minutes >= estimated_min_minutes),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  coordinates_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sembrar zonas por defecto si está vacía
INSERT INTO delivery_zones (name, fee, min_order, estimated_min_minutes, estimated_max_minutes)
VALUES
  ('Zona Centro / Cercana (0-2 km)', 15.00, 80.00, 20, 35),
  ('Zona Media (2-5 km)', 30.00, 120.00, 30, 45),
  ('Zona Extendida (5-8 km)', 45.00, 180.00, 40, 60)
ON CONFLICT (name) DO NOTHING;

-- 4. Viajes y paradas de reparto
CREATE TABLE IF NOT EXISTS delivery_trips (
  id BIGSERIAL PRIMARY KEY,
  driver_user_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_transit', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver
  ON delivery_trips(driver_user_id, status);

CREATE TABLE IF NOT EXISTS delivery_trip_stops (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL DEFAULT 1 CHECK (stop_order > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'arrived', 'delivered', 'failed')),
  eta_minutes INTEGER,
  arrived_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  fail_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_stops_order
  ON delivery_trip_stops(order_id);

-- 5. Extensiones en orders para soporte de domicilio, PIN, efectivo y liquidación
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_pin VARCHAR(6);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_driver_id BIGINT REFERENCES users(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_zone_id BIGINT REFERENCES delivery_zones(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_paid_with NUMERIC(12,2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_change_due NUMERIC(12,2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_received NUMERIC(12,2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_settled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_pin_validated_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_admin_override BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_admin_override_reason TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10,7);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10,7);

-- 6. Actualizar constraint de payment_method en orders si existe para soportar pago_en_app
DO $$
DECLARE
  pm_constraint record;
BEGIN
  FOR pm_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND conname LIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', pm_constraint.conname);
  END LOOP;
END $$;

DO $$
BEGIN
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
        payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'pago_en_app', 'otro')
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_method_mealops_check;
