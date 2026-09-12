const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { requirePermission } = require("../middleware/rbac");
const upload = require("../middleware/upload");
const { getBusinessDayKey } = require("../utils/timezone");

const adminOnly = roles(["admin"]);
const prodPerm = requirePermission("products_edit");

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
    const enriched = await attachComboData(result.rows);
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo menú" });
  }
});

router.post("/", auth, prodPerm, upload.single("image"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const category = req.body.category ? String(req.body.category).trim() : "Guisados";
    const price = Number(req.body.price);
    const kitchenRequired = req.body.kitchen_required !== undefined
      ? (String(req.body.kitchen_required) === "true" || req.body.kitchen_required === true)
      : (req.body.sendToKds !== undefined ? (String(req.body.sendToKds) === "true" || req.body.sendToKds === true) : true);

    let image = null;
    if (req.file) {
      image = `/uploads/products/${req.file.filename}`;
    } else if (req.body.image) {
      image = String(req.body.image).trim();
    }

    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Nombre y precio válido son requeridos" });
    }

    const result = await pool.query(
      `
        INSERT INTO products (name, category, price, image, kitchen_required, product_kind)
        VALUES ($1, $2, $3, $4, $5, 'regular')
        RETURNING *
      `,
      [name, category || "Guisados", price, image || null, kitchenRequired]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Error creando producto" });
  }
});

router.patch("/:id", auth, prodPerm, async (req, res) => {
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

router.patch("/:id/settings", auth, prodPerm, async (req, res) => {
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

router.put("/:id", auth, prodPerm, upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID inválido" });

    const currentResult = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (!currentResult.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    const current = currentResult.rows[0];

    const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    const category = req.body.category !== undefined ? (String(req.body.category).trim() || "Guisados") : (current.category || "Guisados");
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(current.price);

    let image = current.image;
    if (req.file) {
      image = `/uploads/products/${req.file.filename}`;
    } else if (req.body.image !== undefined) {
      image = req.body.image ? String(req.body.image).trim() : null;
    }

    let kitchenRequired = current.kitchen_required;
    if (req.body.kitchen_required !== undefined) {
      kitchenRequired = String(req.body.kitchen_required) === "true" || req.body.kitchen_required === true;
    } else if (req.body.sendToKds !== undefined) {
      kitchenRequired = String(req.body.sendToKds) === "true" || req.body.sendToKds === true;
    }

    const available = req.body.available !== undefined
      ? (String(req.body.available) === "true" || req.body.available === true)
      : current.available;

    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Nombre y precio válido son requeridos" });
    }

    const result = await pool.query(
      `
        UPDATE products
        SET name = $1, category = $2, price = $3, image = $4, kitchen_required = $5, available = $6
        WHERE id = $7
        RETURNING *
      `,
      [name, category, price, image, kitchenRequired, available, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Error actualizando producto" });
  }
});

module.exports = router;
