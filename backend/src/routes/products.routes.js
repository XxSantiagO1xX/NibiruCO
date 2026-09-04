const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

function getTodayKey() {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo productos" });
  }
});

router.get("/", async (req, res) => {
  try {
    const today = getTodayKey();
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
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo menú" });
  }
});

router.post("/", auth, roles(["admin"]), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const image = req.body.image ? String(req.body.image).trim() : null;
    const kitchenRequired = req.body.kitchen_required !== false;

    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Nombre y precio válido son requeridos" });
    }

    const result = await pool.query(
      `
        INSERT INTO products (name, price, image, kitchen_required, product_kind)
        VALUES ($1, $2, $3, $4, 'regular')
        RETURNING *
      `,
      [name, price, image || null, kitchenRequired]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creando producto" });
  }
});

router.patch("/:id", auth, roles(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const result = await pool.query(
      "UPDATE products SET available = NOT available WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando producto" });
  }
});

router.patch("/:id/settings", auth, roles(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID inválido" });

    const currentResult = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (!currentResult.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    const current = currentResult.rows[0];

    const kitchenRequired = req.body.kitchen_required === undefined
      ? current.kitchen_required
      : Boolean(req.body.kitchen_required);

    const result = await pool.query(`
      UPDATE products
      SET kitchen_required = $1
      WHERE id = $2
      RETURNING *
    `, [kitchenRequired, id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando configuración del producto" });
  }
});

module.exports = router;
