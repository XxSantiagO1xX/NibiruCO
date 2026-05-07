const express = require("express");
const router = express.Router();

// Middlewares
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

// DB
const pool = require("../db");

// IMPORTAR menú (solo validación)
const weeklyMenu = require("../data/menu");

// Obtener día actual
function getTodayKey() {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  
  return days[new Date().getDay()];

  console.log("🔥 HOY ES:", today);

  return today;
}


// 🔥 TODOS LOS PEDIDOS (COCINA / ADMIN)
router.get("/all", auth, roles(["cocina", "admin"]), async (req, res) => {
  try {
    const result = await pool.query(`
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
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo pedidos" });
  }
});


// 🔥 CREAR PEDIDO
router.post("/", auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { items, type } = req.body;
    const userId = req.user.id;

    const today = getTodayKey();
    const todayMenu = weeklyMenu[today] || [];

    if (!items || !items.length) {
      return res.status(400).json({ message: "No hay productos en el pedido" });
    }

    if (todayMenu.length === 0) {
      return res.status(400).json({
        message: "No hay menú configurado para hoy"
      });
    }

    let total = 0;

    // Validación contra DB
    for (let item of items) {
      const result = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [item.product_id]
      );

      const product = result.rows[0];

      if (!product) {
        return res.status(404).json({ message: "Producto no existe" });
      }

      if (!todayMenu.includes(product.id)) {
        return res.status(400).json({
          message: `Producto fuera del menú de hoy: ${product.name}`
        });
      }

      if (!product.available) {
        return res.status(400).json({
          message: `Producto agotado: ${product.name}`
        });
      }

      total += product.price * item.quantity;
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      "INSERT INTO orders (user_id, type, total) VALUES ($1, $2, $3) RETURNING *",
      [userId, type, total]
    );

    const order = orderResult.rows[0];

    for (let item of items) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)",
        [order.id, item.product_id, item.quantity]
      );
    }

    await client.query("COMMIT");

    // 🔥 WEBSOCKET (CORRECTO)
    const io = req.app.get("io");
    io.emit("new-order", order);

    res.json(order);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Error creando pedido" });
  } finally {
    client.release();
  }
});


// 🔥 PEDIDOS DEL USUARIO
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
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
    `, [userId]);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo pedidos" });
  }
});


// 🔥 MARCAR COMO ENTREGADO
router.patch("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "UPDATE orders SET status = 'entregado' WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const updatedOrder = result.rows[0];

    // 🔥 WEBSOCKET
    const io = req.app.get("io");
    io.emit("order-updated", updatedOrder);

    res.json(updatedOrder);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error actualizando pedido" });
  }
});

module.exports = router;