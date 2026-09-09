-- MealOps Routes, Incidents, Settlements & ETA Migration
-- Builds on: auto-dispatch, multi-role-operations, settings-rbac

-- ============================================================
-- 1. Folio Operativo de Viajes con Concurrencia Atómica
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_trip_folio_counters (
  day DATE PRIMARY KEY,
  last_folio INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE delivery_trips
  ADD COLUMN IF NOT EXISTS trip_folio INTEGER;

-- ============================================================
-- 2. Centro de Incidencias
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_incidents (
  id BIGSERIAL PRIMARY KEY,
  stop_id BIGINT REFERENCES delivery_trip_stops(id) ON DELETE SET NULL,
  trip_id BIGINT REFERENCES delivery_trips(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  driver_user_id BIGINT REFERENCES users(id),
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baja', 'media', 'alta', 'urgente')),
  status VARCHAR(30) NOT NULL DEFAULT 'nueva'
    CHECK (status IN ('nueva', 'en_revision', 'resuelta', 'cerrada')),
  admin_notes TEXT,
  resolved_by BIGINT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_incidents_status
  ON delivery_incidents(status, priority);

CREATE INDEX IF NOT EXISTS idx_delivery_incidents_driver
  ON delivery_incidents(driver_user_id, created_at DESC);

-- ============================================================
-- 3. Fuente de Verdad del Cobro Físico, Cambio y Estado de Pago
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_collected_by VARCHAR(30);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_collector_user_id BIGINT REFERENCES users(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_collected_at TIMESTAMPTZ;

-- cash_paid_with y cash_change_due ya existen de migración anterior (multi-role-operations)
-- Agregar cash_collected_amount (neto retenido por el repartidor)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_collected_amount NUMERIC(12,2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shift_id BIGINT;

-- ============================================================
-- 4. Turnos Operativos y Liquidaciones Multi-movimiento
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_shifts (
  id BIGSERIAL PRIMARY KEY,
  driver_user_id BIGINT NOT NULL REFERENCES users(id),
  shift_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  initial_cash_float NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_expected NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_settled NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  settlement_status VARCHAR(30) NOT NULL DEFAULT 'pendiente'
    CHECK (settlement_status IN ('pendiente', 'parcial', 'liquidado', 'diferencia')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver_date
  ON driver_shifts(driver_user_id, shift_date);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_status
  ON driver_shifts(status, shift_date);

CREATE TABLE IF NOT EXISTS driver_settlement_entries (
  id BIGSERIAL PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES driver_shifts(id) ON DELETE CASCADE,
  driver_user_id BIGINT NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  received_by BIGINT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_entries_shift
  ON driver_settlement_entries(shift_id);

-- ============================================================
-- 5. ETA y Tracking con Fuente Explícita (extiende delivery_trip_stops)
-- ============================================================
ALTER TABLE delivery_trip_stops
  ADD COLUMN IF NOT EXISTS eta_source VARCHAR(40) NOT NULL DEFAULT 'heuristic';

ALTER TABLE delivery_trip_stops
  ADD COLUMN IF NOT EXISTS eta_min_minutes INTEGER;

ALTER TABLE delivery_trip_stops
  ADD COLUMN IF NOT EXISTS eta_max_minutes INTEGER;

ALTER TABLE delivery_trip_stops
  ADD COLUMN IF NOT EXISTS estimated_arrival_at TIMESTAMPTZ;

ALTER TABLE delivery_trip_stops
  ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ;

-- arrived_at, delivered_at, failed_at, fail_reason ya existen de migración anterior

-- ============================================================
-- 6. Avatar para usuarios (fotos de colaboradores)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================
-- 7. Constraint de payment_collected_by
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_payment_collected_by_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_collected_by_check
      CHECK (payment_collected_by IS NULL OR payment_collected_by IN ('business', 'driver')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_collected_by_check;
