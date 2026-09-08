const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const adminOnly = roles(["admin"]);

function getTodayKey() {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

async function attachComboData(products, client = pool) {
  if (!Array.isArray(products) || !products.length) return products;
  const comboProducts = products.filter((p) => p.product_kind === "combo");
  if (!comboProducts.length) {
    return products.map((p) => ({ ...p, price: Number(p.price) }));
  }

  const comboIds = comboProducts.map((p) => p.id);
  const groupsRes = await client.query(
    `
      SELECT id, combo_product_id, name, min_select, max_select, sort_order
      FROM combo_groups
      WHERE combo_product_id = ANY($1::bigint[])
      ORDER BY sort_order, id
    `,
    [comboIds]
  );

  const groupIds = groupsRes.rows.map((g) => g.id);
  let optionsRes = { rows: [] };
  if (groupIds.length) {
    optionsRes = await client.query(
      `
        SELECT
          o.id,
          o.group_id,
          o.option_product_id,
          o.extra_price,
          o.active,
          p.name,
          p.available,
          p.kitchen_required
        FROM combo_group_options o
        JOIN products p ON p.id = o.option_product_id
        WHERE o.group_id = ANY($1::bigint[])
        ORDER BY p.name
      `,
      [groupIds]
    );
  }

  const optionsByGroup = {};
  for (const opt of optionsRes.rows) {
    if (!optionsByGroup[opt.group_id]) optionsByGroup[opt.group_id] = [];
    optionsByGroup[opt.group_id].push({
      ...opt,
      extra_price: Number(opt.extra_price)
    });
  }

  const groupsByCombo = {};
  for (const grp of groupsRes.rows) {
    if (!groupsByCombo[grp.combo_product_id]) groupsByCombo[grp.combo_product_id] = [];
    groupsByCombo[grp.combo_product_id].push({
      ...grp,
      options: optionsByGroup[grp.id] || []
    });
  }

  return products.map((p) => {
    if (p.product_kind === "combo") {
      return {
        ...p,
        price: Number(p.price),
        groups: groupsByCombo[p.id] || []
      };
    }
    return {
      ...p,
      price: Number(p.price)
    };
  });
}

router.get("/all", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id");
    const enriched = await attachComboData(result.rows);
    res.json(enriched);
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
    const enriched = await attachComboData(result.rows);
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo menú" });
  }
});

router.post("/", auth, adminOnly, async (req, res) => {
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

router.patch("/:id", auth, adminOnly, async (req, res) => {
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

router.patch("/:id/settings", auth, adminOnly, async (req, res) => {
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

router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID inválido" });

    const currentResult = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (!currentResult.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    const current = currentResult.rows[0];

    const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(current.price);
    const image = req.body.image !== undefined ? (req.body.image ? String(req.body.image).trim() : null) : current.image;
    const kitchenRequired = req.body.kitchen_required !== undefined ? Boolean(req.body.kitchen_required) : current.kitchen_required;
    const available = req.body.available !== undefined ? Boolean(req.body.available) : current.available;

    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Nombre y precio válido son requeridos" });
    }

    const result = await pool.query(
      `
        UPDATE products
        SET name = $1, price = $2, image = $3, kitchen_required = $4, available = $5
        WHERE id = $6
        RETURNING *
      `,
      [name, price, image, kitchenRequired, available, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando producto" });
  }
});

module.exports = router;
