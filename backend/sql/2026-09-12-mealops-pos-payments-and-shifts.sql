-- Migration: POS Split Payments and Cash Register Shifts
-- 1. Table for multiple payments per order (Split bill / mixed payment methods)
CREATE TABLE IF NOT EXISTS order_payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method VARCHAR(50) NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  tip_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  registered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_created_at ON order_payments(created_at);

-- 2. Table for POS Cash Register Shifts (Auditable cash drawer cuts)
CREATE TABLE IF NOT EXISTS cash_register_shifts (
  id SERIAL PRIMARY KEY,
  opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opening_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  closing_time TIMESTAMP WITH TIME ZONE,
  reported_cash NUMERIC(10,2),
  expected_cash NUMERIC(10,2),
  difference NUMERIC(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_register_shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opening_time ON cash_register_shifts(opening_time);
