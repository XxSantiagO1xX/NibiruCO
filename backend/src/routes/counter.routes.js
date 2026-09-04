const express = require("express");
const router = express.Router();

const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const counterRoles = roles(["mesero", "cocina", "admin"]);

router.get("/orders", auth, counterRoles, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id,
        o.folio,
        o.service_date,
        o.service_type,
        o.customer_name,
        o.pickup_at,
        o.status,
        o.total,
        o.payment_status,
        o.payment_method,
        o.created_at,
        ua.address,
        ua.details,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', oi.product_id,
              'name', p.name,
              'quantity', oi.quantity,
              'product_kind', p.product_kind,
              'choices', COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'name', op.name,
                    'quantity', occ.quantity
                  ) ORDER BY occ.id
                )
                FROM order_item_combo_choices occ
                JOIN products op ON op.id = occ.option_product_id
                WHERE occ.order_item_id = oi.id
              ), '[]'::json)
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.table_session_id IS NULL
        AND COALESCE(o.service_type, o.type, 'local') IN ('local', 'llevar', 'recoger', 'domicilio')
        AND o.service_date = CURRENT_DATE
        AND o.status IN ('pendiente', 'aceptado', 'preparando', 'listo')
      GROUP BY o.id, ua.id
      ORDER BY
        CASE WHEN o.status = 'listo' THEN 0 ELSE 1 END,
        COALESCE(o.pickup_at, o.created_at) ASC,
        o.id ASC
    `);

    res.json(result.rows.map((order) => ({
      ...order,
      total: Number(order.total)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo pedidos de mostrador" });
  }
});

router.patch("/orders/:id/deliver", auth, counterRoles, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Pedido inválido" });
    }

    const result = await pool.query(`
      UPDATE orders
      SET status = 'entregado'
      WHERE id = $1
        AND table_session_id IS NULL
        AND status = 'listo'
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      return res.status(409).json({ message: "El pedido no está listo para entregar" });
    }

    const order = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", order);
      io.emit("orders-updated", order);
      io.emit("counter-updated", order);
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marcando pedido como entregado" });
  }
});

module.exports = router;
