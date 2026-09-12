const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { requirePermission } = require("../middleware/rbac");
const { VALID_DAYS, getBusinessDayKey } = require("../utils/timezone");

router.get("/today", async (req, res) => {
  try {
    const overrideDay = req.query.override_day || req.headers["x-override-day"];
    const today = getBusinessDayKey(overrideDay);

    const result = await pool.query(
      `
        SELECT p.*
        FROM products p
        JOIN menu m ON m.product_id = p.id
        WHERE m.day = $1 AND p.available = true
        ORDER BY p.id
      `,
      [today]
    );

    res.json({
      day: today,
      products: result.rows.map((row) => row.id),
      items: result.rows.map((p) => ({ ...p, price: Number(p.price) }))
    });
  } catch (err) {
    console.error("GET MENU TODAY ERROR:", err);
    res.status(500).json({ message: "Error obteniendo el menú de hoy" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT day, product_id
      FROM menu
      ORDER BY day, product_id
    `);

    const weeklyMenu = Object.fromEntries(VALID_DAYS.map((day) => [day, []]));
    for (const row of result.rows) {
      if (weeklyMenu[row.day]) weeklyMenu[row.day].push(row.product_id);
    }

    res.json(weeklyMenu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo el menú semanal" });
  }
});

router.get("/:day", async (req, res) => {
  try {
    const { day } = req.params;
    if (!VALID_DAYS.includes(day)) {
      return res.status(400).json({ message: "Día inválido" });
    }

    const result = await pool.query(
      "SELECT product_id FROM menu WHERE day = $1 ORDER BY product_id",
      [day]
    );

    res.json({ day, products: result.rows.map((row) => row.product_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo el menú del día" });
  }
});

router.post("/day", auth, requirePermission("menu_edit"), async (req, res) => {
  const client = await pool.connect();

  try {
    const { day, products } = req.body;

    if (!VALID_DAYS.includes(day) || !Array.isArray(products)) {
      return res.status(400).json({ message: "Datos de menú inválidos" });
    }

    const uniqueProductIds = [...new Set(products.map(Number))].filter(Number.isInteger);

    await client.query("BEGIN");
    await client.query("DELETE FROM menu WHERE day = $1", [day]);

    for (const productId of uniqueProductIds) {
      await client.query(
        "INSERT INTO menu (day, product_id) VALUES ($1, $2)",
        [day, productId]
      );
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("menu-updated", { day, products: uniqueProductIds });

    res.json({ message: "Menú guardado", day, products: uniqueProductIds });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Error guardando el menú" });
  } finally {
    client.release();
  }
});

module.exports = router;
