const express = require("express");
const router = express.Router();
const pool = require("../db");

const VALID_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

/* 1. OBTENER TODO EL MENÚ SEMANAL (DESDE POSTGRESQL) */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT day, ARRAY_AGG(product_id ORDER BY product_id ASC) AS products
       FROM menu
       GROUP BY day`
    );

    const weeklyMenu = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: []
    };

    result.rows.forEach(row => {
      const normalizedDay = row.day.toLowerCase();
      if (weeklyMenu[normalizedDay] !== undefined) {
        weeklyMenu[normalizedDay] = (row.products || []).map(Number);
      }
    });

    res.json(weeklyMenu);

  } catch (err) {
    console.error("GET MENU ERROR:", err);
    res.status(500).json({ message: "Error obteniendo el menú semanal" });
  }
});

/* 2. OBTENER MENÚ POR DÍA */
router.get("/:day", async (req, res) => {
  try {
    const day = (req.params.day || "").toLowerCase();

    if (!VALID_DAYS.includes(day)) {
      return res.status(400).json({ message: `Día inválido: ${day}` });
    }

    const result = await pool.query(
      "SELECT product_id FROM menu WHERE LOWER(day) = $1 ORDER BY product_id ASC",
      [day]
    );

    const products = result.rows.map(r => Number(r.product_id));

    res.json({
      day,
      products
    });

  } catch (err) {
    console.error("GET DAY MENU ERROR:", err);
    res.status(500).json({ message: "Error obteniendo el menú del día" });
  }
});

/* 3. GUARDAR MENÚ POR DÍA (PERSISTENCIA TOTAL EN POSTGRESQL) */
router.post("/day", async (req, res) => {
  const { day, products } = req.body;

  // Validación de inputs antes de abrir conexión a DB
  if (!day || !Array.isArray(products)) {
    return res.status(400).json({
      message: "Faltan datos requeridos (day: string, products: array)"
    });
  }

  const normalizedDay = day.toLowerCase();

  if (!VALID_DAYS.includes(normalizedDay)) {
    return res.status(400).json({
      message: `Día inválido: ${day}. Días permitidos: ${VALID_DAYS.join(", ")}`
    });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Limpiar menú anterior de ese día
    await client.query(
      "DELETE FROM menu WHERE LOWER(day) = $1",
      [normalizedDay]
    );

    // Insertar nuevos productos asociados
    for (const prodId of products) {
      const pId = Number(prodId);
      if (pId && !isNaN(pId)) {
        await client.query(
          "INSERT INTO menu (product_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [pId, normalizedDay]
        );
      }
    }

    await client.query("COMMIT");

    // Notificar en tiempo real a todas las pantallas conectadas
    const io = req.app.get("io");
    if (io) {
      io.emit("menu-updated", {
        day: normalizedDay,
        products: products.map(Number)
      });
    }

    res.json({
      ok: true,
      message: "Menú guardado correctamente en base de datos",
      day: normalizedDay,
      products: products.map(Number)
    });

  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("SAVE MENU ERROR:", err);
    res.status(500).json({ message: "Error guardando menú en base de datos" });

  } finally {
    if (client) client.release();
  }
});

module.exports = router;