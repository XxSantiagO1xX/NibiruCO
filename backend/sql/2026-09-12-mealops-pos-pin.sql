-- Migration: Add pos_pin to users table (nullable, 4-6 chars, unique)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pos_pin VARCHAR(6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_pos_pin_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_pos_pin_key UNIQUE (pos_pin);
  END IF;
END $$;
