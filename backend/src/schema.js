const pool = require("./db");

async function ensureOperationalSchema() {
  await pool.query(`
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

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS table_session_id BIGINT REFERENCES table_sessions(id);

    CREATE INDEX IF NOT EXISTS idx_orders_table_session
      ON orders(table_session_id);

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
  `);

  const tableCount = await pool.query("SELECT COUNT(*)::int AS count FROM restaurant_tables");
  if (tableCount.rows[0].count === 0) {
    const values = [];
    const params = [];
    for (let index = 1; index <= 16; index += 1) {
      const offset = params.length;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(`Mesa ${String(index).padStart(2, "0")}`, "Salón", 4, index);
    }
    await pool.query(`
      INSERT INTO restaurant_tables (name, zone, capacity, sort_order)
      VALUES ${values.join(", ")}
    `, params);
  }
}

module.exports = ensureOperationalSchema;
