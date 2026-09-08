const express = require("express");
const router = express.Router();

/* MIDDLEWARES */
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

/* DB */
const pool = require("../db");

/* OBTENER DÍA ACTUAL */
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

/* NORMALIZAR TIPO DE PEDIDO */
function normalizeOrderType(type) {
  if (!type) return "local";
  const t = type.toString().toLowerCase().trim();
  if (t === "llevar" || t === "pickup") return "pickup";
  if (t === "domicilio" || t === "delivery") return "delivery";
  if (t === "local") return "local";
  return "local";
}

/* 1. TODOS LOS PEDIDOS (ADMIN / COCINA / KDS) */
const getAdminOrdersHandler = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.*,
        u.name AS user_name,
        u.phone AS user_phone,
        ua.address AS delivery_address,
        ua.details AS address_details,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', oi.product_id,
              'name', p.name,
              'price', p.price,
              'quantity', oi.quantity
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN user_addresses ua ON ua.id = o.address_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      GROUP BY o.id, u.id, ua.id
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET ADMIN ORDERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo pedidos de cocina" });
  }
};

router.get("/admin/all", auth, roles(["cocina", "admin"]), getAdminOrdersHandler);
router.get("/all", auth, roles(["cocina", "admin"]), getAdminOrdersHandler);

/* 2. CREAR PEDIDO */
router.post("/", auth, async (req, res) => {
  const {
    items,
    type,
    payment_method,
    address_id
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "No hay productos en el pedido"
    });
  }

  const userId = req.user.id;
  const normalizedType = normalizeOrderType(type);
  const normalizedPayment = payment_method === "card" ? "card" : "cash";
  const today = getTodayKey();

  let client;
  try {
    client = await pool.connect();

    // 1. Obtener menú de hoy desde PostgreSQL
    const menuResult = await client.query(
      "SELECT product_id FROM menu WHERE LOWER(day) = $1",
      [today]
    );

    const todayMenuIds = menuResult.rows.map(r => Number(r.product_id));

    if (todayMenuIds.length === 0) {
      return res.status(400).json({
        message: "No hay menú configurado para el día de hoy"
      });
    }

    let total = 0;
    const validatedItems = [];

    // 2. Validar cada producto
    for (const item of items) {
      const pId = Number(item.product_id);
      const qty = parseInt(item.quantity, 10);

      if (!pId || isNaN(qty) || qty <= 0) {
        return res.status(400).json({
          message: "Formato de producto o cantidad inválido"
        });
      }

      const prodResult = await client.query(
        "SELECT * FROM products WHERE id = $1",
        [pId]
      );

      const product = prodResult.rows[0];

      if (!product) {
        return res.status(404).json({
          message: `El producto ID ${pId} no existe`
        });
      }

      if (!todayMenuIds.includes(product.id)) {
        return res.status(400).json({
          message: `El producto '${product.name}' no está incluido en el menú de hoy`
        });
      }

      if (!product.available) {
        return res.status(400).json({
          message: `El producto '${product.name}' está agotado`
        });
      }

      const itemSubtotal = Number(product.price) * qty;
      total += itemSubtotal;

      validatedItems.push({
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: qty
      });
    }

    // Si es entrega a domicilio, validar dirección
    let validAddressId = null;
    if (normalizedType === "delivery" && address_id) {
      const addrResult = await client.query(
        "SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2",
        [address_id, userId]
      );
      if (addrResult.rows.length) {
        validAddressId = addrResult.rows[0].id;
      }
    }

    await client.query("BEGIN");

    // 3. Insertar orden
    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, type, total, status, payment_method, address_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        normalizedType,
        total,
        "pendiente",
        normalizedPayment,
        validAddressId
      ]
    );

    const order = orderResult.rows[0];

    // 4. Insertar items de la orden
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity)
         VALUES ($1, $2, $3)`,
        [order.id, item.product_id, item.quantity]
      );
    }

    await client.query("COMMIT");

    order.items = validatedItems;

    // 5. Emitir evento por WebSockets
    const io = req.app.get("io");
    if (io) {
      io.emit("new-order", order);
    }

    res.status(201).json(order);

  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ message: "Error interno al crear el pedido" });

  } finally {
    if (client) client.release();
  }
});

/* 3. PEDIDOS DEL USUARIO AUTENTICADO */
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
        o.*,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', oi.product_id,
              'name', p.name,
              'price', p.price,
              'quantity', oi.quantity
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC`,
      [userId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("GET USER ORDERS ERROR:", err);
    res.status(500).json({ message: "Error obteniendo pedidos del usuario" });
  }
});

/* 4. ACTUALIZAR ESTADO DE PEDIDO (PROTEGIDO: COCINA / ADMIN) */
router.patch("/:id/status", auth, roles(["cocina", "admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pendiente",
      "aceptado",
      "preparando",
      "listo",
      "entregado",
      "cancelado"
    ];

    if (!status || !allowedStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        message: `Estado inválido. Estados permitidos: ${allowedStatuses.join(", ")}`
      });
    }

    const normalizedStatus = status.toLowerCase();

    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [normalizedStatus, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const updatedOrder = result.rows[0];

    // Emitir evento WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", updatedOrder);
    }

    res.json(updatedOrder);

  } catch (err) {
    console.error("UPDATE ORDER STATUS ERROR:", err);
    res.status(500).json({ message: "Error actualizando estado del pedido" });
  }
});

/* 5. CANCELAR PEDIDO */
router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Solo el dueño del pedido o un admin/cocina pueden cancelarlo
    let query = `
      UPDATE orders
      SET status = 'cancelado'
      WHERE id = $1
        AND LOWER(status) = 'pendiente'
    `;
    const params = [id];

    if (userRole !== "admin" && userRole !== "cocina") {
      query += " AND user_id = $2";
      params.push(userId);
    }

    query += " RETURNING *";

    const result = await pool.query(query, params);

    if (!result.rows.length) {
      return res.status(400).json({
        message: "No se puede cancelar el pedido (ya fue procesado o no existe)"
      });
    }

    const updatedOrder = result.rows[0];

    const io = req.app.get("io");
    if (io) {
      io.emit("order-updated", updatedOrder);
    }

    res.json({
      message: "Pedido cancelado exitosamente",
      order: updatedOrder
    });

  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);
    res.status(500).json({ message: "Error cancelando pedido" });
  }
});

module.exports = router;