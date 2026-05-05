const express = require("express");
const router = express.Router();
const pool = require("../db");

// Obtener día actual
function getTodayKey() {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[new Date().getDay()];
}

// 🔥 TODOS los productos
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo productos" });
  }
});

// 🔥 Productos del menú del día
router.get("/", async (req, res) => {
  try {
    const today = getTodayKey();

    const result = await pool.query(`
      SELECT p.*
      FROM products p
      JOIN menu m ON m.product_id = p.id
      WHERE m.day = $1 AND p.available = true
    `, [today]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo menú" });
  }
});

// 🔥 Crear producto
router.post("/", async (req, res) => {
  try {
    const { name, price, image } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        message: "Nombre y precio son requeridos"
      });
    }

    const result = await pool.query(
  "INSERT INTO products (name, price, image) VALUES ($1, $2, $3) RETURNING *",
  [name, price, image || null]
);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creando producto" });
  }
});

// 🔥 Toggle disponibilidad
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "UPDATE products SET available = NOT available WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Producto no encontrado"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando producto" });
  }
});

module.exports = router;