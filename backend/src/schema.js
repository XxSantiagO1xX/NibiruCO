const fs = require("fs");
const path = require("path");
const pool = require("./db");

const operationalSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-04-mealops-operational.sql"
);

async function ensureOperationalSchema() {
  const client = await pool.connect();

  try {
    const sql = fs.readFileSync(operationalSqlPath, "utf8");

    await client.query("BEGIN");
    await client.query(sql);

    const tableCount = await client.query(
      "SELECT COUNT(*)::int AS count FROM restaurant_tables"
    );

    if (tableCount.rows[0].count === 0) {
      const values = [];
      const params = [];

      for (let index = 1; index <= 16; index += 1) {
        const offset = params.length;
        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        params.push(
          `Mesa ${String(index).padStart(2, "0")}`,
          "Salón",
          4,
          index
        );
      }

      await client.query(`
        INSERT INTO restaurant_tables (name, zone, capacity, sort_order)
        VALUES ${values.join(", ")}
        ON CONFLICT (name) DO NOTHING
      `, params);
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Conservamos el error original del esquema.
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = ensureOperationalSchema;
