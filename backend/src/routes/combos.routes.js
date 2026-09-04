const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const adminOnly = roles(["admin"]);

async function getCombo(productId, client = pool) {
  const productResult = await client.query(`
    SELECT id, name, price, available, kitchen_required, product_kind
    FROM products
    WHERE id = $1 AND product_kind = 'combo'
  `, [productId]);

  if (!productResult.rows.length) return null;

  const groupsResult = await client.query(`
    SELECT id, name, min_select, max_select, sort_order
    FROM combo_groups
    WHERE combo_product_id = $1
    ORDER BY sort_order, id
  `, [productId]);

  const groups = [];
  for (const group of groupsResult.rows) {
    const optionsResult = await client.query(`
      SELECT
        o.id,
        o.option_product_id,
        o.extra_price,
        o.active,
        p.name,
        p.available,
        p.kitchen_required
      FROM combo_group_options o
      JOIN products p ON p.id = o.option_product_id
      WHERE o.group_id = $1
      ORDER BY p.name
    `, [group.id]);

    groups.push({
      ...group,
      options: optionsResult.rows.map((option) => ({
        ...option,
        extra_price: Number(option.extra_price)
      }))
    });
  }

  return {
    ...productResult.rows[0],
    price: Number(productResult.rows[0].price),
    groups
  };
}

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id FROM products
      WHERE product_kind = 'combo'
      ORDER BY id
    `);
    const combos = [];
    for (const row of result.rows) {
      const combo = await getCombo(row.id);
      if (combo) combos.push(combo);
    }
    res.json(combos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo combos" });
  }
});

router.get("/:productId", auth, async (req, res) => {
  try {
    const combo = await getCombo(Number(req.params.productId));
    if (!combo) return res.status(404).json({ message: "Combo no encontrado" });
    res.json(combo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo combo" });
  }
});

router.post("/", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const kitchenRequired = req.body.kitchen_required !== false;

    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Nombre y precio válido son requeridos" });
    }

    await client.query("BEGIN");
    const result = await client.query(`
      INSERT INTO products (name, price, image, available, kitchen_required, product_kind)
      VALUES ($1, $2, NULL, TRUE, $3, 'combo')
      RETURNING *
    `, [name, price, kitchenRequired]);
    await client.query("COMMIT");

    res.status(201).json(await getCombo(result.rows[0].id));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error(err);
    res.status(500).json({ message: "Error creando combo" });
  } finally {
    client.release();
  }
});

router.post("/:productId/groups", auth, adminOnly, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const name = String(req.body.name || "").trim();
    const minSelect = Number(req.body.min_select ?? 1);
    const maxSelect = Number(req.body.max_select ?? 1);
    const sortOrder = Number(req.body.sort_order) || 0;

    if (!name || !Number.isInteger(minSelect) || !Number.isInteger(maxSelect) || minSelect < 0 || maxSelect < 1 || minSelect > maxSelect) {
      return res.status(400).json({ message: "Configuración de grupo inválida" });
    }

    const combo = await getCombo(productId);
    if (!combo) return res.status(404).json({ message: "Combo no encontrado" });

    const result = await pool.query(`
      INSERT INTO combo_groups (combo_product_id, name, min_select, max_select, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [productId, name, minSelect, maxSelect, sortOrder]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creando grupo del combo" });
  }
});

router.post("/groups/:groupId/options", auth, adminOnly, async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const productId = Number(req.body.option_product_id);
    const extraPrice = Number(req.body.extra_price || 0);

    if (!Number.isInteger(groupId) || !Number.isInteger(productId) || !Number.isFinite(extraPrice) || extraPrice < 0) {
      return res.status(400).json({ message: "Opción inválida" });
    }

    const groupResult = await pool.query("SELECT id FROM combo_groups WHERE id = $1", [groupId]);
    if (!groupResult.rows.length) return res.status(404).json({ message: "Grupo no encontrado" });

    const productResult = await pool.query("SELECT id FROM products WHERE id = $1", [productId]);
    if (!productResult.rows.length) return res.status(404).json({ message: "Producto de opción no encontrado" });

    const result = await pool.query(`
      INSERT INTO combo_group_options (group_id, option_product_id, extra_price)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_id, option_product_id)
      DO UPDATE SET extra_price = EXCLUDED.extra_price, active = TRUE
      RETURNING *
    `, [groupId, productId, extraPrice]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error agregando opción al combo" });
  }
});

router.patch("/groups/:groupId/options/:optionId", auth, adminOnly, async (req, res) => {
  try {
    const active = Boolean(req.body.active);
    const result = await pool.query(`
      UPDATE combo_group_options
      SET active = $1
      WHERE group_id = $2 AND id = $3
      RETURNING *
    `, [active, Number(req.params.groupId), Number(req.params.optionId)]);

    if (!result.rows.length) return res.status(404).json({ message: "Opción no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando opción" });
  }
});

router.delete("/groups/:groupId", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM combo_groups WHERE id = $1 RETURNING id", [Number(req.params.groupId)]);
    if (!result.rows.length) return res.status(404).json({ message: "Grupo no encontrado" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error eliminando grupo" });
  }
});

module.exports = router;
