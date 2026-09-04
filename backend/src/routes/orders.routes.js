const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const pool = require("../db");

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

router.get(
  "/admin/all",
  auth,
  roles(["cocina", "admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          o.*,
          u.name,
          u.phone,
          ua.address,
          ua.details,
          COALESCE(
            json_agg(
              json_build_object(
                'product_id', oi.product_id,
                'quantity', oi.quantity
              )
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN user_addresses ua ON ua.id = o.address_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id, u.id, ua.id
        ORDER BY o.created_at DESC
      `);

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error obteniendo pedidos" });
    }
  }
);

router.post("/", auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      items,
      type,
      payment_method = null,
      address_id = null
    } = req.body;

    const userId = req.user.id;
    const today = getTodayKey();

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No hay productos en el pedido" });
    }

    const menuResult = await client.query(
      "SELECT product_id FROM menu WHERE day = $1",
      [today]
    );
    const todayMenu = new Set(menuResult.rows.map((row) => Number(row.product_id)));

    if (todayMenu.size === 0) {
      return res.status(400).json({ message: "No hay menú configurado para hoy" });
    }

    let total = 0;
    const normalizedItems = [];

    for (const rawItem of items) {
      const productId = Number(rawItem.product_id);
      const quantity = Number(rawItem.quantity);

      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "El pedido contiene cantidades inválidas" });
      }

      const result = await client.query(
        "SELECT id, name, price, available FROM products WHERE id = $1",
        [productId]
      );
      const product = result.rows[0];

      if (!product) {
        return res.status(404).json({ message: `Producto ${productId} no existe` });
      }
      if (!todayMenu.has(Number(product.id))) {
        return res.status(400).json({ message: `Producto fuera del menú: ${product.name}` });
      }
      if (!product.available) {
        return res.status(400).json({ message: `Producto agotado: ${product.name}` });
      }

      total += Number(product.price) * quantity;
      normalizedItems.push({ product_id: productId, quantity });
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `
        INSERT INTO orders
          (user_id, type, total, status, payment_method, address_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [userId, type || "local", total, "pendiente", payment_method, address_id]
    );

    const order = orderResult.rows[0];

    for (const item of normalizedItems) {
      await client.query(
        `
          INSERT INTO order_items (order_id, product_id, quantity)
          VALUES ($1, $2, $3)
        `,
        [order.id, item.product_id, item.quantity]
      );
    }

    await client.query("COMMIT");

    const io = req.app.get("io");
    if (io) io.emit("new-order", order);

    res.status(201).json(order);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // La transacción puede no haber iniciado todavía.
    }
    console.error(err);
    res.status(500).json({ message: "Error creando pedido" });
  } finally {
    client.release();
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
        SELECT
          o.*,
          COALESCE(
            json_agg(
              json_build_object(
                'product_id', oi.product_id,
                'quantity', oi.quantity
              )
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo pedidos" });
  }
});

router.patch(
  "/:id/status",
  auth,
  roles(["cocina", "admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const allowed = [
        "pendiente",
        "aceptado",
        "preparando",
        "listo",
        "entregado",
        "cancelado"
      ];

      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Estado inválido" });
      }

      const result = await pool.query(
        "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
        [status, id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "Pedido no encontrado" });
      }

      const updatedOrder = result.rows[0];
      const io = req.app.get("io");
      if (io) io.emit("order-updated", updatedOrder);

      res.json(updatedOrder);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error actualizando pedido" });
    }
  }
);

router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";

    const result = await pool.query(
      `
        UPDATE orders
        SET status = 'cancelado'
        WHERE id = $1
          AND LOWER(status) = 'pendiente'
          AND ($2::boolean = true OR user_id = $3)
        RETURNING *
      `,
      [id, isAdmin, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(400).json({ message: "No se puede cancelar este pedido" });
    }

    const updatedOrder = result.rows[0];
    const io = req.app.get("io");
    if (io) io.emit("order-updated", updatedOrder);

    res.json({ message: "Pedido cancelado", order: updatedOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error cancelando pedido" });
  }
});

module.exports = router;
