const fs = require("fs");
const path = require("path");
const pool = require("./db");

const operationalSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-04-mealops-operational.sql"
);
const multiRoleSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-08-mealops-multi-role-operations.sql"
);
const counterKdsSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-08-mealops-counter-kds-dispatch.sql"
);
const autoDispatchSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-09-mealops-auto-dispatch.sql"
);
const settingsRbacSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-09-mealops-settings-rbac.sql"
);
const routesIncidentsSqlPath = path.resolve(
  __dirname,
  "../sql/2026-09-09-mealops-routes-incidents-settlements.sql"
);

async function ensureOperationalSchema() {
  const client = await pool.connect();

  try {
    const sql1 = fs.readFileSync(operationalSqlPath, "utf8");
    const sql2 = fs.readFileSync(multiRoleSqlPath, "utf8");
    const sql3 = fs.readFileSync(counterKdsSqlPath, "utf8");
    const sql4 = fs.readFileSync(autoDispatchSqlPath, "utf8");
    const sql5 = fs.readFileSync(settingsRbacSqlPath, "utf8");
    const sql6 = fs.readFileSync(routesIncidentsSqlPath, "utf8");

    await client.query("BEGIN");
    await client.query(sql1);
    await client.query(sql2);
    await client.query(sql3);
    await client.query(sql4);
    await client.query(sql5);
    await client.query(sql6);

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

    // Cumulative order folio sequence (does not reset daily)
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS order_folio_seq START WITH 1;
    `);
    const maxFolioRes = await client.query("SELECT COALESCE(MAX(folio), 0)::int AS max_folio FROM orders");
    const currentMax = maxFolioRes.rows[0]?.max_folio || 0;
    if (currentMax > 0) {
      await client.query("SELECT setval('order_folio_seq', GREATEST($1, 1), true)", [currentMax]);
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
