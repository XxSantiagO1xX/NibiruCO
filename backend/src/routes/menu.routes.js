const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const VALID_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

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

router.post("/day", auth, roles(["admin"]), async (req, res) => {
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
