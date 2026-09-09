-- MealOps Settings and Granular RBAC Migration
-- 1. Configuraciones generales del sistema (clave-valor JSONB)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value)
VALUES
  ('restaurant_info', '{"name": "MealOps Cocina", "phone": "555-0199", "address": "Av. Principal 123", "timezone": "America/Mexico_City", "operating_hours": "08:00 - 18:00"}'::jsonb),
  ('operational_flow', '{"kds_mode": "kitchen_only", "direct_counter_for_ready_items": true, "sound_alerts_enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Nuevas columnas en tabla users para Staff y actividad
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(30);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Catálogo de Permisos Granulares
CREATE TABLE IF NOT EXISTS permissions (
  code VARCHAR(80) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT
);

INSERT INTO permissions (code, name, category, description)
VALUES
  ('pos_access', 'Acceso a Punto de Venta', 'Ventas', 'Permite abrir el POS y registrar pedidos'),
  ('pos_cash_collect', 'Cobro y Cierre en Caja', 'Ventas', 'Permite cobrar en efectivo/tarjeta y marcar pedidos como pagados'),
  ('waiter_access', 'Acceso a Modo Mesero', 'Salón', 'Permite tomar comandas de mesa y buscar folios de salón'),
  ('tables_manage', 'Administrar Mesas', 'Salón', 'Permite crear mesas, modificar zonas y asignar comensales'),
  ('kds_access', 'Acceso a Pantalla KDS', 'Cocina', 'Permite ver las comandas en tiempo real en cocina'),
  ('kds_advance', 'Avanzar Platillos en Cocina', 'Cocina', 'Permite aceptar, preparar y marcar listos platillos en KDS'),
  ('counter_access', 'Acceso a Mostrador', 'Mostrador', 'Permite abrir el centro de expedición y salida'),
  ('counter_dispatch', 'Entrega y Salida de Pedidos', 'Mostrador', 'Permite marcar pedidos entregados a clientes o saloneros'),
  ('driver_dispatch', 'Viajes de Reparto Móvil', 'Domicilio', 'Permite recibir ofertas, aceptar rutas y validar entregas con PIN'),
  ('driver_status_toggle', 'Gestionar Estado de Chofer', 'Domicilio', 'Permite cambiar entre Disponible, Pausa y Fuera de turno'),
  ('menu_edit', 'Editar Menú Semanal', 'Catálogo', 'Permite configurar los platillos de cada día de la semana'),
  ('products_edit', 'Gestionar Catálogo de Productos', 'Catálogo', 'Permite crear platillos, precios e imágenes'),
  ('combos_edit', 'Gestionar Combos y Opciones', 'Catálogo', 'Permite crear combos, grupos de elección y suplementos'),
  ('staff_manage', 'Gestionar Personal y Empleados', 'Administración', 'Permite crear colaboradores, cambiar roles y dar de baja'),
  ('settings_manage', 'Configuración del Negocio', 'Administración', 'Permite modificar datos del local, horarios y despacho'),
  ('override_delivery', 'Override de Entregas y Despacho', 'Administración', 'Permite forzar asignaciones de viaje y autorizar entregas excepcionales')
ON CONFLICT (code) DO NOTHING;

-- 4. Matriz de Permisos por Rol
CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(50) NOT NULL,
  permission_code VARCHAR(80) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

-- Permisos por defecto para Admin (Todos)
INSERT INTO role_permissions (role, permission_code)
SELECT 'admin', code FROM permissions
ON CONFLICT DO NOTHING;

-- Permisos por defecto para Mesero
INSERT INTO role_permissions (role, permission_code)
VALUES
  ('mesero', 'pos_access'),
  ('mesero', 'pos_cash_collect'),
  ('mesero', 'waiter_access'),
  ('mesero', 'counter_access')
ON CONFLICT DO NOTHING;

-- Permisos por defecto para Cocina
INSERT INTO role_permissions (role, permission_code)
VALUES
  ('cocina', 'kds_access'),
  ('cocina', 'kds_advance'),
  ('cocina', 'counter_access')
ON CONFLICT DO NOTHING;

-- Permisos por defecto para Repartidor
INSERT INTO role_permissions (role, permission_code)
VALUES
  ('repartidor', 'counter_access'),
  ('repartidor', 'driver_dispatch'),
  ('repartidor', 'driver_status_toggle')
ON CONFLICT DO NOTHING;

-- 5. Overrides de Permisos Específicos por Usuario
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code VARCHAR(80) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, permission_code)
);

-- 6. Asignar short_code inicial a usuarios existentes que no lo tengan
UPDATE users
SET short_code = CASE
  WHEN role = 'admin' THEN 'ADM-' || LPAD(id::text, 2, '0')
  WHEN role = 'mesero' THEN 'MES-' || LPAD(id::text, 2, '0')
  WHEN role = 'cocina' THEN 'COC-' || LPAD(id::text, 2, '0')
  WHEN role = 'repartidor' THEN 'REP-' || LPAD(id::text, 2, '0')
  ELSE 'CLI-' || LPAD(id::text, 2, '0')
END
WHERE short_code IS NULL;
