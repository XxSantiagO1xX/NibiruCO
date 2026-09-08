const express = require("express");
const router = express.Router();
const pool = require("../db");

// Obtener día actual en inglés normalizado
function getTodayKey() {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ];
  return days[new Date().getDay()];
}

// 1. TODOS los productos del catálogo
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET ALL PRODUCTS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo catálogo de productos" });
  }
});

// 2. Productos disponibles del menú de hoy
router.get("/", async (req, res) => {
  try {
    const today = getTodayKey();

    const result = await pool.query(`
      SELECT p.*
      FROM products p
      INNER JOIN menu m ON m.product_id = p.id
      WHERE LOWER(m.day) = $1 AND p.available = true
      ORDER BY p.id ASC
    `, [today]);

    res.json(result.rows);
  } catch (err) {
    console.error("GET TODAY PRODUCTS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo menú de hoy" });
  }
});

// 3. Crear nuevo producto
router.post("/", async (req, res) => {
  try {
    const { name, price, image } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({
        message: "El nombre y el precio son requeridos"
      });
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({
        message: "El precio debe ser un número válido mayor o igual a 0"
      });
    }

    const result = await pool.query(
      `INSERT INTO products (name, price, image, available)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [name.trim(), numPrice, image ? image.trim() : null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err);
    res.status(500).json({ message: "Error creando producto" });
  }
});

// 4. Alternar disponibilidad de producto (Activar / Agotar)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE products
       SET available = NOT available
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Producto no encontrado"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("TOGGLE PRODUCT ERROR:", err);
    res.status(500).json({ message: "Error actualizando disponibilidad del producto" });
  }
});

module.exports = router;