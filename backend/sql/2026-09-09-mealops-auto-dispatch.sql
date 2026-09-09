-- MealOps Automatic Delivery Dispatch Migration
-- 1. Estados operativos de repartidores en tabla users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_status VARCHAR(30) NOT NULL DEFAULT 'offline';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_last_completed_at TIMESTAMPTZ;

DO $$
DECLARE
  ds_constraint record;
BEGIN
  FOR ds_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND conname LIKE '%driver_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', ds_constraint.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_driver_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_driver_status_check
      CHECK (driver_status IN ('offline', 'disponible', 'oferta_pendiente', 'esperando_recogida', 'en_ruta', 'regresando', 'pausa')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.users VALIDATE CONSTRAINT users_driver_status_check;

-- 2. Configuración dinámica de despacho
CREATE TABLE IF NOT EXISTS delivery_dispatch_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dispatch_mode VARCHAR(20) NOT NULL DEFAULT 'automatic' CHECK (dispatch_mode IN ('automatic', 'manual')),
  offer_timeout_seconds INTEGER NOT NULL DEFAULT 20 CHECK (offer_timeout_seconds >= 5),
  grouping_window_seconds INTEGER NOT NULL DEFAULT 120 CHECK (grouping_window_seconds >= 0),
  max_orders_per_trip INTEGER NOT NULL DEFAULT 3 CHECK (max_orders_per_trip >= 1),
  auto_dispatch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO delivery_dispatch_config (id, dispatch_mode, offer_timeout_seconds, grouping_window_seconds, max_orders_per_trip, auto_dispatch_enabled)
VALUES (1, 'automatic', 20, 120, 3, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Tabla de ofertas exclusivas de viajes a repartidores
CREATE TABLE IF NOT EXISTS delivery_assignment_offers (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT REFERENCES delivery_trips(id) ON DELETE CASCADE,
  order_ids BIGINT[] NOT NULL,
  driver_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  score NUMERIC(10,2) NOT NULL DEFAULT 0,
  recommendation_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver_status
  ON delivery_assignment_offers(driver_user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_status_expires
  ON delivery_assignment_offers(status, expires_at);
