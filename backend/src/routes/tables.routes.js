const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");

const waiterRoles = roles(["mesero", "admin"]);
const adminOnly = roles(["admin"]);

async function getSessionSummary(sessionId, client = pool) {
  const sessionResult = await client.query(`
    SELECT
      s.*,
      t.name AS table_name,
      t.zone,
      COALESCE((
        SELECT SUM(o.total)
        FROM orders o
        WHERE o.table_session_id = s.id
          AND o.status <> 'cancelado'
      ), 0)::numeric AS total,
      COALESCE((
        SELECT SUM(p.amount)
        FROM table_payments p
        WHERE p.table_session_id = s.id
      ), 0)::numeric AS paid
    FROM table_sessions s
    JOIN restaurant_tables t ON t.id = s.table_id
    WHERE s.id = $1
  `, [sessionId]);

  if (!sessionResult.rows.length) return null;
  const session = sessionResult.rows[0];
  session.total = Number(session.total);
  session.paid = Number(session.paid);
  session.balance = Math.max(0, session.total - session.paid);

  const ordersResult = await client.query(`
    SELECT
      o.id,
      o.status,
      o.total,
      o.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'product_id', oi.product_id,
            'name', p.name,
            'quantity', oi.quantity,
            'price', p.price
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.table_session_id = $1
      AND o.status <> 'cancelado'
    GROUP BY o.id
    ORDER BY o.created_at ASC
  `, [sessionId]);

  const paymentsResult = await client.query(`
    SELECT id, amount, method, created_at
    FROM table_payments
    WHERE table_session_id = $1
    ORDER BY created_at ASC
  `, [sessionId]);

  return {
    ...session,
    orders: ordersResult.rows,
    payments: paymentsResult.rows.map((payment) => ({
      ...payment,
      amount: Number(payment.amount)
    }))
  };
}

router.get("/", auth, waiterRoles, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.*,
        s.id AS session_id,
        s.status AS session_status,
        s.opened_at,
        COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelado'), 0)::numeric AS running_total
      FROM restaurant_tables t
      LEFT JOIN table_sessions s
        ON s.table_id = t.id
       AND s.status IN ('open', 'account_requested')
      LEFT JOIN orders o ON o.table_session_id = s.id
      WHERE t.active = TRUE
      GROUP BY t.id, s.id
      ORDER BY COALESCE(t.zone, ''), t.sort_order, t.name
    `);

    res.json(result.rows.map((row) => ({
      ...row,
      running_total: Number(row.running_total)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo mesas" });
  }
});

router.get("/admin/all", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.*,
        s.id AS session_id,
        s.status AS session_status
      FROM restaurant_tables t
      LEFT JOIN table_sessions s
        ON s.table_id = t.id
       AND s.status IN ('open', 'account_requested')
      ORDER BY COALESCE(t.zone, ''), t.sort_order, t.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo mesas" });
  }
});

router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const zone = String(req.body.zone || "").trim() || null;
    const capacity = req.body.capacity === "" || req.body.capacity == null ? null : Number(req.body.capacity);
    const sortOrder = Number(req.body.sort_order) || 0;

    if (!name) return res.status(400).json({ message: "El nombre de la mesa es obligatorio" });
    if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) {
      return res.status(400).json({ message: "Capacidad inválida" });
    }

    const result = await pool.query(`
      INSERT INTO restaurant_tables (name, zone, capacity, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, zone, capacity, sortOrder]);

    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe una mesa con ese nombre" });
    console.error(err);
    res.status(500).json({ message: "Error creando mesa" });
  }
});

router.patch("/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Mesa inválida" });

    const currentResult = await pool.query("SELECT * FROM restaurant_tables WHERE id = $1", [id]);
    if (!currentResult.rows.length) return res.status(404).json({ message: "Mesa no encontrada" });
    const current = currentResult.rows[0];

    const name = req.body.name === undefined ? current.name : String(req.body.name || "").trim();
    const zone = req.body.zone === undefined ? current.zone : (String(req.body.zone || "").trim() || null);
    const capacity = req.body.capacity === undefined
      ? current.capacity
      : (req.body.capacity === "" || req.body.capacity == null ? null : Number(req.body.capacity));
    const active = req.body.active === undefined ? current.active : Boolean(req.body.active);
    const sortOrder = req.body.sort_order === undefined ? current.sort_order : (Number(req.body.sort_order) || 0);

    if (!name) return res.status(400).json({ message: "El nombre de la mesa es obligatorio" });
    if (capacity !== null && (!Number.isInteger(Number(capacity)) || Number(capacity) <= 0)) {
      return res.status(400).json({ message: "Capacidad inválida" });
    }

    if (!active) {
      const activeSession = await pool.query(`
        SELECT 1 FROM table_sessions
        WHERE table_id = $1 AND status IN ('open', 'account_requested')
      `, [id]);
      if (activeSession.rows.length) {
        return res.status(409).json({ message: "No puedes desactivar una mesa con cuenta abierta" });
      }
    }

    const result = await pool.query(`
      UPDATE restaurant_tables
      SET name = $1, zone = $2, capacity = $3, active = $4, sort_order = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [name, zone, capacity, active, sortOrder, id]);

    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe una mesa con ese nombre" });
    console.error(err);
    res.status(500).json({ message: "Error actualizando mesa" });
  }
});

router.post("/:id/open", auth, waiterRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const tableId = Number(req.params.id);
    await client.query("BEGIN");
    const tableResult = await client.query("SELECT * FROM restaurant_tables WHERE id = $1 FOR UPDATE", [tableId]);
    const table = tableResult.rows[0];
    if (!table || !table.active) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Mesa no disponible" });
    }

    const activeResult = await client.query(`
      SELECT * FROM table_sessions
      WHERE table_id = $1 AND status IN ('open', 'account_requested')
      ORDER BY id DESC LIMIT 1
    `, [tableId]);

    let session = activeResult.rows[0];
    if (!session) {
      const created = await client.query(`
        INSERT INTO table_sessions (table_id, opened_by, status)
        VALUES ($1, $2, 'open')
        RETURNING *
      `, [tableId, req.user.id]);
      session = created.rows[0];
    }

    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.json({ ...session, table_name: table.name, zone: table.zone });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error(err);
    res.status(500).json({ message: "Error abriendo mesa" });
  } finally {
    client.release();
  }
});

router.get("/sessions/:sessionId/check", auth, waiterRoles, async (req, res) => {
  try {
    const summary = await getSessionSummary(Number(req.params.sessionId));
    if (!summary) return res.status(404).json({ message: "Cuenta no encontrada" });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo cuenta" });
  }
});

router.post("/sessions/:sessionId/request-account", auth, waiterRoles, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE table_sessions
      SET status = 'account_requested', account_requested_at = NOW()
      WHERE id = $1 AND status = 'open'
      RETURNING *
    `, [Number(req.params.sessionId)]);

    if (!result.rows.length) {
      return res.status(409).json({ message: "La mesa ya tiene cuenta solicitada o está cerrada" });
    }

    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.json(await getSessionSummary(result.rows[0].id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error solicitando cuenta" });
  }
});

router.post("/sessions/:sessionId/reopen", auth, waiterRoles, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE table_sessions
      SET status = 'open', account_requested_at = NULL
      WHERE id = $1 AND status = 'account_requested'
      RETURNING *
    `, [Number(req.params.sessionId)]);

    if (!result.rows.length) return res.status(409).json({ message: "La cuenta no se puede reabrir" });
    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.json(await getSessionSummary(result.rows[0].id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error reabriendo cuenta" });
  }
});

router.post("/sessions/:sessionId/payments", auth, waiterRoles, async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.sessionId);
    const amount = Number(req.body.amount);
    const method = String(req.body.method || "").toLowerCase();
    const allowedMethods = ["efectivo", "tarjeta", "transferencia", "otro"];

    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Monto inválido" });
    if (!allowedMethods.includes(method)) return res.status(400).json({ message: "Método de pago inválido" });

    await client.query("BEGIN");
    const lock = await client.query("SELECT * FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const session = lock.rows[0];
    if (!session || session.status === "closed") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La cuenta ya está cerrada" });
    }

    const totalResult = await client.query(`
      SELECT COALESCE(SUM(total), 0)::numeric AS total
      FROM orders
      WHERE table_session_id = $1 AND status <> 'cancelado'
    `, [sessionId]);
    const paidResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS paid
      FROM table_payments
      WHERE table_session_id = $1
    `, [sessionId]);

    const total = Number(totalResult.rows[0].total);
    const paid = Number(paidResult.rows[0].paid);
    const balance = Math.max(0, total - paid);

    if (total <= 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La mesa no tiene consumos por cobrar" });
    }
    if (amount > balance + 0.009) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El pago supera el saldo pendiente" });
    }

    await client.query(`
      INSERT INTO table_payments (table_session_id, amount, method, registered_by)
      VALUES ($1, $2, $3, $4)
    `, [sessionId, amount, method, req.user.id]);

    const remaining = Math.max(0, balance - amount);
    if (remaining < 0.01) {
      await client.query(`
        UPDATE table_sessions
        SET status = 'closed', closed_at = NOW()
        WHERE id = $1
      `, [sessionId]);
    } else if (session.status === "open") {
      await client.query(`
        UPDATE table_sessions
        SET status = 'account_requested', account_requested_at = COALESCE(account_requested_at, NOW())
        WHERE id = $1
      `, [sessionId]);
    }

    await client.query("COMMIT");
    const io = req.app.get("io");
    if (io) io.emit("tables-updated");
    res.json(await getSessionSummary(sessionId));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error(err);
    res.status(500).json({ message: "Error registrando pago" });
  } finally {
    client.release();
  }
});

module.exports = router;
