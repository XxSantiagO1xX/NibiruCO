-- MealOps Mostrador Nucleo Operativo & KDS Condicional Migration
-- 1. Columnas en order_items para estados por item y discriminación de cocina
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pendiente';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS kitchen_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

-- Restricción de estado en order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass
      AND conname = 'order_items_status_check'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_status_check
      CHECK (status IN ('pendiente', 'aceptado', 'preparando', 'listo', 'entregado')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.order_items VALIDATE CONSTRAINT order_items_status_check;

-- 2. Extensiones en orders para expedición en mostrador y servicio de mesa
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS picked_up_from_counter_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_to_table_at TIMESTAMPTZ;

-- 3. Poblar kitchen_required y estados en order_items existentes
UPDATE order_items
SET kitchen_required = COALESCE(p.kitchen_required, FALSE),
    status = CASE
      WHEN o.status = 'entregado' THEN 'entregado'
      WHEN o.status = 'listo' THEN 'listo'
      WHEN o.status = 'preparando' THEN 'preparando'
      WHEN COALESCE(p.kitchen_required, FALSE) = FALSE THEN 'listo'
      ELSE 'pendiente'
    END
FROM products p, orders o
WHERE o.id = order_items.order_id
  AND p.id = order_items.product_id;

CREATE INDEX IF NOT EXISTS idx_order_items_order_status
  ON order_items(order_id, status);

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen
  ON order_items(kitchen_required, status);
