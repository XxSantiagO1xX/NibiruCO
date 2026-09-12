-- Migration: Add category column to products table for POS category filtering and inventory management
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'Guisados';

UPDATE products
  SET category = 'Guisados'
  WHERE category IS NULL OR TRIM(category) = '';
