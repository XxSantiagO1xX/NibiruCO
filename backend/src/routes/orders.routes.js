const express = require("express");
const router = express.Router();

/* MIDDLEWARES */
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

/* DB */
const pool = require("../db");

/* MENÚ */
const weeklyMenu = require("../data/menu");

/* DÍA ACTUAL */
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

/* TODOS LOS PEDIDOS (ADMIN / COCINA) */
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

LEFT JOIN users u
  ON u.id = o.user_id

LEFT JOIN user_addresses ua
  ON ua.id = o.address_id

LEFT JOIN order_items oi
  ON oi.order_id = o.id

GROUP BY
  o.id,
  u.id,
  ua.id

ORDER BY o.created_at DESC
      `);

      res.json(result.rows);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        message: "Error obteniendo pedidos"
      });
    }
  }
);

/* CREAR PEDIDO */
router.post("/", auth, async (req, res) => {

  const client = await pool.connect();

  try {

    const {
      items,
      type,
      payment_method,
      address_id,
    } = req.body;

    const userId = req.user.id;

    const today = getTodayKey();

    const todayMenu = weeklyMenu[today] || [];

    if (!items || !items.length) {

      return res.status(400).json({
        message: "No hay productos en el pedido"
      });
    }

    if (todayMenu.length === 0) {

      return res.status(400).json({
        message: "No hay menú configurado para hoy"
      });
    }

    let total = 0;

    /* VALIDAR PRODUCTOS */
    for (let item of items) {

      const result = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [item.product_id]
      );

      const product = result.rows[0];

      if (!product) {

        return res.status(404).json({
          message: "Producto no existe"
        });
      }

      if (!todayMenu.includes(product.id)) {

        return res.status(400).json({
          message:
            `Producto fuera del menú: ${product.name}`
        });
      }

      if (!product.available) {

        return res.status(400).json({
          message:
            `Producto agotado: ${product.name}`
        });
      }

      total += product.price * item.quantity;
    }

    await client.query("BEGIN");

    /* CREAR PEDIDO */
    const orderResult = await client.query(
      `
      INSERT INTO orders
      (
        user_id,
        type,
        total,
        status,
        payment_method,
        address_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        userId,
        type,
        total,
        "pendiente",
        payment_method,
        address_id || null

      ]
    );

    const order = orderResult.rows[0];

    /* ITEMS */
    for (let item of items) {

      await client.query(
        `
        INSERT INTO order_items
        (
          order_id,
          product_id,
          quantity
        )
        VALUES ($1, $2, $3)
        `,
        [
          order.id,
          item.product_id,
          item.quantity
        ]
      );
    }

    await client.query("COMMIT");

    /* SOCKET */
    const io = req.app.get("io");

    io.emit("new-order", order);

    res.json(order);

  } catch (err) {

    await client.query("ROLLBACK");

    console.error(err);

    res.status(500).json({
      message: "Error creando pedido"
    });

  } finally {

    client.release();
  }
});

/* PEDIDOS DEL USUARIO */
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
      LEFT JOIN order_items oi
        ON oi.order_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Error obteniendo pedidos"
    });
  }
});

/* CAMBIAR STATUS */
router.patch("/:id/status", async (req, res) => {

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

      return res.status(400).json({
        message: "Estado inválido"
      });
    }

    const result = await pool.query(
      `
      UPDATE orders
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    if (!result.rows.length) {

      return res.status(404).json({
        message: "Pedido no encontrado"
      });
    }

    const updatedOrder = result.rows[0];

    const io = req.app.get("io");

    io.emit("order-updated", updatedOrder);

    res.json(updatedOrder);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Error actualizando pedido"
    });
  }
});

/* CANCELAR PEDIDO */
router.patch("/:id/cancel", auth, async (req, res) => {

  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE orders
      SET status = 'cancelado'
      WHERE id = $1
      AND LOWER(status) = 'pendiente'
      RETURNING *
      `,
      [id]
    );

    if (!result.rows.length) {

      return res.status(400).json({
        message: "No se puede cancelar"
      });
    }

    const updatedOrder = result.rows[0];

    const io = req.app.get("io");

    io.emit("order-updated", updatedOrder);

    res.json({
      message: "Pedido cancelado",
      order: updatedOrder
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Error cancelando pedido"
    });
  }
});

module.exports = router;